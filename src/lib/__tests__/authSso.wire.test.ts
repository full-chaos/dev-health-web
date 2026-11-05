import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetKeySetCacheForTests, type WireConfig } from "@/lib/authServiceWire";
import {
    classifySsoRefusal,
    completeOidc,
    completeSaml,
    startOidc,
    startSaml,
} from "@/lib/authSso";
import { ACTOR, ISSUER, SID, eddsaFetch, inSeconds, mint } from "@/test/eddsaAnswer";

// CHAOS-10878 (7.5): the enterprise SSO calls on the auth-service compat wire. The refusal is read
// from the body's `reason` only (go-api and auth-service answer the same body); an answer that
// does not carry it is a plain failure.

vi.mock("@/lib/authSessionLog", () => ({
    logSessionBranch: vi.fn(),
    thrownErrorName: (e: unknown) => (e instanceof Error ? e.name : typeof e),
}));

const PROVIDER = "6f1d0f6e-62a1-4b3a-9f0e-1f2b3c4d5e6f";
const ORG = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const OTHER_ORG = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const BACKEND = "http://auth.test";
const hs256: WireConfig = { tokenClassRaw: undefined, issuer: undefined, backendUrl: BACKEND };
const eddsa: WireConfig = { tokenClassRaw: "eddsa", issuer: ISSUER, backendUrl: BACKEND };
const fetchMock = vi.fn();
const b64u = (s: string) => Buffer.from(s).toString("base64url");
const VALID_EXP = inSeconds(1800);
const VALID_TOKEN = mint({ exp: VALID_EXP, org: ORG });
const serve = (make: () => Response) =>
    fetchMock.mockImplementation(eddsaFetch({ "/callback": make, "/acs": make }));
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", ...headers },
    });
const answer = (over: Record<string, unknown> = {}) => ({
    access_token: VALID_TOKEN,
    refresh_token: "ref-1",
    token_type: "bearer",
    expires_in: 3600,
    user_id: "u1",
    email: "a@example.test",
    org_id: ORG,
    role: "member",
    ...over,
});
const membership = {
    detail: {
        message: "A membership in this organization is required",
        reason: "membership_required",
    },
};
const callback = {
    providerId: PROVIDER,
    code: "c",
    state: "s",
    cookies: "dho_oidc_login_nonce_x=n",
};
const acs = { providerId: PROVIDER, samlResponse: "PHNhbWw+", cookies: "dho_saml_login_nonce_x=n" };

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

describe("classifySsoRefusal", () => {
    it("403 with detail.reason membership_required is sso_not_member", () => {
        expect(classifySsoRefusal({ status: 403, body: membership })).toBe("sso_not_member");
    });

    it("a 403 without that reason is sso_failed: the old text body is not read", () => {
        const text = { detail: "This account is not a member of the provider's organization." };
        expect(classifySsoRefusal({ status: 403, body: text })).toBe("sso_failed");
        expect(classifySsoRefusal({ status: 403, body: { detail: { reason: "other" } } })).toBe(
            "sso_failed",
        );
        expect(classifySsoRefusal({ status: 403, body: undefined })).toBe("sso_failed");
    });

    it("the other refusals", () => {
        expect(classifySsoRefusal({ status: 409, body: { detail: "x" } })).toBe(
            "sso_identity_conflict",
        );
        expect(classifySsoRefusal({ status: 402, body: {} })).toBe("sso_not_licensed");
        expect(classifySsoRefusal({ status: 400, body: {} })).toBe("sso_failed");
        expect(classifySsoRefusal({ status: 404, body: {} })).toBe("sso_failed");
    });

    it("a transient status or a thrown call is sso_unavailable", () => {
        for (const status of [429, 500, 503]) {
            expect(classifySsoRefusal({ status, body: {} })).toBe("sso_unavailable");
        }
        expect(classifySsoRefusal({ thrown: true })).toBe("sso_unavailable");
    });
});

