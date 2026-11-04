import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WireConfig } from "@/lib/authServiceWire";
import { completeOidc, ssoCookieHeader, ssoSetCookies, startOidc, startSaml } from "@/lib/authSso";

// CHAOS-10878 (7.5): the login cookies are bound to exact paths of the web origin. Only the two
// login-nonce cookies cross between the browser and the backend, in both directions.

vi.mock("@/lib/authSessionLog", () => ({
    logSessionBranch: vi.fn(),
    thrownErrorName: (e: unknown) => (e instanceof Error ? e.name : typeof e),
}));

const PROVIDER = "6f1d0f6e-62a1-4b3a-9f0e-1f2b3c4d5e6f";
const cfg: WireConfig = {
    tokenClassRaw: undefined,
    issuer: undefined,
    backendUrl: "http://auth.test",
};
const fetchMock = vi.fn();
const OIDC = `dho_oidc_login_nonce_abc=n1; Path=/api/v1/auth/oidc/${PROVIDER}/callback; Max-Age=600; HttpOnly; Secure; SameSite=Lax`;
const SAML = `dho_saml_login_nonce_def=n2; Path=/api/v1/auth/saml/${PROVIDER}/acs; Max-Age=600; HttpOnly; Secure; SameSite=None`;

beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("AUTH_SSO_ENABLED", "1");
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe("ssoCookieHeader", () => {
    it("keeps only the login-nonce cookies of a request", () => {
        const header =
            "authjs.session-token=SECRET; dho_oidc_login_nonce_abc=n1; theme=dark; dho_saml_login_nonce_def=n2; __Secure-authjs.session-token=S2";
        expect(ssoCookieHeader(header)).toBe(
            "dho_oidc_login_nonce_abc=n1; dho_saml_login_nonce_def=n2",
        );
    });

    it("is undefined when there is none", () => {
        expect(ssoCookieHeader("authjs.session-token=SECRET")).toBeUndefined();
        expect(ssoCookieHeader("")).toBeUndefined();
        expect(ssoCookieHeader(undefined)).toBeUndefined();
    });

    it("does not match a name that only contains the prefix", () => {
        expect(ssoCookieHeader("x_dho_oidc_login_nonce_a=1")).toBeUndefined();
    });
});

describe("ssoSetCookies", () => {
    it("relays the login-nonce cookies with their attributes unchanged and drops the rest", () => {
        expect(
            ssoSetCookies([
                OIDC,
                "authjs.session-token=evil; Path=/",
                SAML,
                "other=1; Domain=example.test",
            ]),
        ).toEqual([OIDC, SAML]);
    });
});

describe("what the calls send and return", () => {
    it("startOidc returns only the nonce cookie, with Path, Secure, HttpOnly and SameSite", async () => {
        const headers = new Headers({ "content-type": "application/json" });
        headers.append("set-cookie", OIDC);
        headers.append("set-cookie", "authjs.session-token=evil; Path=/");
        fetchMock.mockResolvedValue(
            new Response(
                JSON.stringify({ authorization_url: "https://idp.example.test/a", state: "s" }),
                {
                    status: 200,
                    headers,
                },
            ),
        );
        const got = await startOidc({ providerId: PROVIDER, redirectUri: "https://w.test/c" }, cfg);
        expect(got).toMatchObject({ kind: "ok", setCookies: [OIDC] });
    });

    it("startSaml keeps SameSite=None on the binding cookie", async () => {
        const headers = new Headers({ "content-type": "application/json" });
        headers.append("set-cookie", SAML);
        fetchMock.mockResolvedValue(
            new Response(JSON.stringify({ redirect_url: "https://idp.example.test/s" }), {
                status: 200,
                headers,
            }),
        );
        const got = await startSaml({ providerId: PROVIDER }, cfg);
        expect(got).toMatchObject({ kind: "ok", setCookies: [SAML] });
        expect(JSON.stringify(got)).toContain("SameSite=None");
    });

    it("complete forwards only the nonce cookies to the backend and relays the clearing cookie", async () => {
        const headers = new Headers({ "content-type": "application/json" });
        headers.append("set-cookie", OIDC.replace("Max-Age=600", "Max-Age=0"));
        fetchMock.mockResolvedValue(
            new Response(JSON.stringify({ detail: "x" }), { status: 400, headers }),
        );
        const got = await completeOidc(
            {
                providerId: PROVIDER,
                code: "c",
                state: "s",
                cookies: "authjs.session-token=SECRET; dho_oidc_login_nonce_abc=n1",
            },
            cfg,
        );
        const init = fetchMock.mock.calls[0][1] as RequestInit;
        expect((init.headers as Record<string, string>).Cookie).toBe("dho_oidc_login_nonce_abc=n1");
        expect(JSON.stringify(init)).not.toContain("SECRET");
        expect(got).toMatchObject({
            kind: "refused",
            clearCookies: [OIDC.replace("Max-Age=600", "Max-Age=0")],
        });
    });

    it("sends no Cookie header when the request had no nonce cookie", async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: "x" }), { status: 400 }));
        await completeOidc({ providerId: PROVIDER, code: "c", state: "s", cookies: "a=b" }, cfg);
        const init = fetchMock.mock.calls[0][1] as RequestInit;
        expect((init.headers as Record<string, string>).Cookie).toBeUndefined();
    });
});
