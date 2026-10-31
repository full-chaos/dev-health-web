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
    "/marketing",
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
 * The Ask Dev full page (plan §2.5, D-13; CHAOS-11934). It shows the tab's one conversation, the
 * same store the panel shows, so the panel and its launcher are not drawn there.
 */
export const ASK_DEV_FULL_PAGE_PATH = "/dev";

export function isAskDevFullPage(pathname: string): boolean {
    return pathname === ASK_DEV_FULL_PAGE_PATH || pathname.startsWith(`${ASK_DEV_FULL_PAGE_PATH}/`);
}

/** Where the panel, its launcher, its shortcut and its palette entry may appear. */
export function isAskDevPanelPath(pathname: string): boolean {
    return !isAskDevExcludedPath(pathname) && !isAskDevFullPage(pathname);
}

/**
 * Ask Dev is on only when BOTH entitlements are on. The server route checks the same two again on
 * every call; this only decides whether the shell draws the launcher, so a user is not offered a
 * button that the route would refuse.
 */
export function isAskDevEnabled(features: Readonly<Record<string, boolean>>): boolean {
    return features.ask_dev === true && features.agent_context_runtime === true;
}
