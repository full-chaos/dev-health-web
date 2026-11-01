import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logSessionBranch } from "@/lib/authSessionLog";
import {
    passwordLogin,
    readAnswerTokens,
    refreshSession,
    resetKeySetCacheForTests,
    type WireConfig,
} from "@/lib/authServiceWire";

// CHAOS-10876 C1: session_access_token (aud auth-service) is read with the access token under class
// eddsa, kept apart from it, and never read under hs256_compat.

vi.mock("@/lib/authSessionLog", () => ({
    logSessionBranch: vi.fn(),
    thrownErrorName: (e: unknown) => (e instanceof Error ? e.name : typeof e),
}));

const BACKEND = "http://auth.test";
const ISSUER = "https://auth.example.test";
const DISCOVERY_URL = `${ISSUER}/.well-known/openid-configuration`;
const JWKS_URL = `${ISSUER}/.well-known/jwks.json`;
const SUB = "prn_AAAAAAAAAAAAAAAAAAAAAA";
const OTHER_SUB = "prn_CCCCCCCCCCCCCCCCCCCCCC";
const ACTOR = "prn_BBBBBBBBBBBBBBBBBBBBBB";
const SID = "ses_AAAAAAAAAAAAAAAAAAAAAQ";
const OTHER_SID = "ses_AAAAAAAAAAAAAAAAAAAABB";
const NOW = 1760000300;
const EXP = 1760003600;

const enc = new TextEncoder();
const b64u = (b: Uint8Array | string) =>
    Buffer.from(typeof b === "string" ? enc.encode(b) : b).toString("base64url");

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const stranger = generateKeyPairSync("ed25519");
const jwk = (kid: string) => ({
    kty: "OKP",
    crv: "Ed25519",
    alg: "EdDSA",
    use: "sig",
    kid,
    x: publicKey.export({ format: "jwk" }).x,
});

interface Mint {
    aud?: string;
    scope?: string;
    sid?: string;
    sub?: string;
    exp?: number;
    act?: string;
    kid?: string;
    signer?: typeof privateKey;
    alg?: string;
}
function mint(opts: Mint = {}): string {
    const aud = opts.aud ?? "dev-health-api";
    const h = JSON.stringify({ alg: opts.alg ?? "EdDSA", typ: "at+jwt", kid: opts.kid ?? "kid-1" });
    const p = JSON.stringify({
        iss: ISSUER,
        aud,
        sub: opts.sub ?? SUB,
        principal_type: "human",
        sid: opts.sid ?? SID,
        jti: "000000000000000000000001",
        iat: 1760000000,
        nbf: 1760000000,
        exp: opts.exp ?? EXP,
        scope: opts.scope ?? (aud === "auth-service" ? "auth:session" : "api:access"),
        ...(opts.act === undefined ? {} : { act: { sub: opts.act } }),
    });
    const input = `${b64u(h)}.${b64u(p)}`;
    return `${input}.${b64u(sign(null, Buffer.from(input), opts.signer ?? privateKey))}`;
}
const access = (o: Mint = {}) => mint(o);
const service = (o: Mint = {}) => mint({ aud: "auth-service", ...o });
const hs256 = () =>
    `${b64u('{"alg":"HS256","typ":"JWT"}')}.${b64u(JSON.stringify({ sub: "u1", sid: SID, exp: EXP }))}.${b64u("sig")}`;

const user = {
    id: "u1",
    email: "a@example.test",
    org_id: "o1",
    role: "admin",
    is_superuser: false,
};
const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fetchMock = vi.fn();
let now = NOW;
const cfg = (over: Partial<WireConfig> = {}): WireConfig => ({
    tokenClassRaw: "eddsa",
    issuer: ISSUER,
    backendUrl: BACKEND,
    nowSeconds: () => now,
    ...over,
});
const hsCfg = () => cfg({ tokenClassRaw: "hs256_compat", issuer: undefined });
const discovery = () =>
    new Response(
        JSON.stringify({
            issuer: ISSUER,
            jwks_uri: JWKS_URL,
            id_token_signing_alg_values_supported: ["EdDSA"],
        }),
    );
const keys = () => new Response(JSON.stringify({ keys: [jwk("kid-1")] }));

function route(extra: Record<string, () => Response | Promise<Response>> = {}) {
    const routes: Record<string, () => Response | Promise<Response>> = {
        [DISCOVERY_URL]: discovery,
        [JWKS_URL]: keys,
        ...extra,
    };
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
        const handler = routes[String(input)];
        if (!handler) throw new Error(`unexpected fetch ${String(input)}`);
        return handler();
    });
}
const calls = (url: string) => fetchMock.mock.calls.filter(([u]) => String(u) === url);
const logged = () => vi.mocked(logSessionBranch).mock.calls.map(([f]) => f);

