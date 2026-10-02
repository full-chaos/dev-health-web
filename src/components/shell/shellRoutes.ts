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
    /**
     * Keeps a page's production link behaviour: navigation links always carry a
     * resolved `role` (lens first, then `role`, then the default role), as the
     * page's own `PrimaryNav` did. Without it, `role` is carried only when the
     * URL has it.
     */
    defaultRole?: boolean;
};

export const SHELL_ROUTES: readonly ShellRoute[] = [{ prefix: "/dashboard", defaultRole: true }];

function matchesPrefix(pathname: string, prefix: string): boolean {
    return pathname === prefix || pathname.startsWith(`${prefix}/`);
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
            matchesPrefix(pathname, route.prefix) &&
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
