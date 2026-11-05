import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetKeySetCacheForTests } from "@/lib/authServiceWire";
import {
    BACKEND,
    OIDC_CALLBACK_PATH,
    OIDC_NONCE,
    ORIGIN,
    PROVIDER,
    backendCalls,
    backendFetch,
    json,
    setCookieLines,
    stubSsoEnv,
} from "@/test/ssoRoutes";

// CHAOS-13035 (web PR-2 of CHAOS-10878): the OIDC start route, an admin-shared deep link. The
// redirect_uri is the exact web callback; the login-nonce cookie is relayed; the return target
// rides in `sso_return`, validated before it is stored.

vi.mock("@/lib/authSessionLog", () => ({
    logSessionBranch: vi.fn(),
    thrownErrorName: (e: unknown) => (e instanceof Error ? e.name : typeof e),
}));

import { GET } from "../route";

const fetchMock = vi.fn();
const IDP = "https://idp.example.test/authorize?client_id=x&state=s";
const serve = (res: () => Response) =>
    fetchMock.mockImplementation(backendFetch("/authorize", res));
const call = (query = "") =>
    GET(new Request(`${ORIGIN}/auth/sso/oidc/${PROVIDER}${query}`), {
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

describe("GET /auth/sso/oidc/[providerId]", () => {
    it("W-12 switch off: 404 and no backend call", async () => {
        stubSsoEnv(false);
        const res = await call();
        expect(res.status).toBe(404);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("W-7 asks the backend with the exact web callback as redirect_uri and redirects to the IdP", async () => {
        serve(() => json(200, { authorization_url: IDP, state: "s" }, [OIDC_NONCE]));
        const res = await call();
        const [[url, init]] = backendCalls(fetchMock);
        expect(url).toBe(`${BACKEND}/api/v1/auth/oidc/${PROVIDER}/authorize`);
        expect(JSON.parse(String(init.body))).toEqual({
            redirect_uri: `${ORIGIN}/api/v1/auth/oidc/${PROVIDER}/callback`,
        });
        expect(res.status).toBe(303);
        expect(res.headers.get("location")).toBe(IDP);
        expect(setCookieLines(res)).toContain(OIDC_NONCE);
    });

    it("drops backend cookies that are not the login nonce", async () => {
        serve(() =>
            json(200, { authorization_url: IDP }, [
                OIDC_NONCE,
                "tracking=1; Path=/",
                "authjs.session-token=x",
            ]),
        );
        const res = await call();
        expect(setCookieLines(res).filter((l) => !l.startsWith("sso_return="))).toEqual([
            OIDC_NONCE,
        ]);
    });

    it("stores a safe callbackUrl in sso_return, bound to the callback path", async () => {
        serve(() => json(200, { authorization_url: IDP }, [OIDC_NONCE]));
        const res = await call("?callbackUrl=%2Forg%2F7%3Ftab%3Dx");
        expect(returnCookie(res)).toBe(
            `sso_return=${encodeURIComponent("/org/7?tab=x")}; Path=${OIDC_CALLBACK_PATH}; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
        );
    });

    it.each(["https://evil.example/steal", "//evil.example", "/auth/signin", "\\evil.example"])(
        "an unsafe callbackUrl (%s) is not stored",
        async (value) => {
            serve(() => json(200, { authorization_url: IDP }, [OIDC_NONCE]));
            const res = await call(`?callbackUrl=${encodeURIComponent(value)}`);
            expect(res.headers.get("location")).toBe(IDP);
            expect(returnCookie(res)).toBeUndefined();
        },
    );

    it.each([
        [503, "sso_unavailable"],
        [402, "sso_not_licensed"],
        [404, "sso_failed"],
    ])("a backend %i sends the browser to the sign-in page with %s", async (status, code) => {
        serve(() => json(status, { detail: "x" }));
        const res = await call();
        const to = new URL(res.headers.get("location") ?? "");
        expect(to.origin).toBe(ORIGIN);
        expect(to.pathname).toBe("/auth/signin");
        expect(to.searchParams.get("error")).toBe(code);
        expect(returnCookie(res)).toBeUndefined();
    });

    it("an answer without an IdP URL is sso_failed", async () => {
        serve(() => json(200, {}));
        const res = await call();
        expect(new URL(res.headers.get("location") ?? "").searchParams.get("error")).toBe(
            "sso_failed",
        );
    });
});
