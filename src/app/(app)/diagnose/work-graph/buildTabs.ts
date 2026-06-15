import { withFilterParam } from "@/lib/filters/url";
import type { ViewSetItem } from "@/components/navigation/ViewSet";
import type { MetricFilter } from "@/lib/filters/types";

/**
 * Build the Work Graph ViewSet tab items.
 *
 * `withFilterParam` carries the global `f` filter (and `role`) onto each tab
 * href, but NOT the explorer-scoped `graph_theme` / `graph_subcategory`
 * params. Because theme/subcategory are now authoritative server-side filters
 * (CHAOS-2431), they must survive tab navigation — so when present they are
 * appended to the theme-aware tab hrefs here.
 *
 * The Review Network tab is intentionally excluded from the theme-param carry
 * (CHAOS-2431, round-5): it is backed by `review_edges_daily` reviewer→author
 * data, which has NO theme attribution and ignores the filter. Carrying the
 * params there would advertise a theme scope in the URL while showing unscoped
 * data. The theme-aware tabs (overview, dependencies, inflow-outflow,
 * artifacts) all read the theme-filtered `work_graph` edges, so they keep them.
 */
export function buildWorkGraphTabs(options: {
    filters: MetricFilter;
    activeRole?: string;
    graphTheme?: string;
    graphSubcategory?: string;
}): ViewSetItem[] {
    const { filters, activeRole, graphTheme, graphSubcategory } = options;

    const graphScopeQuery = new URLSearchParams();
    if (graphTheme) {
        graphScopeQuery.set("graph_theme", graphTheme);
    }
    if (graphSubcategory) {
        graphScopeQuery.set("graph_subcategory", graphSubcategory);
    }
    const graphScopeSuffix = graphScopeQuery.toString();
    const withGraphScope = (path: string) =>
        graphScopeSuffix ? `${path}${path.includes("?") ? "&" : "?"}${graphScopeSuffix}` : path;

    const tab = (
        id: string,
        label: string,
        tabQuery: string | undefined,
        themeAware: boolean,
    ): ViewSetItem => {
        const base = tabQuery ? `/diagnose/work-graph?tab=${tabQuery}` : "/diagnose/work-graph";
        const withFilter = withFilterParam(base, filters, activeRole);
        return {
            id,
            label,
            // Only theme-aware tabs carry graph_theme/graph_subcategory.
            path: themeAware ? withGraphScope(withFilter) : withFilter,
            navVisible: true,
        };
    };

    return [
        tab("overview", "Overview", undefined, true),
        tab("dependencies", "Dependencies", "dependencies", true),
        tab("inflow-outflow", "Inflow-Outflow", "inflow-outflow", true),
        tab("review-network", "Review Network", "review-network", false),
        tab("artifacts", "Artifacts", "artifacts", true),
    ];
}
