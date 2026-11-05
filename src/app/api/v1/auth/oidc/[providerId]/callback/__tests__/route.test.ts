import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetKeySetCacheForTests } from "@/lib/authServiceWire";
import {
    BACKEND,
    NOT_MEMBER,
    OIDC_CALLBACK_PATH,
    OIDC_NONCE_CLEAR,
    ORIGIN,
    PROVIDER,
    backendCalls,
    backendFetch,
    json,
    sessionAnswer,
    setCookieLines,
    stubSsoEnv,
} from "@/test/ssoRoutes";

// CHAOS-13035 (web PR-2 of CHAOS-10878): the OIDC callback route. The IdP redirects the browser
// here; web completes the sign-in on auth-service, seals the session and signs in through the
// `sso` provider. Every outcome clears `sso_return`; a refusal never mints an Auth.js session.

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

import { GET } from "../route";

const fetchMock = vi.fn();
const SSO_RETURN_CLEAR = `sso_return=; Path=${OIDC_CALLBACK_PATH}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

function call(query = "code=c1&state=s1", cookie?: string) {
    return GET(
        new Request(`${ORIGIN}${OIDC_CALLBACK_PATH}?${query}`, {
            headers: cookie === undefined ? {} : { cookie },
        }),
        { params: Promise.resolve({ providerId: PROVIDER }) },
    );
}
const serve = (res: () => Response) => fetchMock.mockImplementation(backendFetch("/callback", res));
const location = (res: Response) => res.headers.get("location");
const errorOf = (res: Response) => new URL(location(res) ?? "").searchParams.get("error");

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

describe("GET /api/v1/auth/oidc/[providerId]/callback", () => {
    it("W-12 switch off: 404, no backend call, no sign-in", async () => {
        stubSsoEnv(false);
        const res = await call();
        expect(res.status).toBe(404);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(signIn).not.toHaveBeenCalled();
    });

    it("W-12 switch off: 404 even for a request that would otherwise be refused locally", async () => {
        stubSsoEnv(false);
        for (const query of ["", "error=access_denied", "code=c1"]) {
            const res = await call(query, "sso_return=%2Fx");
            expect(res.status).toBe(404);
            expect(setCookieLines(res)).toEqual([]);
        }
        const bad = await GET(new Request(`${ORIGIN}${OIDC_CALLBACK_PATH}?code=c&state=s`), {
            params: Promise.resolve({ providerId: "not-a-uuid" }),
        });
        expect(bad.status).toBe(404);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("W-8 completes the sign-in: exact backend call, sealed ticket, sso provider, dashboard", async () => {
        serve(() => json(200, sessionAnswer(), [OIDC_NONCE_CLEAR]));
        const res = await call("code=c1&state=s1", "dho_oidc_login_nonce_abc=n1");
        const [[url, init]] = backendCalls(fetchMock);
        expect(url).toBe(`${BACKEND}/api/v1/auth/oidc/${PROVIDER}/callback`);
        expect(init.method).toBe("POST");
        expect(JSON.parse(String(init.body))).toEqual({ code: "c1", state: "s1" });
        expect((init.headers as Record<string, string>).Cookie).toBe("dho_oidc_login_nonce_abc=n1");
        expect(sealSsoTicket).toHaveBeenCalledTimes(1);
        expect(sealSsoTicket.mock.calls[0][0]).toMatchObject({
            userId: "u1",
            orgId: expect.any(String),
        });
        expect(signIn).toHaveBeenCalledWith("sso", { ticket: "sealed-ticket", redirect: false });
        expect(res.status).toBe(303);
        expect(location(res)).toBe(`${ORIGIN}/dashboard`);
        expect(setCookieLines(res)).toContain(OIDC_NONCE_CLEAR);
        expect(setCookieLines(res)).toContain(SSO_RETURN_CLEAR);
    });

    it("W-5 forwards only the login-nonce cookie: never the session or other cookies", async () => {
        serve(() => json(200, sessionAnswer()));
        await call(
            "code=c1&state=s1",
            "authjs.session-token=SECRET; dho_oidc_login_nonce_abc=n1; theme=dark; sso_return=%2Fx; dho_saml_login_nonce_def=n2",
        );
        const [[, init]] = backendCalls(fetchMock);
        const cookie = (init.headers as Record<string, string>).Cookie;
        expect(cookie).not.toContain("authjs");
        expect(cookie).not.toContain("theme");
        expect(cookie).not.toContain("sso_return");
        expect(cookie).not.toContain("dho_saml");
        expect(cookie).toBe("dho_oidc_login_nonce_abc=n1");
    });

    it("sso_return is read through safePostLoginRedirect and cleared", async () => {
        serve(() => json(200, sessionAnswer()));
        const res = await call("code=c1&state=s1", "sso_return=%2Forg%2F7%3Ftab%3Dx");
        expect(location(res)).toBe(`${ORIGIN}/org/7?tab=x`);
        expect(setCookieLines(res)).toContain(SSO_RETURN_CLEAR);
    });

    it.each([
        "https%3A%2F%2Fevil.example%2Fsteal",
        "%2F%2Fevil.example%2Fsteal",
        "%2Fauth%2Fsignin",
        "%5Cevil.example",
    ])("W-9 an unsafe sso_return (%s) falls back to the dashboard", async (value) => {
        serve(() => json(200, sessionAnswer()));
        const res = await call("code=c1&state=s1", `sso_return=${value}`);
        expect(location(res)).toBe(`${ORIGIN}/dashboard`);
    });

    it("W-2 non-member (403 with reason): sign-in page error, no session, sso_return cleared", async () => {
        serve(() => json(403, NOT_MEMBER, [OIDC_NONCE_CLEAR]));
        const res = await call("code=c1&state=s1", "sso_return=%2Fx");
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
        expect(lines).toContain(OIDC_NONCE_CLEAR);
    });

    it("W-2 a 403 with the old text body (no reason) is sso_failed, not sso_not_member", async () => {
        serve(() =>
            json(403, { detail: "This account is not a member of the provider's organization." }),
        );
        const res = await call();
        expect(errorOf(res)).toBe("sso_failed");
        expect(signIn).not.toHaveBeenCalled();
    });

    it.each([
        [409, { detail: "identity conflict" }, "sso_identity_conflict"],
        [402, { detail: "not entitled" }, "sso_not_licensed"],
        [503, { detail: "down" }, "sso_unavailable"],
        [400, { detail: "malformed" }, "sso_failed"],
    ])("refusal %i maps to %s and signs nobody in", async (status, body, code) => {
        serve(() => json(status, body));
        const res = await call();
        expect(errorOf(res)).toBe(code);
        expect(signIn).not.toHaveBeenCalled();
        expect(setCookieLines(res)).toContain(SSO_RETURN_CLEAR);
    });

    it("a thrown backend call is sso_unavailable", async () => {
        serve(() => {
            throw new Error("socket hang up");
        });
        const res = await call();
        expect(errorOf(res)).toBe("sso_unavailable");
        expect(signIn).not.toHaveBeenCalled();
    });

    it.each(["error=access_denied", "code=c1", "state=s1", ""])(
        "an IdP error or missing code/state (%s): sso_failed and no backend call",
        async (query) => {
            const res = await call(query, "sso_return=%2Fx");
            expect(errorOf(res)).toBe("sso_failed");
            expect(backendCalls(fetchMock)).toHaveLength(0);
            expect(signIn).not.toHaveBeenCalled();
            expect(setCookieLines(res)).toContain(SSO_RETURN_CLEAR);
        },
    );

    it("a sign-in that throws after a completed call is sso_failed, no redirect to the target", async () => {
        serve(() => json(200, sessionAnswer()));
        signIn.mockRejectedValue(new Error("CredentialsSignin"));
        const res = await call("code=c1&state=s1", "sso_return=%2Fx");
        expect(errorOf(res)).toBe("sso_failed");
        expect(setCookieLines(res)).toContain(SSO_RETURN_CLEAR);
    });

    it("an answer whose org differs from the verified claim signs nobody in", async () => {
        serve(() => json(200, sessionAnswer({ org_id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d" })));
        const res = await call();
        expect(errorOf(res)).toBe("sso_failed");
        expect(signIn).not.toHaveBeenCalled();
    });

    it("a sign-in that comes back as an error URL (redirect:false does not throw) is sso_failed", async () => {
        serve(() => json(200, sessionAnswer()));
        signIn.mockResolvedValue("/auth/signin?error=CredentialsSignin&code=credentials");
        const res = await call("code=c1&state=s1", "sso_return=%2Fx");
        expect(errorOf(res)).toBe("sso_failed");
        expect(setCookieLines(res)).toContain(SSO_RETURN_CLEAR);
    });
});
