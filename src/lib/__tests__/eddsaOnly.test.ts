import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logSessionBranch } from "@/lib/authSessionLog";
import {
    passwordLogin,
    readAnswerTokens,
    readExchangeAnswer,
    refreshSession,
    resetKeySetCacheForTests,
    type WireConfig,
} from "@/lib/authServiceWire";

vi.mock("@/lib/authSessionLog", () => ({
    logSessionBranch: vi.fn(),
    thrownErrorName: (e: unknown) => (e instanceof Error ? e.name : typeof e),
}));

// EdDSA is the only access-token class: the class setting is gone, so an EdDSA answer is read
// with no class configured, and an HS256 token is refused whatever the configuration says.

const BACKEND = "http://auth.test";
const ISSUER = "https://auth.example.test";
const DISCOVERY_URL = `${ISSUER}/.well-known/openid-configuration`;
const JWKS_URL = `${ISSUER}/.well-known/jwks.json`;
const SUB = "prn_AAAAAAAAAAAAAAAAAAAAAA";
const SID = "ses_AAAAAAAAAAAAAAAAAAAAAQ";
const NOW = 1760000300;
const EXP = 1760000600;

const b64u = (b: Uint8Array | string) => Buffer.from(b).toString("base64url");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");

function eddsaToken(audience: "dev-health-api" | "auth-service" = "dev-health-api"): string {
    const header = JSON.stringify({ alg: "EdDSA", typ: "at+jwt", kid: "kid-1" });
    const payload = JSON.stringify({
        iss: ISSUER,
        aud: audience,
        sub: SUB,
        principal_type: "human",
        sid: SID,
        jti: "000000000000000000000001",
        iat: 1760000000,
        nbf: 1760000000,
        exp: EXP,
        scope: audience === "auth-service" ? "auth:session" : "api:access",
    });
    const input = `${b64u(header)}.${b64u(payload)}`;
    return `${input}.${b64u(sign(null, Buffer.from(input), privateKey))}`;
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
const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const pairBody = (access: string, session?: string) => ({
    access_token: access,
    refresh_token: "ref-1",
    token_type: "bearer",
    expires_in: 3600,
    needs_onboarding: false,
    user,
    ...(session === undefined ? {} : { session_access_token: session }),
});

const fetchMock = vi.fn();
function route(extra: Record<string, () => Response> = {}) {
    const routes: Record<string, () => Response> = {
        [DISCOVERY_URL]: () =>
            new Response(
                JSON.stringify({
                    issuer: ISSUER,
                    jwks_uri: JWKS_URL,
                    id_token_signing_alg_values_supported: ["EdDSA"],
                }),
            ),
        [JWKS_URL]: () =>
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
            ),
        ...extra,
    };
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
        const handler = routes[String(input)];
        if (!handler) throw new Error(`unexpected fetch ${String(input)}`);
        return handler();
    });
}

// The class setting no longer exists; a leftover value must change nothing.
const cfg = (over: Record<string, unknown> = {}): WireConfig =>
    ({ issuer: ISSUER, backendUrl: BACKEND, nowSeconds: () => NOW, ...over }) as WireConfig;

beforeEach(() => {
    vi.mocked(logSessionBranch).mockClear();
    fetchMock.mockReset();
    resetKeySetCacheForTests();
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("EdDSA is the only access-token class", () => {
    it("RED-1: an EdDSA token is read and verified when no class is configured", async () => {
        route();
        const got = await readAnswerTokens({ accessToken: eddsaToken() }, cfg(), "login");
        expect(got).toMatchObject({ ok: true, sid: SID, sub: SUB, accessExp: EXP });
    });

    it("RED-2: login with no class setting and an EdDSA answer signs in", async () => {
        route({
            [`${BACKEND}/api/v1/auth/login`]: () =>
                json(200, pairBody(eddsaToken(), eddsaToken("auth-service"))),
        });
        const got = await passwordLogin({ email: "a@example.test", password: "pw" }, cfg());
        expect(got).toMatchObject({
            kind: "ok",
            sid: SID,
            sub: SUB,
            accessExp: EXP,
            sessionExp: EXP,
        });
        expect(vi.mocked(logSessionBranch)).not.toHaveBeenCalledWith(
            expect.objectContaining({ branch: "token_shape_refused" }),
        );
    });

    it("RED-3: refresh with no class setting rotates an EdDSA pair", async () => {
        route({
            [`${BACKEND}/api/v1/auth/refresh`]: () =>
                json(200, pairBody(eddsaToken(), eddsaToken("auth-service"))),
        });
        const got = await refreshSession("ref-0", cfg());
        expect(got).toMatchObject({ kind: "rotated", accessExp: EXP, sessionExp: EXP, sid: SID });
    });

    it.each(["switch_org", "change_password", "social_login"] as const)(
        "RED-4: %s reads an EdDSA answer and keeps the session token",
        async (operation) => {
            route();
            const session = eddsaToken("auth-service");
            const got = await readExchangeAnswer(
                { accessToken: eddsaToken(), sessionAccessToken: session },
                cfg(),
                operation,
            );
            expect(got).toMatchObject({
                kind: "read",
                accessExp: EXP,
                sid: SID,
                session: { kind: "ok", token: session, exp: EXP, sid: SID },
            });
        },
    );

    it.each([undefined, "", "eddsa", "hs256_compat"])(
        "RED-5: an HS256 token is refused with the class setting %j",
        async (raw) => {
            route();
            const got = await readAnswerTokens(
                { accessToken: hs256Token() },
                cfg({ tokenClassRaw: raw }),
                "login",
            );
            expect(got.ok).toBe(false);
        },
    );

    it("RED-5: a login answer with an HS256 token is not a sign-in under any setting", async () => {
        route({ [`${BACKEND}/api/v1/auth/login`]: () => json(200, pairBody(hs256Token())) });
        for (const raw of [undefined, "hs256_compat"]) {
            const got = await passwordLogin(
                { email: "a@example.test", password: "pw" },
                cfg({ tokenClassRaw: raw }),
            );
            expect(got.kind).not.toBe("ok");
        }
    });

    it("an issuer is required: without one every operation is an unusable configuration", async () => {
        route();
        const got = await passwordLogin(
            { email: "a@example.test", password: "pw" },
            cfg({ issuer: undefined }),
        );
        expect(got).toEqual({ kind: "unavailable" });
    });
});
