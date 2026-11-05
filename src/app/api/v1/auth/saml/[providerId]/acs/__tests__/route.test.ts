import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetKeySetCacheForTests } from "@/lib/authServiceWire";
import {
    BACKEND,
    NOT_MEMBER,
    ORIGIN,
    PROVIDER,
    SAML_ACS_PATH,
    SAML_NONCE_CLEAR,
    backendCalls,
    backendFetch,
    json,
    sessionAnswer,
    setCookieLines,
    stubSsoEnv,
} from "@/test/ssoRoutes";

// CHAOS-13035 (web PR-2 of CHAOS-10878): the SAML ACS route at the exact path the backend binds
// its cookie to (the ACS path rule). The IdP form-POSTs here; only the binding cookie goes on to
// the backend. Every outcome clears `sso_return`; a refusal never mints an Auth.js session.

vi.mock("@/lib/authSessionLog", () => ({
    logSessionBranch: vi.fn(),
    thrownErrorName: (e: unknown) => (e instanceof Error ? e.name : typeof e),
}));
const signIn = vi.fn();
const sealSsoTicket = vi.fn();
vi.mock("@/lib/auth", () => ({
    signIn: (...args: unknown[]) => signIn(...args),
    sealSsoTicket: (...args: unknown[]) => sealSsoTicket(...args),
}));

import { POST } from "../route";

const fetchMock = vi.fn();
const SSO_RETURN_CLEAR = `sso_return=; Path=${SAML_ACS_PATH}; Max-Age=0; HttpOnly; Secure; SameSite=None`;

function call(fields: Record<string, string> | null, cookie?: string) {
    const headers: Record<string, string> = {
        "content-type": "application/x-www-form-urlencoded",
        ...(cookie === undefined ? {} : { cookie }),
    };
    return POST(
        new Request(`${ORIGIN}${SAML_ACS_PATH}`, {
            method: "POST",
            headers,
            body: new URLSearchParams(fields ?? {}).toString(),
        }),
        { params: Promise.resolve({ providerId: PROVIDER }) },
    );
}
const serve = (res: () => Response) => fetchMock.mockImplementation(backendFetch("/acs", res));
const location = (res: Response) => res.headers.get("location");
const errorOf = (res: Response) => new URL(location(res) ?? "").searchParams.get("error");
const FIELDS = { SAMLResponse: "PHNhbWw+", RelayState: "rs-1" };

