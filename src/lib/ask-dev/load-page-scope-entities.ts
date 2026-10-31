import type { FilterBarView } from "@/components/filters/filterBarConfig";
import { fetchFilterNames } from "@/lib/api/filterOptions";
import { lockScopeForView } from "@/lib/filters/lockScope";
import type { MetricFilter } from "@/lib/filters/types";

import type { ApprovedRouteId, PageEntityInput } from "./page-context";
import { scopePageEntities } from "./page-scope-entities";

/**
 * `scopePageEntities` on a server page, with the served names (CHAOS-11938).
 *
 * - **The scope the page settles on:** the filter is first locked to the view's scope level, as
 *   the scope bar rewrites it after the page mounts (`lockScopeForView`). Without the lock, a
 *   repository scope on a team-locked view was proposed for one render and then dropped.
 * - **Names read only when needed:** only when the locked scope can propose something (one team,
 *   or one repository value), from the same source as the scope bar. A failed read gives empty
 *   maps, so a repository proposes nothing and a team is labelled by its id.
 */
export async function loadScopePageEntities(input: {
    readonly routeId: ApprovedRouteId;
    readonly view: FilterBarView;
    readonly filters: MetricFilter;
}): Promise<PageEntityInput[]> {
    const filters = lockScopeForView(input.filters, input.view);
    const single = (values: readonly string[] | undefined) => values?.length === 1;
    const repoValues = filters.scope.level === "repo" ? filters.scope.ids : filters.what.repos;
    const mayPropose =
        (filters.scope.level === "team" && single(filters.scope.ids)) || single(repoValues);
    if (!mayPropose) return [];
    const names = await fetchFilterNames();
    return scopePageEntities({ routeId: input.routeId, filters, names });
}
