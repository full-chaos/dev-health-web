import { resolveScopeLock, type FilterBarView } from "@/components/filters/filterBarConfig";
import type { MetricFilter } from "@/lib/filters/types";

/**
 * The filter a view with a scope lock settles on, for a page to read on the server.
 *
 * The scope bar rewrites an `f` that names another level than the view's lock (same rule:
 * `resolveScopeLock`, level moved, ids dropped). A page that reads the URL's `f` as it is starts
 * its reads for the wrong level, then a second wave after the rewrite. Read the locked filter
 * and the first wave is the one that stays. A view with no lock keeps its filter.
 */
export function lockScopeForView(filters: MetricFilter, view: FilterBarView): MetricFilter {
    const lock = resolveScopeLock(view);
    if (!lock || filters.scope.level === lock) return filters;
    return { ...filters, scope: { ...filters.scope, level: lock, ids: [] } };
}