beforeEach(() => {
    now = NOW;
    vi.mocked(logSessionBranch).mockClear();
    fetchMock.mockReset();
    resetKeySetCacheForTests();
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const read = (accessToken: string, sessionAccessToken: unknown, c = cfg()) =>
    readAnswerTokens({ accessToken, sessionAccessToken }, c, "login");
const refusedSession = { ok: false, reason: "refused", cause: "session" };

describe("readAnswerTokens, class eddsa", () => {
    it("class eddsa: the session token is read with aud auth-service and kept with its exp", async () => {
        route();
        const tok = service();
        expect(await read(access(), tok)).toMatchObject({
            ok: true,
            accessExp: EXP,
            sid: SID,
            session: { kind: "ok", token: tok, exp: EXP, sid: SID },
        });
    });

    it("class eddsa: a session token with the wrong audience is refused", async () => {
        route();
        expect(await read(access(), access())).toEqual(refusedSession);
        expect(logged()).toEqual([{ operation: "login", branch: "session_token_unverified" }]);
    });

    it("class eddsa: a session token that fails verification is refused", async () => {
        route();
        expect(await read(access(), service({ signer: stranger.privateKey }))).toEqual(
            refusedSession,
        );
        expect(logged()).toEqual([{ operation: "login", branch: "session_token_unverified" }]);
    });

    it("class eddsa: a session token with another sid is refused", async () => {
        route();
        expect(await read(access(), service({ sid: OTHER_SID }))).toEqual(refusedSession);
        expect(logged()).toEqual([{ operation: "login", branch: "session_token_sid_mismatch" }]);
    });

    it("class eddsa: a session token with another sub is refused", async () => {
        route();
        expect(await read(access(), service({ sub: OTHER_SUB }))).toEqual(refusedSession);
        expect(logged()).toEqual([{ operation: "login", branch: "session_token_sub_mismatch" }]);
    });

    it("class eddsa: a session token whose exp is later than the access token's is refused (must equal)", async () => {
        route();
        expect(await read(access({ exp: EXP - 100 }), service({ exp: EXP - 99 }))).toEqual(
            refusedSession,
        );
        expect(logged()).toEqual([{ operation: "login", branch: "session_token_exp_mismatch" }]);
    });

    it("class eddsa: a session token whose exp is earlier than the access token's is refused (must equal)", async () => {
        route();
        expect(await read(access(), service({ exp: EXP - 1 }))).toEqual(refusedSession);
        expect(logged()).toEqual([{ operation: "login", branch: "session_token_exp_mismatch" }]);
    });

    it("class eddsa: a session token with a non-EdDSA alg is refused", async () => {
        route();
        expect(await read(access(), service({ alg: "HS256" }))).toEqual(refusedSession);
        expect(logged()).toEqual([{ operation: "login", branch: "session_token_unverified" }]);
    });

    it("class eddsa: a session token with a kid the key list lacks is refused without a second key refresh", async () => {
        route();
        expect(await read(access(), service({ kid: "kid-9" }))).toEqual(refusedSession);
        expect(calls(JWKS_URL)).toHaveLength(1);
        expect(calls(DISCOVERY_URL)).toHaveLength(1);
    });

    it("class eddsa: a session token that is not a non-empty string is refused as malformed", async () => {
        for (const value of ["", 7, null, {}, [], true]) {
            vi.mocked(logSessionBranch).mockClear();
            route();
            expect(await read(access(), value), JSON.stringify(value)).toEqual(refusedSession);
            expect(logged()).toEqual([{ operation: "login", branch: "session_token_malformed" }]);
        }
    });

    it("class eddsa: an absent session token is accepted and counted as session_token_missing", async () => {
        route();
        expect(await read(access(), undefined)).toMatchObject({
            ok: true,
            session: { kind: "absent" },
        });
        expect(logged()).toEqual([{ operation: "login", branch: "session_token_missing" }]);
    });

    it("class eddsa: the verified act is returned apart from sub, and is null when the claim is absent", async () => {
        route();
        const got = await read(access({ act: ACTOR }), service());
        expect(got).toMatchObject({ ok: true, sub: SUB, actor: ACTOR });
        expect(JSON.stringify({ sub: got.ok && got.sub, org: got.ok && got.orgId })).not.toContain(
            ACTOR,
        );
        expect(await read(access(), service())).toMatchObject({ ok: true, actor: null });
    });

    it("class eddsa: the actor is read from the access token only, not from the session token", async () => {
        route();
        expect(await read(access(), service({ act: ACTOR }))).toMatchObject({
            ok: true,
            actor: null,
        });
    });

    it("an answer with members this function does not know is read the same way (an SSO-shaped answer)", async () => {
        route();
        const answer = {
            accessToken: access(),
            sessionAccessToken: service(),
            provider: "oidc",
            is_new_user: true,
        };
        expect(await readAnswerTokens(answer as never, cfg(), "login")).toMatchObject({
            ok: true,
            session: { kind: "ok" },
        });
    });

    it("no log line holds a token, a session id or an actor id", async () => {
        route();
        await read(access({ act: ACTOR }), service({ sid: OTHER_SID }));
        await read(access(), undefined);
        const text = JSON.stringify(logged());
        for (const secret of [SID, OTHER_SID, ACTOR, SUB, "eyJ"])
            expect(text).not.toContain(secret);
    });
});

describe("readAnswerTokens, class hs256_compat", () => {
    it("class hs256_compat: a present session token is ignored, never stored, counted as session_token_ignored", async () => {
        for (const value of [service(), "garbage", 7, null, ""]) {
            vi.mocked(logSessionBranch).mockClear();
            const got = await read(hs256(), value, hsCfg());
            expect(got, JSON.stringify(value)).toMatchObject({
                ok: true,
                session: { kind: "ignored" },
            });
            expect(logged()).toEqual([{ operation: "login", branch: "session_token_ignored" }]);
        }
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("class hs256_compat: an absent session token keeps today's path with no extra log line", async () => {
        expect(await read(hs256(), undefined, hsCfg())).toMatchObject({
            ok: true,
            session: { kind: "absent" },
        });
        expect(logged()).toEqual([]);
    });
});

describe("passwordLogin with a session token", () => {
    const loginUrl = `${BACKEND}/api/v1/auth/login`;
    const loginAnswer = (accessToken: string, extra: Record<string, unknown> = {}) =>
        json(200, {
            access_token: accessToken,
            refresh_token: "ref-1",
            expires_in: 3600,
            needs_onboarding: false,
            user,
            ...extra,
        });
    const creds = { email: "a@example.test", password: "pw" };

    it("login under eddsa keeps the session token, its exp and the verified actor", async () => {
        const tok = service();
        route({
            [loginUrl]: () => loginAnswer(access({ act: ACTOR }), { session_access_token: tok }),
        });
        expect(await passwordLogin(creds, cfg())).toMatchObject({
            kind: "ok",
            sessionAccessToken: tok,
            sessionExp: EXP,
            actorSub: ACTOR,
        });
    });

    it("a refused session token on login gives invalid_credentials, the uniform answer, with the branch only in the log", async () => {
        route({
            [loginUrl]: () =>
                loginAnswer(access(), { session_access_token: service({ sid: OTHER_SID }) }),
        });
        const got = await passwordLogin(creds, cfg());
        expect(got).toEqual({ kind: "invalid_credentials" });
        expect(logged()).toEqual([{ operation: "login", branch: "session_token_sid_mismatch" }]);
    });

    it("login under eddsa with no session token is accepted and counted", async () => {
        route({ [loginUrl]: () => loginAnswer(access()) });
        const got = await passwordLogin(creds, cfg());
        expect(got).toMatchObject({ kind: "ok" });
        expect(got).not.toHaveProperty("sessionAccessToken");
        expect(logged()).toEqual([{ operation: "login", branch: "session_token_missing" }]);
    });

    it("a session token never appears in the login result under hs256_compat", async () => {
        route({
            [loginUrl]: () => loginAnswer(hs256(), { session_access_token: "svc-token-value" }),
        });
        const got = await passwordLogin(creds, hsCfg());
        expect(JSON.stringify(got)).not.toContain("svc-token-value");
        expect(got).not.toHaveProperty("sessionAccessToken");
    });
});

describe("refreshSession with a session token", () => {
    const refreshUrl = `${BACKEND}/api/v1/auth/refresh`;
    const rotated = (accessToken: string, extra: Record<string, unknown> = {}) =>
        json(200, {
            access_token: accessToken,
            refresh_token: "ref-2",
            expires_in: 3600,
            user,
            ...extra,
        });

    it("refresh under eddsa carries the session token, its exp and the verified actor", async () => {
        const tok = service();
        route({
            [refreshUrl]: () => rotated(access({ act: ACTOR }), { session_access_token: tok }),
        });
        expect(await refreshSession("ref-1", cfg())).toMatchObject({
            kind: "rotated",
            refreshToken: "ref-2",
            sessionAccessToken: tok,
            sessionExp: EXP,
            actorSub: ACTOR,
        });
    });

    it("refresh under eddsa with no session token rotates without one", async () => {
        route({ [refreshUrl]: () => rotated(access()) });
        const got = await refreshSession("ref-1", cfg());
        expect(got).toMatchObject({ kind: "rotated" });
        expect(got).not.toHaveProperty("sessionAccessToken");
        expect(logged()).toEqual([{ operation: "refresh", branch: "session_token_missing" }]);
    });

    it("a refused session token on refresh is terminal", async () => {
        route({
            [refreshUrl]: () =>
                rotated(access({ exp: EXP - 100 }), {
                    session_access_token: service({ exp: EXP - 95 }),
                }),
        });
        expect(await refreshSession("ref-1", cfg())).toEqual({
            kind: "terminal",
            reason: "token_refused",
        });
        expect(logged()).toEqual([{ operation: "refresh", branch: "session_token_exp_mismatch" }]);
    });

    it("refresh under hs256_compat ignores a present session token and counts it", async () => {
        route({
            [refreshUrl]: () => rotated(hs256(), { session_access_token: "svc-token-value" }),
        });
        const got = await refreshSession("ref-1", hsCfg());
        expect(JSON.stringify(got)).not.toContain("svc-token-value");
        expect(logged()).toEqual([{ operation: "refresh", branch: "session_token_ignored" }]);
    });
});
