/**
 * Where the Ask Dev surface (launcher, panel) may appear. Pure: the shell calls these with the
 * pathname and the organization's feature map.
 */

/**
 * Routes with no Ask Dev surface (plan 2.5): the sign-in and marketing route groups, the platform
 * validation page and the Agent Context explorer. A prefix matches on a path segment, so
 * `/auth` covers `/auth/signin` and not `/authors`.
 */
const EXCLUDED_ROUTE_PREFIXES = [
    "/auth",
    "/pricing",
    "/privacy",
    "/terms",
    "/superadmin/context-fabric/validation",
    "/agent-context",
] as const;

export function isAskDevExcludedPath(pathname: string): boolean {
    // The marketing home is the one exact route of its group.
    if (pathname === "/") return true;
    return EXCLUDED_ROUTE_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
}

/**
 * Ask Dev is on only when BOTH entitlements are on. The server route checks the same two again on
 * every call; this only decides whether the shell draws the launcher, so a user is not offered a
 * button that the route would refuse.
 */
export function isAskDevEnabled(features: Readonly<Record<string, boolean>>): boolean {
    return features.ask_dev === true && features.agent_context_runtime === true;
}
