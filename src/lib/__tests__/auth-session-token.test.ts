import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// CHAOS-10876: the credentials provider reaches auth-service through the wire module, and the jwt
// callback takes expiry and session id from the issued access token.

const { nextAuthConfig } = vi.hoisted(() => ({ nextAuthConfig: { value: null as unknown } }));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next-auth", () => ({
    default: vi.fn((config: unknown) => {
        nextAuthConfig.value = config;
        return {
            auth: vi.fn(),
            handlers: { GET: vi.fn(), POST: vi.fn() },
            signIn: vi.fn(),
            signOut: vi.fn(),
        };
    }),
    CredentialsSignin: class CredentialsSignin extends Error {
        code = "credentials";
    },
}));
vi.mock("next-auth/providers/credentials", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/github", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/gitlab", () => ({ default: vi.fn() }));
vi.mock("@/lib/origin", () => ({ getBackendUrl: () => "http://backend.test" }));
vi.mock("@/lib/logger", () => {
    const l = {
        trace: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        fatal: vi.fn(),
        child: vi.fn(),
    };
    l.child.mockReturnValue(l);
    return { logger: l };
});

import "@/lib/auth";
import { generateKeyPairSync, sign } from "node:crypto";
import { resetKeySetCacheForTests } from "@/lib/authServiceWire";

// CHAOS-10876 C1: the sealed session keeps session_access_token (and the verified actor) beside the
// access token, replaces or clears them with it, and hands the session callback no actor.

const ISSUER = "https://auth.example.test";
const SUB = "prn_AAAAAAAAAAAAAAAAAAAAAA";
const ACTOR = "prn_BBBBBBBBBBBBBBBBBBBBBB";
const SID = "ses_AAAAAAAAAAAAAAAAAAAAAQ";
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const b64 = (s: string) => Buffer.from(s).toString("base64url");

function mint(aud: string, exp: number, extra: Record<string, unknown> = {}): string {
    const nowS = Math.floor(Date.now() / 1000);
    const h = b64(JSON.stringify({ alg: "EdDSA", typ: "at+jwt", kid: "kid-1" }));
    const p = b64(
        JSON.stringify({
            iss: ISSUER,
            aud,
            sub: SUB,
            principal_type: "human",
            sid: SID,
            jti: "000000000000000000000001",
            iat: nowS - 10,
            nbf: nowS - 10,
            exp,
            scope: aud === "auth-service" ? "auth:session" : "api:access",
            ...extra,
        }),
    );
    return `${h}.${p}.${Buffer.from(sign(null, Buffer.from(`${h}.${p}`), privateKey)).toString("base64url")}`;
}
const keysResponse = () =>
    new Response(
        JSON.stringify({
            keys: [
                {
                    kty: "OKP",
                    crv: "Ed25519",
                    alg: "EdDSA",
                    use: "sig",
                    kid: "kid-1",
                    x: publicKey.export({ format: "jwk" }).x,
                },
            ],
        }),
    );
const discoveryResponse = () =>
    new Response(
        JSON.stringify({
            issuer: ISSUER,
            jwks_uri: `${ISSUER}/.well-known/jwks.json`,
            id_token_signing_alg_values_supported: ["EdDSA"],
        }),
    );

type Token = Record<string, unknown>;
type Jwt = (p: {
    token: Token;
    user?: Record<string, unknown> | null;
    account?: Record<string, unknown> | null;
}) => Promise<Token>;
const jwt = (): Jwt => (nextAuthConfig.value as { callbacks: { jwt: Jwt } }).callbacks.jwt;
type SessionCb = (p: {
    session: { user: Record<string, unknown> } & Record<string, unknown>;
    token: Token;
}) => Promise<Record<string, unknown>>;
const sessionCb = (): SessionCb =>
    (nextAuthConfig.value as { callbacks: { session: SessionCb } }).callbacks.session;

const withSession = (over: Token = {}): Token => ({
    id: "user-1",
    access_token: "old-access",
    refresh_token: "old-refresh",
    session_access_token: "old-service-token",
    session_expires_at: 1,
    act_sub: "prn_OLDOLDOLDOLDOLDOLDOLDO",
    expires_at: Date.now() - 1000,
    last_validated: Date.now(),
    ...over,
});
const answer = (status: number, body: unknown = {}) =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;
const fetchMock = vi.fn();

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    resetKeySetCacheForTests();
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

function eddsaBackend(refreshAnswer: () => Response) {
    vi.stubEnv("AUTH_ACCESS_TOKEN_CLASS", "eddsa");
    vi.stubEnv("AUTH_ACCESS_TOKEN_ISSUER", ISSUER);
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/v1/auth/refresh")) return refreshAnswer();
        if (url.endsWith("/.well-known/openid-configuration")) return discoveryResponse();
        if (url.endsWith("/.well-known/jwks.json")) return keysResponse();
        throw new Error(`unexpected fetch ${url}`);
    });
}

