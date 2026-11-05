import { createHmac, generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    resetKeySetCacheForTests,
    wireConfigFromEnv,
    type WireConfig,
} from "@/lib/authServiceWire";
import { completeOidc, completeSaml } from "@/lib/authSso";
import { ISSUER, SID, SUB, eddsaFetch, inSeconds, keysResponse, mint } from "@/test/eddsaAnswer";

// The SSO completion (OIDC callback and SAML ACS) reads the access token of the answer only after
// it verifies as EdDSA against the key set of the pinned issuer (authServiceWire.readIssuedAccessToken,
// verify.ts verifyAccessToken). A token that does not verify gives no session.

const PROVIDER = "6f1d0f6e-62a1-4b3a-9f0e-1f2b3c4d5e6f";
const ORG = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const OTHER_ORG = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const BACKEND = "http://auth.test";
const cfg: WireConfig = { issuer: ISSUER, backendUrl: BACKEND };
const fetchMock = vi.fn();
const b64u = (v: string | Buffer) => Buffer.from(v).toString("base64url");

const callback = {
    providerId: PROVIDER,
    code: "c",
    state: "s",
    cookies: "dho_oidc_login_nonce_x=n",
};
const acs = { providerId: PROVIDER, samlResponse: "PHNhbWw+", cookies: "dho_saml_login_nonce_x=n" };
const completions = [
    ["oidc", (c: WireConfig) => completeOidc(callback, c)],
    ["saml", (c: WireConfig) => completeSaml(acs, c)],
] as const;

const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
    });
const answer = (accessToken: string, orgId = ORG) => ({
    access_token: accessToken,
    refresh_token: "ref-1",
    token_type: "bearer",
    expires_in: 3600,
    user_id: "u1",
    email: "a@example.test",
    org_id: orgId,
    role: "member",
});
const serve = (body: unknown) =>
    fetchMock.mockImplementation(
        eddsaFetch({ "/callback": () => json(body), "/acs": () => json(body) }),
    );

const publicKeyBytes = async (): Promise<Buffer> => {
    const jwks = (await keysResponse().json()) as { keys: { x: string }[] };
    return Buffer.from(jwks.keys[0]?.x ?? "", "base64url");
};

interface Forge {
    alg?: string;
    iss?: string;
    exp?: number;
    mac?: Buffer;
}
// A token with the claims of a good one (kid-1, aud dev-health-api), signed the way the case says.
function forge(opts: Forge): string {
    const nowS = Math.floor(Date.now() / 1000);
    const alg = opts.alg ?? "EdDSA";
    const header = b64u(JSON.stringify({ alg, typ: "at+jwt", kid: "kid-1" }));
    const payload = b64u(
        JSON.stringify({
            iss: opts.iss ?? ISSUER,
            aud: "dev-health-api",
            sub: SUB,
            principal_type: "human",
            sid: SID,
            jti: "000000000000000000000002",
            iat: nowS - 10,
            nbf: nowS - 10,
            exp: opts.exp ?? nowS + 3000,
            scope: "api:access",
            org_id: ORG,
        }),
    );
    const input = `${header}.${payload}`;
    if (opts.mac) return `${input}.${b64u(createHmac("sha256", opts.mac).update(input).digest())}`;
    if (alg === "none") return `${input}.`;
    const { privateKey: key } = generateKeyPairSync("ed25519");
    return `${input}.${b64u(sign(null, Buffer.from(input), key))}`;
}

beforeEach(() => {
    fetchMock.mockReset();
    resetKeySetCacheForTests();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("AUTH_SSO_ENABLED", "true");
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe.each(completions)("the %s completion verifies the access token", (_name, complete) => {
    it("control: a token that verifies against the pinned issuer gives a session", async () => {
        serve(answer(mint({ org: ORG, exp: inSeconds(1800) })));
        expect(await complete(cfg)).toMatchObject({ kind: "ok", session: { orgId: ORG } });
    });

    it("refuses a token signed with another key", async () => {
        serve(answer(forge({})));
        expect(await complete(cfg)).toMatchObject({ kind: "refused", code: "sso_failed" });
    });

    it("refuses a token of another issuer", async () => {
        serve(answer(mint({ org: ORG, iss: "https://other.example.test" })));
        expect(await complete(cfg)).toMatchObject({ kind: "refused", code: "sso_failed" });
    });

    it("refuses alg HS256 signed with the public key bytes (alg confusion)", async () => {
        serve(answer(forge({ alg: "HS256", mac: await publicKeyBytes() })));
        expect(await complete(cfg)).toMatchObject({ kind: "refused", code: "sso_failed" });
    });

    it("refuses alg none", async () => {
        serve(answer(forge({ alg: "none" })));
        expect(await complete(cfg)).toMatchObject({ kind: "refused", code: "sso_failed" });
    });

    it.each(["HS256", "none"])(
        "refuses header alg %s on a token the pinned key really signed",
        async (alg) => {
            serve(answer(mint({ org: ORG, exp: inSeconds(1800), alg })));
            expect(await complete(cfg)).toMatchObject({ kind: "refused", code: "sso_failed" });
        },
    );

    it.each([["JWT"], [null]])(
        "refuses header typ %s on a token the pinned key really signed",
        async (typ) => {
            serve(answer(mint({ org: ORG, exp: inSeconds(1800), typ })));
            expect(await complete(cfg)).toMatchObject({ kind: "refused", code: "sso_failed" });
        },
    );

    it("refuses an expired token", async () => {
        serve(answer(mint({ org: ORG, exp: inSeconds(-5) })));
        expect(await complete(cfg)).toMatchObject({ kind: "refused", code: "sso_failed" });
    });

    it("refuses an answer whose org differs from the org of the verified token", async () => {
        serve(answer(mint({ org: ORG, exp: inSeconds(1800) }), OTHER_ORG));
        expect(await complete(cfg)).toMatchObject({ kind: "refused", code: "sso_failed" });
    });

    it("with no pinned issuer: sso_unavailable and nothing is posted to auth-service", async () => {
        serve(answer(mint({ org: ORG, exp: inSeconds(1800) })));
        expect(await complete({ issuer: undefined, backendUrl: BACKEND })).toMatchObject({
            kind: "refused",
            code: "sso_unavailable",
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("a deploy that still sets AUTH_ACCESS_TOKEN_CLASS=hs256_compat", () => {
    beforeEach(() => {
        vi.stubEnv("AUTH_ACCESS_TOKEN_CLASS", "hs256_compat");
        vi.stubEnv("AUTH_ACCESS_TOKEN_ISSUER", ISSUER);
        vi.stubEnv("BACKEND_URL", BACKEND);
    });

    it("the setting is ignored: an HS256 token is refused, never decoded unverified", async () => {
        serve(answer(forge({ alg: "HS256", mac: Buffer.from("shared-secret-of-the-old-class") })));
        expect(await completeOidc(callback, wireConfigFromEnv())).toMatchObject({
            kind: "refused",
            code: "sso_failed",
        });
    });

    it("the setting is ignored: an EdDSA token that verifies is accepted", async () => {
        serve(answer(mint({ org: ORG, exp: inSeconds(1800) })));
        expect(await completeOidc(callback, wireConfigFromEnv())).toMatchObject({ kind: "ok" });
    });
});
