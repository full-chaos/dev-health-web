import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logSessionBranch } from "@/lib/authSessionLog";
import {
    callAuthService,
    passwordLogin,
    refreshSession,
    resetKeySetCacheForTests,
    revokeSessionAtAuthService,
    type WireConfig,
} from "@/lib/authServiceWire";

vi.mock("@/lib/authSessionLog", () => ({
    logSessionBranch: vi.fn(),
    thrownErrorName: (e: unknown) => (e instanceof Error ? e.name : typeof e),
}));

const BACKEND = "http://auth.test";
const SUB = "prn_AAAAAAAAAAAAAAAAAAAAAA";
const SID = "ses_AAAAAAAAAAAAAAAAAAAAAQ";
const EXP = 1760000600;
const NOW = 1760000300;
const ISSUER = "https://auth.example.test";
const DISCOVERY_URL = `${ISSUER}/.well-known/openid-configuration`;
const JWKS_URL = `${ISSUER}/.well-known/jwks.json`;

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

function eddsaToken(signer = privateKey, kid = "kid-1", exp = EXP): string {
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
        exp,
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

function route(routes: Record<string, (init?: RequestInit) => Response | Promise<Response>>) {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const handler = routes[url];
        if (!handler) throw new Error(`unexpected fetch ${url}`);
        return handler(init);
    });
}
const discoveryDoc = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
        issuer: ISSUER,
        jwks_uri: JWKS_URL,
        id_token_signing_alg_values_supported: ["EdDSA"],
        ...over,
    });
