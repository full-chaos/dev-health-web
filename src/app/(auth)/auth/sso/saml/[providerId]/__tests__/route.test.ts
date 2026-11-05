import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetKeySetCacheForTests } from "@/lib/authServiceWire";
import {
    BACKEND,
    ORIGIN,
    PROVIDER,
    SAML_ACS_PATH,
    SAML_NONCE,
    backendCalls,
    backendFetch,
    json,
    setCookieLines,
    stubSsoEnv,
} from "@/test/ssoRoutes";

// CHAOS-13035 (web PR-2 of CHAOS-10878): the SAML start route, an admin-shared deep link. The
// binding cookie (SameSite=None, ACS path) is relayed; `sso_return` is SameSite=None too, because
// the IdP reaches the ACS with a cross-site POST that a Lax cookie would not ride.

vi.mock("@/lib/authSessionLog", () => ({
    logSessionBranch: vi.fn(),
    thrownErrorName: (e: unknown) => (e instanceof Error ? e.name : typeof e),
}));

import { GET } from "../route";

const fetchMock = vi.fn();
const IDP = "https://idp.example.test/sso?SAMLRequest=abc&RelayState=r";
const serve = (res: () => Response) => fetchMock.mockImplementation(backendFetch("/initiate", res));
const call = (query = "") =>
    GET(new Request(`${ORIGIN}/auth/sso/saml/${PROVIDER}${query}`), {
        params: Promise.resolve({ providerId: PROVIDER }),
    });
const returnCookie = (res: Response) =>
    setCookieLines(res).find((l) => l.startsWith("sso_return="));

beforeEach(() => {
    fetchMock.mockReset();
    resetKeySetCacheForTests();
    vi.stubGlobal("fetch", fetchMock);
    stubSsoEnv(true);
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe("GET /auth/sso/saml/[providerId]", () => {
    it("W-12 switch off: 404 and no backend call", async () => {
        stubSsoEnv(false);
        const res = await call();
        expect(res.status).toBe(404);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("W-9 initiates on the backend and redirects to the IdP with the binding cookie relayed", async () => {
        serve(() => json(200, { redirect_url: IDP }, [SAML_NONCE]));
        const res = await call();
        const [[url, init]] = backendCalls(fetchMock);
        expect(url).toBe(`${BACKEND}/api/v1/auth/saml/${PROVIDER}/initiate`);
        expect(JSON.parse(String(init.body))).toEqual({});
        expect(res.status).toBe(303);
        expect(res.headers.get("location")).toBe(IDP);
        expect(setCookieLines(res)).toContain(SAML_NONCE);
    });

    it("stores a safe callbackUrl in sso_return with SameSite=None on the ACS path", async () => {
        serve(() => json(200, { redirect_url: IDP }, [SAML_NONCE]));
        const res = await call("?callbackUrl=%2Forg%2F7");
        expect(returnCookie(res)).toBe(
            `sso_return=${encodeURIComponent("/org/7")}; Path=${SAML_ACS_PATH}; Max-Age=600; HttpOnly; Secure; SameSite=None`,
        );
    });

    it.each(["https://evil.example/steal", "//evil.example", "/auth/signin"])(
        "an unsafe callbackUrl (%s) is not stored and expires any earlier one",
        async (value) => {
            serve(() => json(200, { redirect_url: IDP }, [SAML_NONCE]));
            const res = await call(`?callbackUrl=${encodeURIComponent(value)}`);
            expect(res.headers.get("location")).toBe(IDP);
            expect(returnCookie(res)).toContain("Max-Age=0");
        },
    );

    it("a backend refusal sends the browser to the sign-in page", async () => {
        serve(() => json(503, { detail: "x" }));
        const res = await call();
        const to = new URL(res.headers.get("location") ?? "");
        expect(to.pathname).toBe("/auth/signin");
        expect(to.searchParams.get("error")).toBe("sso_unavailable");
    });
});
