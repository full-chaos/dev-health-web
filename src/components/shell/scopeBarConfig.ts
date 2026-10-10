import {
    type FilterBarView,
    type FilterVisibility,
    maskUnreadControls,
    resolveScopeLock,
    resolveVisibility,
} from "@/components/filters/filterBarConfig";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import type { MetricFilter } from "@/lib/filters/types";

export type ScopeBarConfig = {
    resolvedVisibility: FilterVisibility;
    resolvedScopeLock: MetricFilter["scope"]["level"] | null;
    /** The bar writes a default `f` when the URL has none. */
    writeDefaultFilter: boolean;
};

/**
 * Static configuration of the scope bar for a view.
 *
 * Scope, dates and repositories are in the bar's row, as they were in the
 * global context bar. The drawer holds the page filters only.
 *
 * The team scope lock belongs to the page filters. The page filter bar applied
 * it only where it rendered: a view with no page filter (developer, work, flow)
 * rendered no filter bar, so its scope was not locked and the organization
 * control of the global context bar worked. The scope bar keeps that rule.
 *
 * The default `f` belongs to the page filters too: the page filter bar wrote
 * it, the global context bar did not. With no page filter and no `f` in the
 * URL the scope is the organization, and the bar does not change the URL.
 *
 * `pageFilters: false` is for a page that had the global context bar alone: the
 * scope row and the actions, with no drawer, no scope lock and no default `f`.
 */
export function resolveScopeBarConfig(
    view?: FilterBarView,
    tab?: string,
    pageFilters = true,
): ScopeBarConfig {
    const base = resolveVisibility(view, tab);
    const hasPageFilters = pageFilters && Boolean(base.developer || base.workType);

    return {
        resolvedVisibility: maskUnreadControls({
            ...base,
            scope: false,
            date: false,
            repo: false,
            ...(hasPageFilters ? {} : { developer: false, workType: false }),
        }),
        resolvedScopeLock: hasPageFilters ? resolveScopeLock(view) : null,
        writeDefaultFilter: hasPageFilters,
    };
}

/**
 * The filter a page reads on the server from its search parameters (CHAOS-9130).
 *
 * With no `f`, the bar of a page that writes the default `f` writes `defaultMetricFilter` into the
 * URL with the history API, and that write makes no second server render. (Before, the write was
 * `router.replace`: a second render read the written `f`, so the final view was the default and
 * any legacy filter parameter was dropped.) The first render has to read that same default, or the
 * page would show data for another scope than the URL names. A page whose bar writes no default
 * `f` keeps reading the legacy parameters.
 */
export function filtersFromPageParams(
    encodedFilter: string | undefined,
    params: Record<string, string | string[] | undefined>,
    bar: { view?: FilterBarView; tab?: string; pageFilters?: boolean } = {},
): MetricFilter {
    if (encodedFilter) return decodeFilter(encodedFilter);
    if (!resolveScopeBarConfig(bar.view, bar.tab, bar.pageFilters).writeDefaultFilter) {
        return filterFromQueryParams(params);
    }
    return defaultMetricFilter;
}