describe("the sealed token keeps the session token beside the access token", () => {
    it("(f1) the jwt callback stores session_access_token, session_expires_at and act_sub on login", async () => {
        const out = await jwt()({
            token: {},
            user: {
                id: "u1",
                access_token: "acc",
                refresh_token: "ref",
                access_exp: Math.floor(Date.now() / 1000) + 3000,
                session_access_token: "svc",
                session_exp: Math.floor(Date.now() / 1000) + 3000,
                act_sub: ACTOR,
            },
        });
        expect(out.session_access_token).toBe("svc");
        expect(out.session_expires_at).toBe(out.expires_at as number);
        expect(out.act_sub).toBe(ACTOR);
    });

    it("(f1b) a login without a session token leaves none in the sealed token", async () => {
        const out = await jwt()({
            token: { session_access_token: "left-over", act_sub: "prn_LEFTLEFTLEFTLEFTLEFTLE" },
            user: { id: "u1", access_token: "acc", refresh_token: "ref", expires_in: 3600 },
        });
        expect(out.session_access_token).toBeUndefined();
        expect(out.act_sub).toBeUndefined();
    });

    it("(f2) a refresh replaces the session token, its expiry and the actor with the new ones", async () => {
        const exp = Math.floor(Date.now() / 1000) + 3000;
        const svc = mint("auth-service", exp);
        eddsaBackend(() =>
            answer(200, {
                access_token: mint("dev-health-api", exp, { act: { sub: ACTOR } }),
                refresh_token: "rotated",
                expires_in: 3000,
                session_access_token: svc,
                user: { id: "user-1" },
            }),
        );
        const out = await jwt()({ token: withSession(), user: null, account: null });
        expect(out.session_access_token).toBe(svc);
        expect(out.session_expires_at).toBe(exp * 1000);
        expect(out.act_sub).toBe(ACTOR);
        expect(out.refresh_token).toBe("rotated");
    });

    it("(f2b) a refresh whose answer has no session token clears the stored one: no stale Bearer", async () => {
        const exp = Math.floor(Date.now() / 1000) + 3000;
        eddsaBackend(() =>
            answer(200, {
                access_token: mint("dev-health-api", exp),
                refresh_token: "rotated",
                expires_in: 3000,
                user: { id: "user-1" },
            }),
        );
        const out = await jwt()({ token: withSession(), user: null, account: null });
        expect(out.session_access_token).toBeUndefined();
        expect(out.session_expires_at).toBeUndefined();
        expect(out.act_sub).toBeUndefined();
    });

    it("(f3) a transient refresh failure drops the session token with the access token", async () => {
        fetchMock.mockResolvedValue(answer(503));
        const out = await jwt()({ token: withSession(), user: null, account: null });
        expect(out.access_token).toBeUndefined();
        expect(out.session_access_token).toBeUndefined();
        expect(out.session_expires_at).toBeUndefined();
        expect(out.act_sub).toBeUndefined();
        expect(out.refresh_token).toBe("old-refresh");
    });

    it("(f4) a terminal refresh clears the session token with both tokens", async () => {
        fetchMock.mockResolvedValue(answer(401));
        const out = await jwt()({ token: withSession(), user: null, account: null });
        expect(out.access_token).toBeUndefined();
        expect(out.refresh_token).toBeUndefined();
        expect(out.session_access_token).toBeUndefined();
        expect(out.act_sub).toBeUndefined();
    });

    it("(f4b) a refused session token on refresh is terminal and clears everything", async () => {
        const exp = Math.floor(Date.now() / 1000) + 3000;
        eddsaBackend(() =>
            answer(200, {
                access_token: mint("dev-health-api", exp),
                refresh_token: "rotated",
                session_access_token: mint("auth-service", exp + 9),
            }),
        );
        const out = await jwt()({ token: withSession(), user: null, account: null });
        expect(out.error).toBe("refresh_failed");
        expect(out.session_access_token).toBeUndefined();
        expect(out.refresh_token).toBeUndefined();
    });

    it("(f6) a social exchange that sets a new access token drops the stored session token", async () => {
        fetchMock.mockResolvedValue(
            answer(200, {
                access_token: "social-access",
                refresh_token: "social-refresh",
                expires_in: 3600,
                user: { id: "u9", org_id: "o9", role: "member" },
            }),
        );
        const out = await jwt()({
            token: withSession({ expires_at: Date.now() + 3600_000 }),
            user: null,
            account: { provider: "github", access_token: "gh-token" },
        });
        expect(out.access_token).toBe("social-access");
        expect(out.session_access_token).toBeUndefined();
        expect(out.act_sub).toBeUndefined();
    });

    it("(f7) the session callback puts session_access_token on the in-process session and never the actor", async () => {
        const out = await sessionCb()({
            session: { user: {} },
            token: { id: "u1", access_token: "acc", session_access_token: "svc", act_sub: ACTOR },
        });
        expect(out.session_access_token).toBe("svc");
        const text = JSON.stringify(out);
        expect(text).not.toContain(ACTOR);
        expect(text).not.toContain("act_sub");
    });

    it("(f7b) the session callback sets no session_access_token when the token has none", async () => {
        const out = await sessionCb()({
            session: { user: {} },
            token: { id: "u1", access_token: "acc" },
        });
        expect(out.session_access_token).toBeUndefined();
    });
});
