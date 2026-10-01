/**
 * Shell route registry — the single switch between the shared app shell and
 * the legacy chrome.
 *
 * A pathname that matches a registered prefix renders inside the shared shell
 * (sidebar, top bar, one `<main>`). Every other authed route keeps the legacy
 * chrome unchanged: the account bar from the layout plus the page's own
 * `PrimaryNav`. Page migrations add their prefix here and remove the page-level
 * navigation in the same change. When every authed route is registered, this
 * file and the legacy branch of `AppShell` are deleted.
 */
export type ShellRoute = {
    /** Route prefix. Matches the exact path and its descendants. */
    prefix: string;
    /** Match the exact path only: its descendants are registered on their own. */
    exact?: boolean;
    /**
     * Keeps a page's production link behaviour: navigation links always carry a
     * resolved `role` (lens first, then `role`, then the default role), as the
     * page's own `PrimaryNav` did. Without it, `role` is carried only when the
     * URL has it.
     */
    defaultRole?: boolean;
    /**
     * `"page"`: the `f` param of this route is the page's own encoding, not a
     * metric filter (the Security pages keep a Security filter there). The
     * navigation links then carry the default metric filter, as the page's own
     * `PrimaryNav` did, and never the page's `f`.
     */
    filterParam?: "page";
};

export const SHELL_ROUTES: readonly ShellRoute[] = [
    { prefix: "/dashboard", defaultRole: true },
    // Diagnose
    { prefix: "/diagnose", exact: true },
    { prefix: "/diagnose/work-graph" },
    { prefix: "/metrics" },
    { prefix: "/explore" },
    { prefix: "/investment" },
    { prefix: "/landscape" },
    { prefix: "/code" },
    { prefix: "/complexity" },
    { prefix: "/bottleneck" },
    { prefix: "/cognitive-load" },
    { prefix: "/people" },
    // Govern
    { prefix: "/govern", exact: true },
    { prefix: "/quality" },
    { prefix: "/testops" },
    { prefix: "/incident-correlation" },
    { prefix: "/risk/compounding" },
    { prefix: "/security", filterParam: "page" },
    { prefix: "/feature-flags" },
    // Plan
    { prefix: "/plan", exact: true },
    { prefix: "/plan/capacity" },
    { prefix: "/plan/backlog-risk" },
    { prefix: "/operating-review" },
    // Improve
    { prefix: "/improve", exact: true },
    { prefix: "/opportunities" },
    { prefix: "/improve/experiments" },
    { prefix: "/improve/automations" },
];

function matchesRoute(pathname: string, route: ShellRoute): boolean {
    if (pathname === route.prefix) return true;
    return !route.exact && pathname.startsWith(`${route.prefix}/`);
}

/** The registry entry that owns `pathname` (longest prefix wins), if any. */
export function shellRouteForPathname(
    pathname: string | null | undefined,
    routes: readonly ShellRoute[] = SHELL_ROUTES,
): ShellRoute | undefined {
    if (!pathname) return undefined;
    let selected: ShellRoute | undefined;
    for (const route of routes) {
        if (
            matchesRoute(pathname, route) &&
            route.prefix.length > (selected?.prefix.length ?? -1)
        ) {
            selected = route;
        }
    }
    return selected;
}

/** True when `pathname` renders inside the shared app shell. */
export function isShellRoute(
    pathname: string | null | undefined,
    routes: readonly ShellRoute[] = SHELL_ROUTES,
): boolean {
    return shellRouteForPathname(pathname, routes) !== undefined;
}
