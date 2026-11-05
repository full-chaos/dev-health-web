/**
 * Which paths `proxy.ts` rewrites to Ops and which stay with a Next route handler. Pure, so a
 * unit test and the middleware read the same rule.
 */

/**
 * The path the router matches: percent escapes decoded once. `NextRequest` keeps `/api/%61sk-dev`
 * as typed, while Next routes it to `/api/ask-dev`, so a check on the raw text would rewrite the
 * request to Ops with the user's bearer token. A path that does not decode is kept as typed.
 */
export function routedPathname(pathname: string): string {
    try {
        return decodeURIComponent(pathname);
    } catch {
        return pathname;
    }
}

/**
 * Route families that are served by Next route handlers in this app and must never be rewritten to
 * Ops. `/api/ask-dev` (CHAOS-11921, plan INV-8) is the Ask Dev route family: without this entry a
 * production build forwards it to Ops with the user's bearer token and the handler never runs.
 * Matching is by path segment, so `/api/ask-devx` is NOT excluded.
 */
const NEXT_HANDLED_API_PREFIXES = [
    "/api/auth",
    "/api/acr",
    "/api/agent-context",
    "/api/v1/llm-proxy",
] as const;
const NEXT_HANDLED_API_SEGMENT_FAMILIES = ["/api/ask-dev"] as const;

const SSO_PROVIDER = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SSO_OIDC_CALLBACK = new RegExp(`^/api/v1/auth/oidc/${SSO_PROVIDER}/callback$`, "i");
const SSO_SAML_ACS = new RegExp(`^/api/v1/auth/saml/${SSO_PROVIDER}/acs$`, "i");

/**
 * The two browser callbacks of enterprise SSO (CHAOS-13035): the OIDC redirect (GET) and the SAML
 * form POST. The backend binds its login cookies to exactly these paths on the web origin, so Next
 * route handlers serve them; the other SSO paths stay with Ops.
 */
export function isSsoCallbackPath(method: string, rawPathname: string): boolean {
    const pathname = routedPathname(rawPathname);
    if (method === "GET") return SSO_OIDC_CALLBACK.test(pathname);
    if (method === "POST") return SSO_SAML_ACS.test(pathname);
    return false;
}

export function shouldProxyToOps(rawPathname: string): boolean {
    const pathname = routedPathname(rawPathname);
    if (pathname === "/graphql") return true;
    if (!pathname.startsWith("/api/")) return false;
    if (SSO_OIDC_CALLBACK.test(pathname) || SSO_SAML_ACS.test(pathname)) return false;
    if (NEXT_HANDLED_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return false;
    return !NEXT_HANDLED_API_SEGMENT_FAMILIES.some(
        (family) => pathname === family || pathname.startsWith(`${family}/`),
    );
}
