import type { FilterBarView } from "@/components/filters/filterBarConfig";
import { resolveScopeBarConfig } from "@/components/shell/scopeBarConfig";
import { fetchFilterNames } from "@/lib/api/filterOptions";
import type { MetricFilter } from "@/lib/filters/types";

import { PAGE_CONTEXT_ROUTES, type ApprovedRouteId, type PageEntityInput } from "./page-context";
import { scopePageEntities } from "./page-scope-entities";

/**
 * `scopePageEntities` on a server page, with the served names (CHAOS-11938).
 *
 * - **The scope the page settles on:** the filter is first locked as the page's scope bar locks it
 *   after mount (`resolveScopeBarConfig(view, tab).resolvedScopeLock`: level moved, ids dropped).
 *   The bar locks only a view with page filters, so Complexity keeps a repository scope (codex r3
 *   on #1647) while a team-locked view drops one it would have proposed for one render only.
 * - **Names read only when needed:** only when the locked scope can propose something the route
 *   takes (one team, or one repository value), from the same source as the scope bar. A failed read gives empty
 *   maps, so a repository proposes nothing and a team is labelled by its id.
 */
export async function loadScopePageEntities(input: {
    readonly routeId: ApprovedRouteId;
    readonly view: FilterBarView;
    /** The tab the page passes its scope bar, when it passes one. */
    readonly tab?: string;
    readonly filters: MetricFilter;
}): Promise<PageEntityInput[]> {
    const lock = resolveScopeBarConfig(input.view, input.tab).resolvedScopeLock;
    const filters =
        lock === null || input.filters.scope.level === lock
            ? input.filters
            : { ...input.filters, scope: { ...input.filters.scope, level: lock, ids: [] } };
    const single = (values: readonly string[] | undefined) => values?.length === 1;
    const repoValues = filters.scope.level === "repo" ? filters.scope.ids : filters.what.repos;
    const kinds: readonly string[] = PAGE_CONTEXT_ROUTES[input.routeId].kinds;
    const mayPropose =
        (kinds.includes("team") && filters.scope.level === "team" && single(filters.scope.ids)) ||
        (kinds.includes("repository") && single(repoValues));
    if (!mayPropose) return [];
    const names = await fetchFilterNames();
    return scopePageEntities({ routeId: input.routeId, filters, names });
}
