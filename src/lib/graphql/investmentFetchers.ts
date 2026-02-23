/**
 * GraphQL-based fetchers for Investment view.
 *
 * These fetchers adapt GraphQL responses to match the shapes
 * expected by the existing REST-based UI components.
 * Toggle with USE_GRAPHQL_ANALYTICS=true (runtime) or NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS=true.
 */

import type { MetricFilter } from "@/lib/filters/types";
import type { InvestmentResponse, SankeyResponse, SankeyNode, SankeyLink } from "@/lib/types";
import { formatSubcategoryLabel } from "@/lib/investmentMix";
import { graphqlClient } from "./client";
import { INVESTMENT_BREAKDOWN_QUERY, INVESTMENT_FULL_QUERY } from "./queries";
import type {
    AnalyticsQueryResponse,
    AnalyticsRequestInput,
    DimensionInput,
    FilterInput,
    MeasureInput,
    SankeyResult,
    ScopeLevelInput,
} from "./types";

/**
 * Get the org ID from filters or context.
 * Throws an error if org_id cannot be determined.
 */
export function getOrgId(filters: MetricFilter, contextOrgId?: string): string {
    // Extract org from scope when scope level is "org"
    if (filters.scope.level === "org" && filters.scope.ids.length > 0) {
        return filters.scope.ids[0];
    }
    // Use context org if provided
    if (contextOrgId) {
        return contextOrgId;
    }
    // Throw error if no org can be determined
    throw new Error("org_id is required: not found in filters or context");
}

/**
 * Build a date range from MetricFilter.
 */
function buildDateRange(filters: MetricFilter): { startDate: string; endDate: string } {
    const { start_date, end_date, range_days } = filters.time;

    if (start_date && end_date) {
        return { startDate: start_date, endDate: end_date };
    }

    // Calculate dates from range_days
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - range_days * 24 * 60 * 60 * 1000);

    return {
        startDate: startDate.toISOString().split("T")[0],
        endDate: endDate.toISOString().split("T")[0],
    };
}

/**
 * Translate internal MetricFilter to GraphQL FilterInput.
 */
function translateMetricFilterToGraphQL(filters: MetricFilter): FilterInput {
    return {
        scope: {
            level: filters.scope.level.toUpperCase() as ScopeLevelInput,
            ids: filters.scope.ids,
        },
        who: filters.who.developers?.length ? { developers: filters.who.developers } : undefined,
        what: filters.what.repos?.length ? { repos: filters.what.repos } : undefined,
        why: (filters.why.work_category?.length || filters.why.issue_type?.length) ? {
            workCategory: filters.why.work_category,
            issueType: filters.why.issue_type,
        } : undefined,
        how: filters.how.flow_stage?.length ? { flowStage: filters.how.flow_stage } : undefined,
    };
}

/**
 * Fetch investment breakdown (theme/subcategory distributions) via GraphQL.
 *
 * Returns data in the same shape as the REST /api/v1/investment endpoint.
 */
export async function getInvestmentViaGraphQL(
    filters: MetricFilter
): Promise<InvestmentResponse> {
    const orgId = getOrgId(filters);
    const dateRange = buildDateRange(filters);

    const batch: AnalyticsRequestInput = {
        breakdowns: [
            {
                dimension: "THEME" as DimensionInput,
                measure: "COUNT" as MeasureInput,
                dateRange,
                topN: 50,
            },
            {
                dimension: "SUBCATEGORY" as DimensionInput,
                measure: "COUNT" as MeasureInput,
                dateRange,
                topN: 100,
            },
        ],
        useInvestment: true,
        filters: translateMetricFilterToGraphQL(filters),
    };

    const response = await graphqlClient.query<AnalyticsQueryResponse>(
        INVESTMENT_BREAKDOWN_QUERY,
        { orgId, batch },
        { orgId }
    );

    // Convert breakdowns to the expected shape
    const themeBreakdown = response.analytics.breakdowns.find(
        (b) => b.dimension.toLowerCase() === "theme"
    );
    const subcategoryBreakdown = response.analytics.breakdowns.find(
        (b) => b.dimension.toLowerCase() === "subcategory"
    );

    const theme_distribution: Record<string, number> = {};
    const subcategory_distribution: Record<string, number> = {};

    if (themeBreakdown) {
        for (const item of themeBreakdown.items) {
            theme_distribution[item.key] = item.value;
        }
    }

    if (subcategoryBreakdown) {
        for (const item of subcategoryBreakdown.items) {
            subcategory_distribution[item.key] = item.value;
        }
    }

    return {
        theme_distribution,
        subcategory_distribution,
        unit: "delivery_units",
    };
}

/**
 * Adapt GraphQL SankeyResult to REST SankeyResponse shape.
 */