beforeEach(() => {
    fetchMock.mockReset();
    signIn.mockReset();
    sealSsoTicket.mockReset();
    sealSsoTicket.mockResolvedValue("sealed-ticket");
    resetKeySetCacheForTests();
    vi.stubGlobal("fetch", fetchMock);
    stubSsoEnv(true);
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe("POST /api/v1/auth/saml/[providerId]/acs", () => {
    it("W-12 switch off: 404, no backend call, no sign-in", async () => {
        stubSsoEnv(false);
        const res = await call(FIELDS);
        expect(res.status).toBe(404);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(signIn).not.toHaveBeenCalled();
    });

    it("W-10 completes the sign-in: exact backend call, sealed ticket, 303 to the dashboard", async () => {
        serve(() => json(200, sessionAnswer(), [SAML_NONCE_CLEAR]));
        const res = await call(FIELDS, "dho_saml_login_nonce_def=n2");
        const [[url, init]] = backendCalls(fetchMock);
        expect(url).toBe(`${BACKEND}/api/v1/auth/saml/${PROVIDER}/acs`);
        expect(JSON.parse(String(init.body))).toEqual({
            SAMLResponse: "PHNhbWw+",
            RelayState: "rs-1",
        });
        expect((init.headers as Record<string, string>).Cookie).toBe("dho_saml_login_nonce_def=n2");
        expect(signIn).toHaveBeenCalledWith("sso", { ticket: "sealed-ticket", redirect: false });
        expect(res.status).toBe(303);
        expect(location(res)).toBe(`${ORIGIN}/dashboard`);
        expect(setCookieLines(res)).toContain(SAML_NONCE_CLEAR);
        expect(setCookieLines(res)).toContain(SSO_RETURN_CLEAR);
    });

    it("W-5 forwards the SAML binding cookie only: no session, no OIDC nonce, nothing else", async () => {
        serve(() => json(200, sessionAnswer()));
        await call(
            FIELDS,
            "authjs.session-token=SECRET; dho_oidc_login_nonce_abc=n1; dho_saml_login_nonce_def=n2; theme=dark",
        );
        const [[, init]] = backendCalls(fetchMock);
        expect((init.headers as Record<string, string>).Cookie).toBe("dho_saml_login_nonce_def=n2");
    });

    it("RelayState is optional and forwarded unchanged when present", async () => {
        serve(() => json(200, sessionAnswer()));
        await call({ SAMLResponse: "PHNhbWw+" }, "dho_saml_login_nonce_def=n2");
        const [[, init]] = backendCalls(fetchMock);
        expect(JSON.parse(String(init.body))).toEqual({ SAMLResponse: "PHNhbWw+" });
    });

    it("sso_return is read through safePostLoginRedirect and cleared", async () => {
        serve(() => json(200, sessionAnswer()));
        const res = await call(FIELDS, "sso_return=%2Forg%2F7; dho_saml_login_nonce_def=n2");
        expect(location(res)).toBe(`${ORIGIN}/org/7`);
        expect(setCookieLines(res)).toContain(SSO_RETURN_CLEAR);
    });

    it.each(["https%3A%2F%2Fevil.example%2Fsteal", "%2F%2Fevil.example", "%2Fauth%2Fsignin"])(
        "an unsafe sso_return (%s) falls back to the dashboard",
        async (value) => {
            serve(() => json(200, sessionAnswer()));
            const res = await call(FIELDS, `sso_return=${value}; dho_saml_login_nonce_def=n2`);
            expect(location(res)).toBe(`${ORIGIN}/dashboard`);
        },
    );

    it("W-3 non-member (403 with reason): sign-in page error, no session, sso_return cleared", async () => {
        serve(() => json(403, NOT_MEMBER, [SAML_NONCE_CLEAR]));
        const res = await call(FIELDS, "sso_return=%2Fx; dho_saml_login_nonce_def=n2");
        expect(res.status).toBe(303);
        expect(new URL(location(res) ?? "").pathname).toBe("/auth/signin");
        expect(errorOf(res)).toBe("sso_not_member");
        expect(signIn).not.toHaveBeenCalled();
        expect(sealSsoTicket).not.toHaveBeenCalled();
        const lines = setCookieLines(res);
        expect(lines.some((l) => l.startsWith("authjs.") || l.startsWith("__Secure-authjs"))).toBe(
            false,
        );
        expect(lines).toContain(SSO_RETURN_CLEAR);
        expect(lines).toContain(SAML_NONCE_CLEAR);
    });

    it("a 403 with the old text body (no reason) is sso_failed", async () => {
        serve(() =>
            json(403, { detail: "This account is not a member of the provider's organization." }),
        );
        const res = await call(FIELDS, "dho_saml_login_nonce_def=n2");
        expect(errorOf(res)).toBe("sso_failed");
    });

    it.each([
        [409, "sso_identity_conflict"],
        [402, "sso_not_licensed"],
        [503, "sso_unavailable"],
        [400, "sso_failed"],
    ])("refusal %i maps to %s and signs nobody in", async (status, code) => {
        serve(() => json(status, { detail: "x" }));
        const res = await call(FIELDS, "dho_saml_login_nonce_def=n2");
        expect(errorOf(res)).toBe(code);
        expect(signIn).not.toHaveBeenCalled();
        expect(setCookieLines(res)).toContain(SSO_RETURN_CLEAR);
    });

    it("a missing SAMLResponse (or a non-form body) is sso_failed with no backend call", async () => {
        const res = await call({ RelayState: "rs-1" }, "sso_return=%2Fx");
        expect(errorOf(res)).toBe("sso_failed");
        expect(backendCalls(fetchMock)).toHaveLength(0);
        expect(setCookieLines(res)).toContain(SSO_RETURN_CLEAR);
        const odd = await POST(
            new Request(`${ORIGIN}${SAML_ACS_PATH}`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: "{}",
            }),
            { params: Promise.resolve({ providerId: PROVIDER }) },
        );
        expect(errorOf(odd)).toBe("sso_failed");
        expect(backendCalls(fetchMock)).toHaveLength(0);
    });

    it("a sign-in that throws after a completed call is sso_failed", async () => {
        serve(() => json(200, sessionAnswer()));
        signIn.mockRejectedValue(new Error("CredentialsSignin"));
        const res = await call(FIELDS, "dho_saml_login_nonce_def=n2");
        expect(errorOf(res)).toBe("sso_failed");
    });

    it("a sign-in that comes back as an error URL (redirect:false does not throw) is sso_failed", async () => {
        serve(() => json(200, sessionAnswer()));
        signIn.mockResolvedValue("/auth/signin?error=CredentialsSignin&code=credentials");
        const res = await call(FIELDS, "dho_saml_login_nonce_def=n2");
        expect(errorOf(res)).toBe("sso_failed");
        expect(setCookieLines(res)).toContain(SSO_RETURN_CLEAR);
    });
});