describe("completeOidc", () => {
    it("posts code and state with the login cookie and reads the flat answer", async () => {
        serve(() => json(200, answer()));
        const got = await completeOidc(callback, eddsa);
        expect(got).toMatchObject({
            kind: "ok",
            session: {
                userId: "u1",
                email: "a@example.test",
                orgId: ORG,
                role: "member",
                accessToken: VALID_TOKEN,
                refreshToken: "ref-1",
                expiresIn: 3600,
                accessExp: VALID_EXP,
                sid: SID,
            },
        });
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(`${BACKEND}/api/v1/auth/oidc/${PROVIDER}/callback`);
        expect(init.method).toBe("POST");
        expect(JSON.parse(String(init.body))).toEqual({ code: "c", state: "s" });
        expect((init.headers as Record<string, string>).Cookie).toBe("dho_oidc_login_nonce_x=n");
    });

    it("maps the non-member refusal to sso_not_member and gives no session", async () => {
        serve(() => json(403, membership));
        expect(await completeOidc(callback, eddsa)).toMatchObject({
            kind: "refused",
            code: "sso_not_member",
        });
    });

    it("an answer without an org is no SSO session", async () => {
        serve(() => json(200, answer({ org_id: "" })));
        expect(await completeOidc(callback, eddsa)).toMatchObject({
            kind: "refused",
            code: "sso_failed",
        });
    });

    it("an answer without a refresh token or user id is refused", async () => {
        serve(() => json(200, answer({ refresh_token: undefined })));
        expect(await completeOidc(callback, eddsa)).toMatchObject({ kind: "refused" });
        serve(() => json(200, answer({ user_id: undefined })));
        expect(await completeOidc(callback, eddsa)).toMatchObject({ kind: "refused" });
    });

    it("a call that throws is sso_unavailable", async () => {
        fetchMock.mockImplementation(
            eddsaFetch({
                "/callback": () => {
                    throw new Error("down");
                },
            }),
        );
        expect(await completeOidc(callback, eddsa)).toMatchObject({
            kind: "refused",
            code: "sso_unavailable",
        });
    });

    it("a provider id that is not a UUID is refused before any call", async () => {
        const got = await completeOidc({ ...callback, providerId: "../x" }, eddsa);
        expect(got).toMatchObject({ kind: "refused", code: "sso_failed" });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("completeOidc under class eddsa", () => {
    const issued = (org: string | undefined) => {
        const exp = inSeconds(1800);
        return {
            exp,
            body: answer({
                access_token: mint({ exp, org, act: ACTOR }),
                session_access_token: mint({ aud: "auth-service", exp, org }),
            }) as Record<string, unknown>,
        };
    };

    it("takes expiry, sid, actor and the service token from the verified tokens", async () => {
        const { exp, body } = issued(ORG);
        fetchMock.mockImplementation(eddsaFetch({ "/callback": () => json(200, body) }));
        expect(await completeOidc(callback, eddsa)).toMatchObject({
            kind: "ok",
            session: {
                orgId: ORG,
                accessExp: exp,
                sid: SID,
                actorSub: ACTOR,
                sessionAccessToken: body.session_access_token,
                sessionExp: exp,
            },
        });
    });

    it("refuses an answer whose org_id is not the verified claim org", async () => {
        const { body } = issued(OTHER_ORG);
        fetchMock.mockImplementation(eddsaFetch({ "/callback": () => json(200, body) }));
        expect(await completeOidc(callback, eddsa)).toMatchObject({
            kind: "refused",
            code: "sso_failed",
        });
    });

    it("refuses an answer whose verified token carries no org", async () => {
        const { body } = issued(undefined);
        fetchMock.mockImplementation(eddsaFetch({ "/callback": () => json(200, body) }));
        expect(await completeOidc(callback, eddsa)).toMatchObject({ kind: "refused" });
    });
});

describe("completeSaml", () => {
    it("posts the response and relay state with the binding cookie", async () => {
        serve(() => json(200, answer()));
        const got = await completeSaml({ ...acs, relayState: "rs" }, eddsa);
        expect(got).toMatchObject({ kind: "ok", session: { orgId: ORG } });
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(`${BACKEND}/api/v1/auth/saml/${PROVIDER}/acs`);
        expect(JSON.parse(String(init.body))).toEqual({
            SAMLResponse: "PHNhbWw+",
            RelayState: "rs",
        });
        expect((init.headers as Record<string, string>).Cookie).toBe("dho_saml_login_nonce_x=n");
    });

    it("maps the non-member refusal", async () => {
        serve(() => json(403, membership));
        expect(await completeSaml(acs, eddsa)).toMatchObject({
            kind: "refused",
            code: "sso_not_member",
        });
    });
});

describe("startOidc and startSaml", () => {
    it("startOidc posts the redirect uri and returns the IdP url", async () => {
        fetchMock.mockResolvedValue(
            json(200, { authorization_url: "https://idp.example.test/auth?x=1", state: "s" }),
        );
        const got = await startOidc(
            { providerId: PROVIDER, redirectUri: "https://web.test/api/v1/auth/oidc/p/callback" },
            hs256,
        );
        expect(got).toMatchObject({ kind: "ok", redirectUrl: "https://idp.example.test/auth?x=1" });
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe(`${BACKEND}/api/v1/auth/oidc/${PROVIDER}/authorize`);
        expect(JSON.parse(String(init.body))).toEqual({
            redirect_uri: "https://web.test/api/v1/auth/oidc/p/callback",
        });
    });

    it("startSaml posts to initiate and returns the redirect url", async () => {
        fetchMock.mockResolvedValue(
            json(200, { redirect_url: "https://idp.example.test/sso?r=1" }),
        );
        const got = await startSaml({ providerId: PROVIDER }, hs256);
        expect(got).toMatchObject({ kind: "ok", redirectUrl: "https://idp.example.test/sso?r=1" });
        expect(String(fetchMock.mock.calls[0][0])).toBe(
            `${BACKEND}/api/v1/auth/saml/${PROVIDER}/initiate`,
        );
    });

    it("an IdP url that is not http(s) is refused", async () => {
        fetchMock.mockResolvedValue(json(200, { redirect_url: "javascript:alert(1)" }));
        expect(await startSaml({ providerId: PROVIDER }, hs256)).toMatchObject({
            kind: "refused",
            code: "sso_failed",
        });
    });

    it("a refusal of the start call is read the same way", async () => {
        fetchMock.mockResolvedValue(json(402, { detail: { message: "x" } }));
        expect(await startSaml({ providerId: PROVIDER }, hs256)).toMatchObject({
            kind: "refused",
            code: "sso_not_licensed",
        });
    });
});

describe("the dark switch", () => {
    it("with AUTH_SSO_ENABLED unset every call answers disabled and calls no backend", async () => {
        vi.stubEnv("AUTH_SSO_ENABLED", "");
        expect(
            await startOidc({ providerId: PROVIDER, redirectUri: "https://w.test/c" }, hs256),
        ).toEqual({
            kind: "disabled",
        });
        expect(await startSaml({ providerId: PROVIDER }, hs256)).toEqual({ kind: "disabled" });
        expect(await completeOidc(callback, hs256)).toEqual({ kind: "disabled" });
        expect(await completeSaml(acs, hs256)).toEqual({ kind: "disabled" });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
