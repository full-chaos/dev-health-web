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
 * appended to every tab href here.
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

    const tab = (id: string, label: string, tabQuery?: string): ViewSetItem => {
        const base = tabQuery
            ? `/diagnose/work-graph?tab=${tabQuery}`
            : "/diagnose/work-graph";
        return {
            id,
            label,
            path: withGraphScope(withFilterParam(base, filters, activeRole)),
            navVisible: true,
        };
    };

    return [
        tab("overview", "Overview"),
        tab("dependencies", "Dependencies", "dependencies"),
        tab("inflow-outflow", "Inflow-Outflow", "inflow-outflow"),
        tab("review-network", "Review Network", "review-network"),
        tab("artifacts", "Artifacts", "artifacts"),
    ];
}
