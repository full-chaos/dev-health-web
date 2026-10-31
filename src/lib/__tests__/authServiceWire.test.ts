import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logSessionBranch } from "@/lib/authSessionLog";
import {
    callAuthService,
    passwordLogin,
    resetKeySetCacheForTests,
    revokeSessionAtAuthService,
    type WireConfig,
} from "@/lib/authServiceWire";

vi.mock("@/lib/authSessionLog", () => ({
    logSessionBranch: vi.fn(),
    thrownErrorName: (e: unknown) => (e instanceof Error ? e.name : typeof e),
}));

const BACKEND = "http://auth.test";
const JWKS_URL = `${BACKEND}/.well-known/jwks.json`;
const SUB = "prn_AAAAAAAAAAAAAAAAAAAAAA";
const SID = "ses_AAAAAAAAAAAAAAAAAAAAAQ";
const EXP = 1760000600;
const NOW = 1760000300;
const ISSUER = "https://auth.example.test";

const enc = new TextEncoder();
const b64u = (b: Uint8Array | string) =>
    Buffer.from(typeof b === "string" ? enc.encode(b) : b).toString("base64url");

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const other = generateKeyPairSync("ed25519");
const jwk = (kid: string, key = publicKey) => ({
    kty: "OKP",
    crv: "Ed25519",
    alg: "EdDSA",
    use: "sig",
    kid,
    x: key.export({ format: "jwk" }).x,
});
const jwksDoc = (...keys: unknown[]) => JSON.stringify({ keys });

function eddsaToken(signer = privateKey, kid = "kid-1"): string {
    const h = JSON.stringify({ alg: "EdDSA", typ: "at+jwt", kid });
    const p = JSON.stringify({
        iss: ISSUER,
        aud: "dev-health-api",
        sub: SUB,
        principal_type: "human",
        sid: SID,
        jti: "000000000000000000000001",
        iat: 1760000000,
        nbf: 1760000000,
        exp: EXP,
        scope: "api:access",
    });
    const input = `${b64u(h)}.${b64u(p)}`;
    return `${input}.${b64u(sign(null, Buffer.from(input), signer))}`;
}
const hs256Token = () =>
    `${b64u('{"alg":"HS256","typ":"JWT"}')}.${b64u(JSON.stringify({ sub: "u1", sid: SID, exp: EXP }))}.${b64u("sig")}`;

const user = {
    id: "u1",
    email: "a@example.test",
    org_id: "o1",
    role: "admin",
    is_superuser: false,
};
const loginBody = (access: string) => ({
    access_token: access,
    refresh_token: "ref-1",
    token_type: "bearer",
    expires_in: 3600,
    needs_onboarding: false,
    user,
});

const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const fetchMock = vi.fn();
const cfg = (over: Partial<WireConfig> = {}): WireConfig => ({
    tokenClassRaw: undefined,
    issuer: undefined,
    backendUrl: BACKEND,
    nowSeconds: () => NOW,
    ...over,
});
const eddsaCfg = () => cfg({ tokenClassRaw: "eddsa", issuer: ISSUER });
const creds = { email: "a@example.test", password: "pw", org_id: "o1" };

beforeEach(() => {
    vi.mocked(logSessionBranch).mockClear();
    fetchMock.mockReset();
    resetKeySetCacheForTests();
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function route(routes: Record<string, () => Response | Promise<Response>>) {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        const handler = routes[url];
        if (!handler) throw new Error(`unexpected fetch ${url}`);
        return handler();
    });
}
const calls = (url: string) => fetchMock.mock.calls.filter(([u]) => String(u) === url);

