import { vi } from "vitest";
import { ISSUER, eddsaFetch, inSeconds, mint } from "@/test/eddsaAnswer";

// Test support for the SSO route cells: the env of a dark-off or dark-on process, an eddsa
// auth-service answer and the cookie lines the backend sets.

export const PROVIDER = "6f1d0f6e-62a1-4b3a-9f0e-1f2b3c4d5e6f";
export const ORG = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
export const ORIGIN = "https://app.example.test";
export const BACKEND = "http://auth.test";

export const OIDC_CALLBACK_PATH = `/api/v1/auth/oidc/${PROVIDER}/callback`;
export const SAML_ACS_PATH = `/api/v1/auth/saml/${PROVIDER}/acs`;

export const OIDC_NONCE = `dho_oidc_login_nonce_abc=n1; Path=${OIDC_CALLBACK_PATH}; Max-Age=600; HttpOnly; Secure; SameSite=Lax`;
export const OIDC_NONCE_CLEAR = `dho_oidc_login_nonce_abc=; Path=${OIDC_CALLBACK_PATH}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
export const SAML_NONCE = `dho_saml_login_nonce_def=n2; Path=${SAML_ACS_PATH}; Max-Age=600; HttpOnly; Secure; SameSite=None`;
export const SAML_NONCE_CLEAR = `dho_saml_login_nonce_def=; Path=${SAML_ACS_PATH}; Max-Age=0; HttpOnly; Secure; SameSite=None`;

export function stubSsoEnv(on: boolean): void {
    vi.stubEnv("AUTH_SSO_ENABLED", on ? "true" : "");
    vi.stubEnv("AUTH_ACCESS_TOKEN_CLASS", "eddsa");
    vi.stubEnv("AUTH_ACCESS_TOKEN_ISSUER", ISSUER);
    vi.stubEnv("BACKEND_URL", BACKEND);
    vi.stubEnv("AUTH_URL", ORIGIN);
}

export const json = (status: number, body: unknown, setCookies: string[] = []): Response => {
    const headers = new Headers({ "content-type": "application/json" });
    for (const line of setCookies) headers.append("set-cookie", line);
    return new Response(JSON.stringify(body), { status, headers });
};

export const sessionAnswer = (over: Record<string, unknown> = {}) => ({
    access_token: mint({ exp: inSeconds(1800), org: ORG }),
    refresh_token: "ref-1",
    token_type: "bearer",
    expires_in: 3600,
    user_id: "u1",
    email: "a@example.test",
    org_id: ORG,
    role: "member",
    ...over,
});

export const NOT_MEMBER = {
    detail: {
        message: "A membership in this organization is required",
        reason: "membership_required",
    },
};

/** A fetch mock that serves the discovery and key-set URLs plus the given backend step. */
export function backendFetch(
    step: "/authorize" | "/initiate" | "/callback" | "/acs",
    make: (init?: RequestInit) => Response | Promise<Response>,
) {
    return vi.fn(eddsaFetch({ [step]: make }));
}

/** The backend calls of a fetch mock, without the key-set and discovery reads. */
export function backendCalls(fetchMock: ReturnType<typeof vi.fn>): [string, RequestInit][] {
    return fetchMock.mock.calls
        .filter(([url]) => String(url).startsWith(`${BACKEND}/`))
        .map(([url, init]) => [String(url), (init ?? {}) as RequestInit]);
}

export const setCookieLines = (res: Response): string[] => res.headers.getSetCookie();