// The two reads of one key refresh: discovery at the pinned issuer, then the key set it names.
function keyRoutes(
    jwks: () => Response,
    discovery: () => Response = () => new Response(discoveryDoc()),
) {
    return { [DISCOVERY_URL]: discovery, [JWKS_URL]: jwks };
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
            ...keyRoutes(() => new Response(jwksDoc(jwk("kid-1")))),
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
            ...keyRoutes(() => new Response(jwksDoc(jwk("kid-1")))),
        });
        expect(await passwordLogin(creds, eddsaCfg())).toEqual({ kind: "invalid_credentials" });
    });

    it("class eddsa: an HS256 token is refused at login", async () => {
        route({
            [`${BACKEND}/api/v1/auth/login`]: () => json(200, loginBody(hs256Token())),
            ...keyRoutes(() => new Response(jwksDoc(jwk("kid-1")))),
        });
        expect(await passwordLogin(creds, eddsaCfg())).toEqual({ kind: "invalid_credentials" });
    });

    it("class eddsa: an unreachable key set makes login unavailable, not a credential refusal", async () => {
        route({
            [`${BACKEND}/api/v1/auth/login`]: () => json(200, loginBody(eddsaToken())),
            ...keyRoutes(() => new Response("down", { status: 503 })),
        });
        expect(await passwordLogin(creds, eddsaCfg())).toEqual({ kind: "unavailable" });
    });

    it("class eddsa: a key set with a repeated kid makes login unavailable", async () => {
        route({
            [`${BACKEND}/api/v1/auth/login`]: () => json(200, loginBody(eddsaToken())),
            ...keyRoutes(() => new Response(jwksDoc(jwk("kid-1"), jwk("kid-1", other.publicKey)))),
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
            ...keyRoutes(() => new Response(jwksDoc(jwk("kid-1")))),
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

    it("an access token of the wrong shape logs token_shape_refused, a fixed branch with no token text", async () => {
        route({ [`${BACKEND}/api/v1/auth/login`]: () => json(200, loginBody("not-a-token")) });
        await passwordLogin(creds, cfg());
        expect(lines()).toEqual([{ operation: "login", branch: "token_shape_refused" }]);
        route({
            [`${BACKEND}/api/v1/auth/login`]: () => json(200, loginBody(eddsaToken())),
        });
        vi.mocked(logSessionBranch).mockClear();
        await passwordLogin(creds, cfg());
        expect(lines()).toEqual([{ operation: "login", branch: "token_shape_refused" }]);
    });

    it("a token that fails verification under eddsa logs login_invalid_response", async () => {
        route({
            [`${BACKEND}/api/v1/auth/login`]: () =>
                json(200, loginBody(eddsaToken(other.privateKey))),
            ...keyRoutes(() => new Response(jwksDoc(jwk("kid-1")))),
        });
        await passwordLogin(creds, eddsaCfg());
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
            ...keyRoutes(() => new Response("down", { status: 503 })),
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

describe("the published key source (eddsa)", () => {
    const LONG_EXP = 1760003600;
    let now = NOW;
    const c = () => ({ ...eddsaCfg(), nowSeconds: () => now });
    const loginWith = (token: string) =>
        route({
            [`${BACKEND}/api/v1/auth/login`]: () => json(200, loginBody(token)),
            ...keyRoutes(() => new Response(jwksDoc(jwk("kid-1")))),
        });
    const tok = (kid = "kid-1", signer = privateKey) => eddsaToken(signer, kid, LONG_EXP);
    const fetchesOf = (url: string) => calls(url).length;

    beforeEach(() => {
        now = NOW;
    });

    it("reads discovery at the pinned issuer, then the key set it names, and follows no redirect", async () => {
        loginWith(tok());
        expect(await passwordLogin(creds, c())).toMatchObject({ kind: "ok" });
        expect(fetchesOf(DISCOVERY_URL)).toBe(1);
        expect(fetchesOf(JWKS_URL)).toBe(1);
        for (const url of [DISCOVERY_URL, JWKS_URL]) {
            const [, init] = calls(url)[0] as [string, RequestInit];
            expect(init.redirect).toBe("manual");
            expect(init.method).toBe("GET");
        }
    });

    it("refuses a discovery document of another issuer: no usable keys, so login is unavailable", async () => {
        const other = "https://other.example.test";
        route({
            [`${BACKEND}/api/v1/auth/login`]: () => json(200, loginBody(tok())),
            ...keyRoutes(
                () => new Response(jwksDoc(jwk("kid-1"))),
                () =>
                    new Response(
                        discoveryDoc({ issuer: other, jwks_uri: `${other}/.well-known/jwks.json` }),
                    ),
            ),
        });
        expect(await passwordLogin(creds, c())).toEqual({ kind: "unavailable" });
        expect(fetchesOf(JWKS_URL)).toBe(0);
    });

    it("refuses a discovery document whose jwks_uri is not the issuer plus the fixed path", async () => {
        const elsewhere = "https://other.example.test/.well-known/jwks.json";
        route({
            [`${BACKEND}/api/v1/auth/login`]: () => json(200, loginBody(tok())),
            ...keyRoutes(
                () => new Response(jwksDoc(jwk("kid-1"))),
                () => new Response(discoveryDoc({ jwks_uri: elsewhere })),
            ),
            [elsewhere]: () => new Response(jwksDoc(jwk("kid-1"))),
        });
        expect(await passwordLogin(creds, c())).toEqual({ kind: "unavailable" });
        expect(fetchesOf(elsewhere)).toBe(0);
        expect(fetchesOf(JWKS_URL)).toBe(0);
    });

    it("treats a redirect from discovery as a failure and never fetches the Location", async () => {
        const target = "https://elsewhere.example.test/x";
        route({
            [`${BACKEND}/api/v1/auth/login`]: () => json(200, loginBody(tok())),
            ...keyRoutes(
                () => new Response(jwksDoc(jwk("kid-1"))),
                () => new Response(null, { status: 302, headers: { location: target } }),
            ),
            [target]: () => new Response(discoveryDoc()),
        });
        expect(await passwordLogin(creds, c())).toEqual({ kind: "unavailable" });
        expect(fetchesOf(target)).toBe(0);
        expect(fetchesOf(JWKS_URL)).toBe(0);
    });

    it("treats a redirect from the key set as a failure", async () => {
        const target = "https://elsewhere.example.test/jwks";
        route({
            [`${BACKEND}/api/v1/auth/login`]: () => json(200, loginBody(tok())),
            ...keyRoutes(() => new Response(null, { status: 301, headers: { location: target } })),
            [target]: () => new Response(jwksDoc(jwk("kid-1"))),
        });
        expect(await passwordLogin(creds, c())).toEqual({ kind: "unavailable" });
        expect(fetchesOf(target)).toBe(0);
    });

    it("reads the keys once within the 300 s ttl and again after it", async () => {
        loginWith(tok());
        await passwordLogin(creds, c());
        now = NOW + 299;
        await passwordLogin(creds, c());
        expect(fetchesOf(JWKS_URL)).toBe(1);
        now = NOW + 301;
        await passwordLogin(creds, c());
        expect(fetchesOf(JWKS_URL)).toBe(2);
    });

    it("makes no fetch for an unknown kid within 30 s of the last attempt, and refuses the token", async () => {
        loginWith(tok("kid-2", other.privateKey));
        await passwordLogin(creds, c()); // the first read of the keys: an attempt at NOW
        now = NOW + 29;
        expect(await passwordLogin(creds, c())).toEqual({ kind: "invalid_credentials" });
        expect(fetchesOf(JWKS_URL)).toBe(1);
    });

    it("makes exactly one refresh for an unknown kid after the floor, and accepts a kid that refresh publishes", async () => {
        let published = jwksDoc(jwk("kid-1"));
        route({
            [`${BACKEND}/api/v1/auth/login`]: () =>
                json(200, loginBody(tok("kid-2", other.privateKey))),
            ...keyRoutes(() => new Response(published)),
        });
        await passwordLogin(creds, c()); // keys: kid-1 only; kid-2 unknown, floor holds the refresh
        published = jwksDoc(jwk("kid-1"), jwk("kid-2", other.publicKey));
        now = NOW + 31;
        expect(await passwordLogin(creds, c())).toMatchObject({ kind: "ok" });
        expect(fetchesOf(JWKS_URL)).toBe(2);
    });

    it("refuses a kid that is still unknown after the one refresh, as a terminal answer, and does not retry it", async () => {
        loginWith(tok("kid-2", other.privateKey));
        await passwordLogin(creds, c());
        now = NOW + 31;
        expect(await passwordLogin(creds, c())).toEqual({ kind: "invalid_credentials" });
        expect(fetchesOf(JWKS_URL)).toBe(2);
        now = NOW + 40;
        expect(await passwordLogin(creds, c())).toEqual({ kind: "invalid_credentials" });
        expect(fetchesOf(JWKS_URL)).toBe(2);
    });

    it("keeps the last good keys for 10 minutes past the ttl when the fetch fails, then login is unavailable", async () => {
        let up = true;
        route({
            [`${BACKEND}/api/v1/auth/login`]: () => json(200, loginBody(tok())),
            ...keyRoutes(() =>
                up ? new Response(jwksDoc(jwk("kid-1"))) : new Response("x", { status: 503 }),
            ),
        });
        await passwordLogin(creds, c());
        up = false;
        now = NOW + 301;
        expect(await passwordLogin(creds, c())).toMatchObject({ kind: "ok" });
        now = NOW + 300 + 599;
        expect(await passwordLogin(creds, c())).toMatchObject({ kind: "ok" });
        now = NOW + 300 + 601;
        expect(await passwordLogin(creds, c())).toEqual({ kind: "unavailable" });
    });

    it("makes at most one key fetch per 30 s while the keys are past the ttl and the fetch keeps failing", async () => {
        let up = true;
        route({
            [`${BACKEND}/api/v1/auth/login`]: () => json(200, loginBody(tok())),
            ...keyRoutes(() =>
                up ? new Response(jwksDoc(jwk("kid-1"))) : new Response("x", { status: 503 }),
            ),
        });
        await passwordLogin(creds, c());
        up = false;
        now = NOW + 301;
        await passwordLogin(creds, c());
        expect(fetchesOf(JWKS_URL)).toBe(2);
        now = NOW + 320;
        await passwordLogin(creds, c());
        expect(fetchesOf(JWKS_URL)).toBe(2);
        now = NOW + 332;
        await passwordLogin(creds, c());
        expect(fetchesOf(JWKS_URL)).toBe(3);
    });

    it("with no usable keys and a failed fetch, login is unavailable", async () => {
        route({
            [`${BACKEND}/api/v1/auth/login`]: () => json(200, loginBody(tok())),
            ...keyRoutes(() => new Response("x", { status: 503 })),
        });
        expect(await passwordLogin(creds, c())).toEqual({ kind: "unavailable" });
    });
});

describe("the clock is read again after the key read (eddsa)", () => {
    const LONG_EXP = 1760003600;
    let now = NOW;
    const c = () => ({ ...eddsaCfg(), nowSeconds: () => now });
    const goodKeys = () => new Response(jwksDoc(jwk("kid-1")));
    const token = (exp = LONG_EXP) => eddsaToken(privateKey, "kid-1", exp);

    beforeEach(() => {
        now = NOW;
    });

    it("refuses a token that expires while the keys are being read", async () => {
        route({
            [`${BACKEND}/api/v1/auth/login`]: () => json(200, loginBody(token(NOW + 1))),
            ...keyRoutes(() => {
                now = NOW + 2; // the key read took two seconds: the token is past its exp
                return goodKeys();
            }),
        });
        expect(await passwordLogin(creds, c())).toEqual({ kind: "invalid_credentials" });
    });

    it("accepts the same token when the key read ends before its exp", async () => {
        route({
            [`${BACKEND}/api/v1/auth/login`]: () => json(200, loginBody(token(NOW + 5))),
            ...keyRoutes(() => {
                now = NOW + 2;
                return goodKeys();
            }),
        });
        expect(await passwordLogin(creds, c())).toMatchObject({ kind: "ok" });
    });

    // The keys were read at NOW; they serve until NOW + 900 (300 s ttl + 600 s grace). The refresh at
    // NOW + 900 starts inside that window and fails after crossing it (one second later).
    const failing: Array<[string, boolean, () => Response]> = [
        ["discovery answers 503", true, () => new Response("x", { status: 503 })],
        ["discovery answers an invalid document", true, () => new Response("{}")],
        [
            "discovery throws",
            true,
            () => {
                throw new TypeError("fetch failed");
            },
        ],
        ["the key set answers 503", false, () => new Response("x", { status: 503 })],
        ["the key set is invalid", false, () => new Response("{}")],
        [
            "the key set read throws",
            false,
            () => {
                throw new TypeError("fetch failed");
            },
        ],
    ];

    it.each(failing)(
        "uses the time at the failure for the grace cutoff when %s: no stale keys past it",
        async (_label, atDiscovery, failure) => {
            route({
                [`${BACKEND}/api/v1/auth/login`]: () => json(200, loginBody(token())),
                ...keyRoutes(goodKeys),
            });
            expect(await passwordLogin(creds, c())).toMatchObject({ kind: "ok" });
            const advance = (make: () => Response) => () => {
                now = NOW + 901;
                return make();
            };
            route({
                [`${BACKEND}/api/v1/auth/login`]: () => json(200, loginBody(token())),
                ...(atDiscovery
                    ? keyRoutes(goodKeys, advance(failure))
                    : keyRoutes(advance(failure))),
            });
            now = NOW + 900;
            expect(await passwordLogin(creds, c())).toEqual({ kind: "unavailable" });
        },
    );

    it("still serves the last good keys when a failed refresh ends inside the grace window", async () => {
        route({
            [`${BACKEND}/api/v1/auth/login`]: () => json(200, loginBody(token())),
            ...keyRoutes(goodKeys),
        });
        await passwordLogin(creds, c());
        route({
            [`${BACKEND}/api/v1/auth/login`]: () => json(200, loginBody(token())),
            ...keyRoutes(() => {
                now = NOW + 899;
                return new Response("x", { status: 503 });
            }),
        });
        now = NOW + 898;
        expect(await passwordLogin(creds, c())).toMatchObject({ kind: "ok" });
    });
});

describe("refreshSession", () => {
    const REFRESH_URL = `${BACKEND}/api/v1/auth/refresh`;
    const refreshBody = (access: string, over: Record<string, unknown> = {}) => ({
        access_token: access,
        refresh_token: "ref-2",
        token_type: "bearer",
        expires_in: 3600,
        user,
        ...over,
    });
    const hs = () => hs256Token();
    let now = NOW;
    const c = () => ({ ...eddsaCfg(), nowSeconds: () => now });

    beforeEach(() => {
        now = NOW;
    });

    it("refresh sends only the refresh token to /api/v1/auth/refresh", async () => {
        route({ [REFRESH_URL]: () => json(200, refreshBody(hs())) });
        await refreshSession("ref-1", cfg());
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(REFRESH_URL);
        expect(init.method).toBe("POST");
        expect(JSON.parse(String(init.body))).toEqual({ refresh_token: "ref-1" });
    });

    it("refresh 200 stores the rotated refresh token and reads exp and sid from the access token (hs256_compat)", async () => {
        route({ [REFRESH_URL]: () => json(200, refreshBody(hs())) });
        const got = await refreshSession("ref-1", cfg());
        expect(got).toMatchObject({
            kind: "rotated",
            refreshToken: "ref-2",
            accessExp: EXP,
            sid: SID,
            user: { id: "u1" },
        });
    });

    it("refresh 200 under eddsa verifies the access token against the key set and reads exp and sid", async () => {
        route({
            [REFRESH_URL]: () =>
                json(200, refreshBody(eddsaToken(privateKey, "kid-1", 1760003600))),
            ...keyRoutes(() => new Response(jwksDoc(jwk("kid-1")))),
        });
        expect(await refreshSession("ref-1", c())).toMatchObject({
            kind: "rotated",
            accessExp: 1760003600,
            sid: SID,
            refreshToken: "ref-2",
        });
    });

    it("refresh 401, 400, 403, 404, 410 and 422 are terminal", async () => {
        for (const status of [401, 400, 403, 404, 410, 422]) {
            route({ [REFRESH_URL]: () => json(status, { detail: { message: "x" } }) });
            expect(await refreshSession(`ref-s${status}`, cfg()), String(status)).toEqual({
                kind: "terminal",
                reason: "status",
                status,
            });
        }
    });

    it("refresh 429, 408, 425, 500, 502, 503, 504 and a thrown call are transient", async () => {
        for (const status of [429, 408, 425, 500, 502, 503, 504]) {
            route({ [REFRESH_URL]: () => json(status, {}) });
            expect(await refreshSession(`ref-t${status}`, cfg()), String(status)).toEqual({
                kind: "transient",
                status,
            });
        }
        fetchMock.mockRejectedValue(new TypeError("fetch failed"));
        expect(await refreshSession("ref-thrown", cfg())).toEqual({
            kind: "transient",
            errorName: "TypeError",
        });
    });

    it("refresh 200 without a refresh token is terminal and never keeps the spent one", async () => {
        route({
            [REFRESH_URL]: () => json(200, refreshBody(hs(), { refresh_token: undefined })),
        });
        const got = await refreshSession("ref-1", cfg());
        expect(got).toEqual({ kind: "terminal", reason: "invalid_response" });
    });

    it("refresh 200 without an access token is terminal", async () => {
        route({ [REFRESH_URL]: () => json(200, refreshBody("", {})) });
        expect(await refreshSession("ref-1", cfg())).toEqual({
            kind: "terminal",
            reason: "invalid_response",
        });
    });

    it("refresh 200 whose access token is not HS256 under hs256_compat is terminal and logs token_shape_refused", async () => {
        route({ [REFRESH_URL]: () => json(200, refreshBody("not-a-token")) });
        expect(await refreshSession("ref-1", cfg())).toEqual({
            kind: "terminal",
            reason: "token_refused",
        });
        expect(vi.mocked(logSessionBranch).mock.calls.map(([f]) => f)).toEqual([
            { operation: "refresh", branch: "token_shape_refused" },
        ]);
    });

    const hsWith = (payload: string) =>
        `${b64u('{"alg":"HS256","typ":"JWT"}')}.${b64u(payload)}.${b64u("sig")}`;
    const expCases: Array<[string, string]> = [
        ["exp 0", `{"sub":"u1","sid":"${SID}","exp":0}`],
        ["exp -1", `{"sub":"u1","sid":"${SID}","exp":-1}`],
        ["exp missing", `{"sub":"u1","sid":"${SID}"}`],
        ["exp null", `{"sub":"u1","sid":"${SID}","exp":null}`],
        ["exp a string", `{"sub":"u1","sid":"${SID}","exp":"1760003600"}`],
        ["exp a float", `{"sub":"u1","sid":"${SID}","exp":1760003600.5}`],
        ["exp an unsafe integer", `{"sub":"u1","sid":"${SID}","exp":1152921504606846976}`],
    ];

    it.each(expCases)(
        "refresh 200 whose HS256 access token has %s is terminal; the body expires_in never sets a lifetime",
        async (_name, payload) => {
            route({ [REFRESH_URL]: () => json(200, refreshBody(hsWith(payload))) });
            expect(await refreshSession("ref-1", cfg())).toEqual({
                kind: "terminal",
                reason: "token_refused",
            });
        },
    );

    it("refresh 200 with a normal HS256 token keeps its exp and carries no body lifetime", async () => {
        route({
            [REFRESH_URL]: () =>
                json(200, refreshBody(hsWith(`{"sub":"u1","sid":"${SID}","exp":${EXP}}`))),
        });
        const got = await refreshSession("ref-1", cfg());
        expect(got).toMatchObject({ kind: "rotated", accessExp: EXP, sid: SID });
        expect(got).not.toHaveProperty("expiresIn");
    });

    it("refresh 200 whose access token fails verification under eddsa is terminal and logs refresh_invalid_response", async () => {
        route({
            [REFRESH_URL]: () =>
                json(200, refreshBody(eddsaToken(other.privateKey, "kid-1", 1760003600))),
            ...keyRoutes(() => new Response(jwksDoc(jwk("kid-1")))),
        });
        expect(await refreshSession("ref-1", c())).toEqual({
            kind: "terminal",
            reason: "token_refused",
        });
        expect(vi.mocked(logSessionBranch).mock.calls.map(([f]) => f)).toEqual([
            { operation: "refresh", branch: "refresh_invalid_response" },
        ]);
    });

    it("refresh 200 with an unknown kid is terminal after one refresh of the key set", async () => {
        route({
            [REFRESH_URL]: () =>
                json(200, refreshBody(eddsaToken(other.privateKey, "kid-9", 1760003600))),
            ...keyRoutes(() => new Response(jwksDoc(jwk("kid-1")))),
        });
        expect(await refreshSession("ref-1", c())).toEqual({
            kind: "terminal",
            reason: "token_refused",
        });
    });

    it("refresh 200 under eddsa with the key set unavailable stores the ROTATED refresh token, drops the access token, and is transient", async () => {
        route({
            [REFRESH_URL]: () =>
                json(200, refreshBody(eddsaToken(privateKey, "kid-1", 1760003600))),
            ...keyRoutes(() => new Response("x", { status: 503 })),
        });
        expect(await refreshSession("ref-1", c())).toEqual({
            kind: "transient",
            refreshToken: "ref-2",
        });
    });

    it("an unknown token class or a missing issuer makes the refresh transient and calls no backend", async () => {
        expect(await refreshSession("ref-1", cfg({ tokenClassRaw: "nope" }))).toEqual({
            kind: "transient",
        });
        expect(await refreshSession("ref-1", cfg({ tokenClassRaw: "eddsa" }))).toEqual({
            kind: "transient",
        });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(vi.mocked(logSessionBranch).mock.calls.map(([f]) => f)).toEqual([
            { operation: "refresh", branch: "auth_config_invalid" },
            { operation: "refresh", branch: "auth_config_invalid" },
        ]);
    });

    it("the refresh judges the token at the time after the key read", async () => {
        route({
            [REFRESH_URL]: () => json(200, refreshBody(eddsaToken(privateKey, "kid-1", NOW + 1))),
            ...keyRoutes(() => {
                now = NOW + 2;
                return new Response(jwksDoc(jwk("kid-1")));
            }),
        });
        expect(await refreshSession("ref-1", c())).toEqual({
            kind: "terminal",
            reason: "token_refused",
        });
    });

    it("parallel refreshes of one refresh token make one backend call and share the outcome", async () => {
        let release: () => void = () => {};
        const gate = new Promise<void>((resolve) => (release = resolve));
        route({
            [REFRESH_URL]: async () => {
                await gate;
                return json(200, refreshBody(hs()));
            },
        });
        const first = refreshSession("ref-par", cfg());
        const second = refreshSession("ref-par", cfg());
        release();
        const [a, b] = await Promise.all([first, second]);
        expect(calls(REFRESH_URL)).toHaveLength(1);
        expect(a).toEqual(b);
        expect(a).toMatchObject({ kind: "rotated", refreshToken: "ref-2" });
    });

    it("different refresh tokens do not share a call", async () => {
        route({ [REFRESH_URL]: () => json(200, refreshBody(hs())) });
        await Promise.all([refreshSession("ref-x", cfg()), refreshSession("ref-y", cfg())]);
        expect(calls(REFRESH_URL)).toHaveLength(2);
    });

    it("the single flight is released after the answer, success or failure", async () => {
        route({ [REFRESH_URL]: () => json(200, refreshBody(hs())) });
        await refreshSession("ref-rel", cfg());
        await refreshSession("ref-rel", cfg());
        expect(calls(REFRESH_URL)).toHaveLength(2);
        route({ [REFRESH_URL]: () => json(503, {}) });
        await refreshSession("ref-rel", cfg());
        route({ [REFRESH_URL]: () => json(200, refreshBody(hs())) });
        expect(await refreshSession("ref-rel", cfg())).toMatchObject({ kind: "rotated" });
    });

    it("refresh does not read or keep session_access_token", async () => {
        route({
            [REFRESH_URL]: () =>
                json(200, refreshBody(hs(), { session_access_token: "svc-token-value" })),
        });
        const got = await refreshSession("ref-1", cfg());
        expect(JSON.stringify(got)).not.toContain("svc-token-value");
    });

    it("no refresh log line holds a token or a refresh credential", async () => {
        route({ [REFRESH_URL]: () => json(200, refreshBody("tok-secret-value")) });
        await refreshSession("ref-secret-value", cfg());
        route({ [REFRESH_URL]: () => json(503, {}) });
        await refreshSession("ref-secret-value-2", cfg());
        route({
            [REFRESH_URL]: () =>
                json(200, refreshBody("tok-secret-value", { refresh_token: undefined })),
        });
        await refreshSession("ref-secret-value-3", cfg());
        expect(
            vi
                .mocked(logSessionBranch)
                .mock.calls.some(
                    ([f]) => (f as { branch?: string }).branch === "refresh_invalid_response",
                ),
        ).toBe(true);
        const text = JSON.stringify(vi.mocked(logSessionBranch).mock.calls);
        for (const secret of ["tok-secret-value", "ref-secret-value", "ref-2"]) {
            expect(text).not.toContain(secret);
        }
    });
});
