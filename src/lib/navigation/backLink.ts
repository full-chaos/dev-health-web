import { basePath, navTrailForPathname } from "@/lib/navigation/areas";

/**
 * BackLink versus breadcrumbs (Framework A5).
 *
 * The breadcrumbs in the shell's top bar say WHERE the page is. A `BackLink`
 * belongs inside the content of a detail page only, to return to the parent
 * list with its state. A page never shows a BackLink whose target equals the
 * last breadcrumb link: that return path is already in the top bar.
 */

/** The target of the last crumb that is a link (the page's parent), if any. */
export function lastBreadcrumbHref(pathname: string): string | undefined {
    const trail = navTrailForPathname(pathname);
    for (let index = trail.length - 1; index >= 0; index -= 1) {
        const href = trail[index].href;
        if (href) return href;
    }
    return undefined;
}

/**
 * True when a page at `pathname` may show a BackLink to `href`. The comparison
 * is on the bare path: the BackLink's state params (`f`, `role`, `lens`) do not
 * make it a different destination.
 */
export function backLinkAllowed(pathname: string, href: string): boolean {
    const parent = lastBreadcrumbHref(pathname);
    if (!parent) return true;
    return basePath(href) !== basePath(parent);
}
