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

export function shouldProxyToOps(rawPathname: string): boolean {
    const pathname = routedPathname(rawPathname);
    if (pathname === "/graphql") return true;
    if (!pathname.startsWith("/api/")) return false;
    if (NEXT_HANDLED_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return false;
    return !NEXT_HANDLED_API_SEGMENT_FAMILIES.some(
        (family) => pathname === family || pathname.startsWith(`${family}/`),
    );
}
