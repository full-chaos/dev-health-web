import {
    type FilterBarView,
    type FilterVisibility,
    resolveScopeLock,
    resolveVisibility,
} from "@/components/filters/filterBarConfig";
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
    const hasPageFilters =
        pageFilters && Boolean(base.developer || base.workType || base.flowStage);

    return {
        resolvedVisibility: {
            ...base,
            scope: false,
            date: false,
            repo: false,
            ...(hasPageFilters ? {} : { developer: false, workType: false, flowStage: false }),
        },
        resolvedScopeLock: hasPageFilters ? resolveScopeLock(view) : null,
        writeDefaultFilter: hasPageFilters,
    };
}