describe("passwordLogin", () => {
    it("login sends email, password and org_id to /api/v1/auth/login", async () => {
        route({ [`${BACKEND}/api/v1/auth/login`]: () => json(200, loginBody(hs256Token())) });
        await passwordLogin(creds, cfg());
        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(init.method).toBe("POST");
        expect(JSON.parse(String(init.body))).toEqual({
            email: "a@example.test",
            password: "pw",
            org_id: "o1",
        });
    });

    it("class hs256_compat: login reads exp and sid from the token and fetches no key set", async () => {
        route({ [`${BACKEND}/api/v1/auth/login`]: () => json(200, loginBody(hs256Token())) });
        const got = await passwordLogin(creds, cfg({ tokenClassRaw: "hs256_compat" }));
        expect(got).toMatchObject({ kind: "ok", accessExp: EXP, sid: SID, refreshToken: "ref-1" });
        expect(calls(JWKS_URL)).toHaveLength(0);
    });

    it("unset class is hs256_compat at login", async () => {
        route({ [`${BACKEND}/api/v1/auth/login`]: () => json(200, loginBody(hs256Token())) });
        expect(await passwordLogin(creds, cfg())).toMatchObject({ kind: "ok", accessExp: EXP });
        expect(calls(JWKS_URL)).toHaveLength(0);
    });

    it("class hs256_compat: an access token that does not decode is refused at login", async () => {
        route({ [`${BACKEND}/api/v1/auth/login`]: () => json(200, loginBody("not-a-token")) });
        expect(await passwordLogin(creds, cfg())).toEqual({ kind: "invalid_credentials" });
    });

    it("an unknown AUTH_ACCESS_TOKEN_CLASS makes login unavailable and calls no backend", async () => {
        const got = await passwordLogin(creds, cfg({ tokenClassRaw: "EdDSA" }));
        expect(got).toEqual({ kind: "unavailable" });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("class eddsa: login verifies the token against the published key set and keeps sid and exp", async () => {
        route({
            [`${BACKEND}/api/v1/auth/login`]: () => json(200, loginBody(eddsaToken())),
            [JWKS_URL]: () => new Response(jwksDoc(jwk("kid-1"))),
        });
        expect(await passwordLogin(creds, eddsaCfg())).toMatchObject({
            kind: "ok",
            accessExp: EXP,
            sid: SID,
            sub: SUB,
        });
    });

    it("class eddsa: a token signed by an unlisted key is refused at login", async () => {
        route({
            [`${BACKEND}/api/v1/auth/login`]: () =>
                json(200, loginBody(eddsaToken(other.privateKey))),
            [JWKS_URL]: () => new Response(jwksDoc(jwk("kid-1"))),
        });
        expect(await passwordLogin(creds, eddsaCfg())).toEqual({ kind: "invalid_credentials" });
    });

    it("class eddsa: an HS256 token is refused at login", async () => {
        route({
            [`${BACKEND}/api/v1/auth/login`]: () => json(200, loginBody(hs256Token())),
            [JWKS_URL]: () => new Response(jwksDoc(jwk("kid-1"))),
        });
        expect(await passwordLogin(creds, eddsaCfg())).toEqual({ kind: "invalid_credentials" });
    });

    it("class eddsa: an unreachable key set makes login unavailable, not a credential refusal", async () => {
        route({
            [`${BACKEND}/api/v1/auth/login`]: () => json(200, loginBody(eddsaToken())),
            [JWKS_URL]: () => new Response("down", { status: 503 }),
        });
        expect(await passwordLogin(creds, eddsaCfg())).toEqual({ kind: "unavailable" });
    });

    it("class eddsa: a key set with a repeated kid makes login unavailable", async () => {
        route({
            [`${BACKEND}/api/v1/auth/login`]: () => json(200, loginBody(eddsaToken())),
            [JWKS_URL]: () => new Response(jwksDoc(jwk("kid-1"), jwk("kid-1", other.publicKey))),
        });
        expect(await passwordLogin(creds, eddsaCfg())).toEqual({ kind: "unavailable" });
    });

    it("class eddsa: a missing issuer config makes login unavailable and calls no backend", async () => {
        const got = await passwordLogin(creds, cfg({ tokenClassRaw: "eddsa" }));
        expect(got).toEqual({ kind: "unavailable" });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("the key set is fetched once within the ttl and again after it", async () => {
        let now = NOW;
        route({
            [`${BACKEND}/api/v1/auth/login`]: () => json(200, loginBody(eddsaToken())),
            [JWKS_URL]: () => new Response(jwksDoc(jwk("kid-1"))),
        });
        const c = { ...eddsaCfg(), nowSeconds: () => now };
        await passwordLogin(creds, c);
        await passwordLogin(creds, c);
        expect(calls(JWKS_URL)).toHaveLength(1);
        now = NOW + 299;
        await passwordLogin(creds, c);
        expect(calls(JWKS_URL)).toHaveLength(1);
        now = NOW + 301;
        await passwordLogin(creds, { ...c });
        expect(calls(JWKS_URL)).toHaveLength(2);
    });

    it("login maps 401, the two 429 forms, the verification answer and 503", async () => {
        const login = `${BACKEND}/api/v1/auth/login`;
        route({ [login]: () => json(401, { detail: { message: "Invalid credentials" } }) });
        expect(await passwordLogin(creds, cfg())).toEqual({ kind: "invalid_credentials" });
        route({
            [login]: () => json(429, { detail: { message: "locked", retry_after_seconds: 9 } }),
        });
        expect(await passwordLogin(creds, cfg())).toEqual({ kind: "account_locked" });
        route({ [login]: () => json(429, { detail: { message: "slow" } }) });
        expect(await passwordLogin(creds, cfg())).toEqual({ kind: "rate_limited" });
        route({ [login]: () => json(200, { status: "email_verification_required" }) });
        expect(await passwordLogin(creds, cfg())).toEqual({ kind: "email_verification_required" });
        route({ [login]: () => json(503, { detail: { message: "down" } }) });
        expect(await passwordLogin(creds, cfg())).toEqual({ kind: "unavailable" });
    });

    it("a thrown login call is unavailable", async () => {
        fetchMock.mockRejectedValue(new TypeError("fetch failed"));
        expect(await passwordLogin(creds, cfg())).toEqual({ kind: "unavailable" });
    });

    it("login does not read or keep session_access_token", async () => {
        route({
            [`${BACKEND}/api/v1/auth/login`]: () =>
                json(200, { ...loginBody(hs256Token()), session_access_token: "svc-token-value" }),
        });
        const got = await passwordLogin(creds, cfg());
        expect(JSON.stringify(got)).not.toContain("svc-token-value");
        expect(got).not.toHaveProperty("sessionAccessToken");
    });

    it("a refused login carries no token text", async () => {
        route({ [`${BACKEND}/api/v1/auth/login`]: () => json(200, loginBody("not-a-token")) });
        expect(JSON.stringify(await passwordLogin(creds, cfg()))).not.toContain("ref-1");
    });
});

describe("revokeSessionAtAuthService", () => {
    const logout = `${BACKEND}/api/v1/auth/logout`;

    it("logout sends only the refresh token in the body and the access token as the Bearer", async () => {
        route({ [logout]: () => json(200, { message: "ok" }) });
        const got = await revokeSessionAtAuthService({ access: "acc-1", refresh: "ref-1" }, cfg());
        expect(got).toEqual({ kind: "revoked" });
        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(JSON.parse(String(init.body))).toEqual({ refresh_token: "ref-1" });
        expect((init.headers as Record<string, string>).Authorization).toBe("Bearer acc-1");
    });

    it("logout 503, 401 and a thrown call are failed", async () => {
        route({ [logout]: () => json(503, {}) });
        expect(await revokeSessionAtAuthService({ access: "a", refresh: "r" }, cfg())).toEqual({
            kind: "failed",
        });
        route({ [logout]: () => json(401, {}) });
        expect(await revokeSessionAtAuthService({ access: "a", refresh: "r" }, cfg())).toEqual({
            kind: "failed",
        });
        fetchMock.mockRejectedValue(new TypeError("fetch failed"));
        expect(await revokeSessionAtAuthService({ access: "a", refresh: "r" }, cfg())).toEqual({
            kind: "failed",
        });
    });
});

describe("callAuthService", () => {
    it("answers with the status and the parsed JSON body, or no body when it is not JSON", async () => {
        fetchMock.mockResolvedValueOnce(json(200, { a: 1 }));
        expect(await callAuthService(`${BACKEND}/x`, { method: "POST" })).toEqual({
            status: 200,
            body: { a: 1 },
        });
        fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 502 }));
        expect(await callAuthService(`${BACKEND}/x`, { method: "POST" })).toEqual({
            status: 502,
            body: undefined,
        });
    });

    it("answers thrown when the call throws", async () => {
        fetchMock.mockRejectedValue(new TypeError("fetch failed"));
        expect(await callAuthService(`${BACKEND}/x`, { method: "POST" })).toEqual({ thrown: true });
    });
});

describe("login branches name themselves in the log", () => {
    const lines = () => vi.mocked(logSessionBranch).mock.calls.map(([fields]) => fields);

    it("an unavailable login logs login_unavailable with the status only", async () => {
        route({
            [`${BACKEND}/api/v1/auth/login`]: () => json(503, { detail: { message: "down" } }),
        });
        await passwordLogin(creds, cfg());
        expect(lines()).toEqual([{ operation: "login", branch: "login_unavailable", status: 503 }]);
    });

    it("a thrown login call logs login_unavailable with the error name", async () => {
        fetchMock.mockRejectedValue(new TypeError("fetch failed"));
        await passwordLogin(creds, cfg());
        expect(lines()).toEqual([
            { operation: "login", branch: "login_unavailable", errorName: "TypeError" },
        ]);
    });

    it("a refused access token logs login_invalid_response", async () => {
        route({ [`${BACKEND}/api/v1/auth/login`]: () => json(200, loginBody("not-a-token")) });
        await passwordLogin(creds, cfg());
        expect(lines()).toEqual([{ operation: "login", branch: "login_invalid_response" }]);
    });

    it("a 200 without both tokens logs login_invalid_response", async () => {
        route({ [`${BACKEND}/api/v1/auth/login`]: () => json(200, { user }) });
        await passwordLogin(creds, cfg());
        expect(lines()).toEqual([{ operation: "login", branch: "login_invalid_response" }]);
    });

    it("an unknown class and a missing issuer log auth_config_invalid", async () => {
        await passwordLogin(creds, cfg({ tokenClassRaw: "nope" }));
        await passwordLogin(creds, cfg({ tokenClassRaw: "eddsa" }));
        expect(lines()).toEqual([
            { operation: "login", branch: "auth_config_invalid" },
            { operation: "login", branch: "auth_config_invalid" },
        ]);
    });

    it("an unreachable or invalid key set logs key_set_unusable", async () => {
        route({
            [`${BACKEND}/api/v1/auth/login`]: () => json(200, loginBody(eddsaToken())),
            [JWKS_URL]: () => new Response("down", { status: 503 }),
        });
        await passwordLogin(creds, eddsaCfg());
        expect(lines()).toEqual([{ operation: "login", branch: "key_set_unusable", status: 503 }]);
    });

    it("a failed logout logs logout_failed with the status only", async () => {
        route({ [`${BACKEND}/api/v1/auth/logout`]: () => json(503, {}) });
        await revokeSessionAtAuthService({ access: "acc-1", refresh: "ref-1" }, cfg());
        expect(lines()).toEqual([{ operation: "logout", branch: "logout_failed", status: 503 }]);
    });

    it("no log line holds a token, an address or a password", async () => {
        route({ [`${BACKEND}/api/v1/auth/login`]: () => json(200, loginBody("tok-secret-value")) });
        await passwordLogin({ ...creds, password: "pw-secret-value" }, cfg());
        const text = JSON.stringify(lines());
        for (const secret of ["tok-secret-value", "pw-secret-value", "a@example.test", "ref-1"]) {
            expect(text).not.toContain(secret);
        }
    });
});