export function adaptSankeyResult(
    graphqlSankey: SankeyResult | undefined,
    mode: string
): SankeyResponse {
    if (!graphqlSankey) {
        return {
            mode: mode as SankeyResponse["mode"],
            nodes: [],
            links: [],
        };
    }

    // Map GraphQL nodes to REST shape
    const nodes: SankeyNode[] = graphqlSankey.nodes.map((n) => {
        // Map GraphQL dimensions to lowercase groups expected by the UI
        let group = n.dimension.toLowerCase();
        if (n.dimension === "TEAM") {
            group = "team";
        } else if (n.dimension === "THEME") {
            group = "category";
        } else if (n.dimension === "SUBCATEGORY") {
            group = "subcategory";
        } else if (n.dimension === "REPO") {
            group = "repo";
        }

        let name = n.label || `(Unassigned ${group})`;
        // Strip prefixes if present (e.g. from backend ID formatting leaks)
        name = name.replace(/^(TEAM|REPO|THEME|SUBCATEGORY):\s*/i, "");
        if (group === "subcategory") {
            name = formatSubcategoryLabel(name, false);
        }

        return {
            id: n.id,
            name,
            group,
            value: n.value,
        };
    });

    const nodeNameById = new Map(
        nodes.map((node) => [node.id ?? node.name, node.name])
    );

    const normalizeEdgeRef = (ref: string) =>
        ref.replace(/^(TEAM|REPO|THEME|SUBCATEGORY):\s*/i, "");

    // Map GraphQL edges to REST links (source/target should match node names)
    const links: SankeyLink[] = graphqlSankey.edges.map((e) => ({
        source: nodeNameById.get(e.source) ?? normalizeEdgeRef(e.source),
        target: nodeNameById.get(e.target) ?? normalizeEdgeRef(e.target),
        value: e.value,
    }));

    return {
        mode: mode as SankeyResponse["mode"],
        nodes,
        links,
    };
}

/**
 * Fetch investment flow (Sankey) data via GraphQL.
 *
 * Returns data in the same shape as the REST /api/v1/investment/flow endpoint.
 */
export async function getInvestmentFlowViaGraphQL(params: {
    filters: MetricFilter;
    theme?: string | null;
    flow_mode?: "team_category_repo" | "team_subcategory_repo" | "team_category_subcategory_repo";
    drill_category?: string | null;
    top_n_repos?: number;
}): Promise<SankeyResponse> {
    const { filters } = params;
    const orgId = getOrgId(filters);
    const dateRange = buildDateRange(filters);
    const resolvedTheme = params.drill_category ?? params.theme ?? null;
    const graphqlFilters = translateMetricFilterToGraphQL(filters);
    if (resolvedTheme) {
        graphqlFilters.why = {
            ...(graphqlFilters.why ?? {}),
            workCategory: [resolvedTheme],
        };
    }

    // Map flow_mode to Sankey path
    let path: DimensionInput[] = ["TEAM", "THEME", "REPO"];
    if (params.flow_mode === "team_category_subcategory_repo") {
        path = ["TEAM", "THEME", "SUBCATEGORY", "REPO"];
    }

    const batch: AnalyticsRequestInput = {
        sankey: {
            path,
            measure: "COUNT" as MeasureInput,
            dateRange,
            maxNodes: 50,
            maxEdges: 200,
            useInvestment: true,
        },
        useInvestment: true,
        filters: graphqlFilters,
    };

    const response = await graphqlClient.query<AnalyticsQueryResponse>(
        INVESTMENT_FULL_QUERY,
        { orgId, batch },
        { orgId }
    );

    const result = adaptSankeyResult(response.analytics.sankey, "investment");

    // Map coverage if available in GraphQL response
    // (Note: The types need to be updated to include coverage, using "any" cast temporarily if needed)
    const sankeyData = response.analytics.sankey as unknown as { coverage?: { teamCoverage?: number, team_coverage?: number, repoCoverage?: number, repo_coverage?: number } };
    if (sankeyData?.coverage) {
        result.coverage = {
            team: Number(sankeyData.coverage.teamCoverage || sankeyData.coverage.team_coverage || 0),
            repo: Number(sankeyData.coverage.repoCoverage || sankeyData.coverage.repo_coverage || 0),
        };
    }

    return result;
}

/**
 * Fetch investment repo-team flow via GraphQL.
 *
 * Returns data in the same shape as the REST /api/v1/investment/flow/repo-team endpoint.
 */
export async function getInvestmentRepoTeamFlowViaGraphQL(params: {
    filters: MetricFilter;
    theme?: string | null;
}): Promise<SankeyResponse> {
    const { filters } = params;
    const orgId = getOrgId(filters);
    const dateRange = buildDateRange(filters);

    const batch: AnalyticsRequestInput = {
        sankey: {
            path: ["SUBCATEGORY", "REPO", "TEAM"] as DimensionInput[],
            measure: "COUNT" as MeasureInput,
            dateRange,
            maxNodes: 50,
            maxEdges: 200,
            useInvestment: true,
        },
        useInvestment: true,
        filters: translateMetricFilterToGraphQL(filters),
    };

    const response = await graphqlClient.query<AnalyticsQueryResponse>(
        INVESTMENT_FULL_QUERY,
        { orgId, batch },
        { orgId }
    );

    return adaptSankeyResult(response.analytics.sankey, "investment");
}
