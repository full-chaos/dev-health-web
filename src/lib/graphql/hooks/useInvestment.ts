import { useQuery } from "urql";
import { useMemo } from "react";
import { AuthErrors } from "@/lib/constants/errors";
import {
    INVESTMENT_BREAKDOWN_QUERY,
    INVESTMENT_FULL_QUERY,
    WORK_ITEM_TEAM_ATTRIBUTIONS_QUERY,
} from "../queries";
import { selectPrimaryAttribution } from "@/lib/investment/teamAttribution";
import type { WorkItemTeamAttribution } from "../__generated__/types";
import type { MetricFilter } from "@/lib/filters/types";
import type { InvestmentResponse, SankeyResponse } from "@/lib/types";
import {
    AnalyticsQueryResponse,
    AnalyticsRequestInput,
    DimensionInput,
    FilterInput,
    MeasureInput,
    ScopeLevelInput,
} from "../types";
import { adaptSankeyResult } from "../investmentFetchers";
import { useOrgId } from "../provider";

function getOrgId(filters: MetricFilter, contextOrgId?: string): string {
    if (filters.scope.level === "org" && filters.scope.ids.length > 0) {
        return filters.scope.ids[0];
    }
    if (contextOrgId) {
        return contextOrgId;
    }
    throw new Error(AuthErrors.OrgIdRequiredFromGraphQLContext);
}

function buildDateRange(filters: MetricFilter): {
    startDate: string;
    endDate: string;
} {
    const { start_date, end_date, range_days } = filters.time;
    if (start_date && end_date) {
        return { startDate: start_date, endDate: end_date };
    }
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - range_days * 24 * 60 * 60 * 1000);
    return {
        startDate: startDate.toISOString().split("T")[0],
        endDate: endDate.toISOString().split("T")[0],
    };
}

function translateFilters(filters: MetricFilter): FilterInput {
    return {
        scope: {
            level: filters.scope.level.toUpperCase() as ScopeLevelInput,
            ids: filters.scope.ids,
        },
        who: filters.who.developers?.length ? { developers: filters.who.developers } : undefined,
        what: filters.what.repos?.length ? { repos: filters.what.repos } : undefined,
        why:
            filters.why.work_category?.length || filters.why.issue_type?.length
                ? {
                      workCategory: filters.why.work_category,
                      issueType: filters.why.issue_type,
                  }
                : undefined,
        how: filters.how.flow_stage?.length ? { flowStage: filters.how.flow_stage } : undefined,
    };
}

interface UseInvestmentMixOptions {
    filters: MetricFilter;
    pause?: boolean;
}

interface UseInvestmentMixResult {
    data: InvestmentResponse | null;
    loading: boolean;
    error: Error | null;
    refetch: () => void;
}

export function useInvestmentMix(options: UseInvestmentMixOptions): UseInvestmentMixResult {
    const { filters, pause = false } = options;
    const contextOrgId = useOrgId();

    const variables = useMemo(() => {
        const orgId = getOrgId(filters, contextOrgId);
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
            filters: translateFilters(filters),
        };
        return { orgId, batch };
    }, [filters, contextOrgId]);

    const [result, reexecute] = useQuery<AnalyticsQueryResponse>({
        query: INVESTMENT_BREAKDOWN_QUERY,
        variables,
        pause,
        requestPolicy: "cache-and-network",
    });

    const data = useMemo<InvestmentResponse | null>(() => {
        if (!result.data?.analytics) return null;

        const themeBreakdown = result.data.analytics.breakdowns.find(
            (b) => b.dimension.toLowerCase() === "theme",
        );
        const subcategoryBreakdown = result.data.analytics.breakdowns.find(
            (b) => b.dimension.toLowerCase() === "subcategory",
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
            evidence_quality_distribution:
                (result.data.analytics.evidenceQualityDistribution as
                    | Record<string, number>
                    | undefined) ?? undefined,
            evidence_quality_stats: result.data.analytics.evidenceQualityStats
                ? {
                      mean: result.data.analytics.evidenceQualityStats.mean ?? null,
                      stddev: result.data.analytics.evidenceQualityStats.stddev ?? null,
                      band_counts:
                          (result.data.analytics.evidenceQualityStats.bandCounts as Record<
                              string,
                              number
                          >) ?? {},
                      quality_drivers: [],
                  }
                : undefined,
        };
    }, [result.data]);

    return {
        data,
        loading: result.fetching,
        error: result.error ?? null,
        refetch: reexecute,
    };
}

type FlowMode = "team_category_repo" | "team_subcategory_repo" | "team_category_subcategory_repo";

interface UseInvestmentFlowOptions {
    filters: MetricFilter;
    flowMode?: FlowMode;
    theme?: string | null;
    topNRepos?: number;
    pause?: boolean;
}

interface UseInvestmentFlowResult {
    data: SankeyResponse | null;
    loading: boolean;
    error: Error | null;
    refetch: () => void;
}

export function useInvestmentFlow(options: UseInvestmentFlowOptions): UseInvestmentFlowResult {
    const { filters, flowMode = "team_category_repo", theme = null, pause = false } = options;
    const contextOrgId = useOrgId();

    const variables = useMemo(() => {
        const orgId = getOrgId(filters, contextOrgId);
        const dateRange = buildDateRange(filters);
        const graphqlFilters = translateFilters(filters);

        if (theme) {
            graphqlFilters.why = {
                ...(graphqlFilters.why ?? {}),
                workCategory: [theme],
            };
        }

        let path: DimensionInput[] = ["TEAM", "THEME", "REPO"];
        if (flowMode === "team_category_subcategory_repo") {
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
        return { orgId, batch };
    }, [filters, flowMode, theme, contextOrgId]);

    const [result, reexecute] = useQuery<AnalyticsQueryResponse>({
        query: INVESTMENT_FULL_QUERY,
        variables,
        pause,
        requestPolicy: "cache-and-network",
    });

    const data = useMemo<SankeyResponse | null>(() => {
        if (!result.data?.analytics?.sankey) return null;
        return adaptSankeyResult(result.data.analytics.sankey, "investment");
    }, [result.data]);

    return {
        data,
        loading: result.fetching,
        error: result.error ?? null,
        refetch: reexecute,
    };
}

interface UseInvestmentRepoTeamFlowOptions {
    filters: MetricFilter;
    theme?: string | null;
    pause?: boolean;
}

export function useInvestmentRepoTeamFlow(
    options: UseInvestmentRepoTeamFlowOptions,
): UseInvestmentFlowResult {
    const { filters, theme = null, pause = false } = options;
    const contextOrgId = useOrgId();

    const variables = useMemo(() => {
        const orgId = getOrgId(filters, contextOrgId);
        const dateRange = buildDateRange(filters);
        const graphqlFilters = translateFilters(filters);

        if (theme) {
            graphqlFilters.why = {
                ...(graphqlFilters.why ?? {}),
                workCategory: [theme],
            };
        }

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
            filters: graphqlFilters,
        };
        return { orgId, batch };
    }, [filters, theme, contextOrgId]);

    const [result, reexecute] = useQuery<AnalyticsQueryResponse>({
        query: INVESTMENT_FULL_QUERY,
        variables,
        pause,
        requestPolicy: "cache-and-network",
    });

    const data = useMemo<SankeyResponse | null>(() => {
        if (!result.data?.analytics?.sankey) return null;
        return adaptSankeyResult(result.data.analytics.sankey, "investment");
    }, [result.data]);

    return {
        data,
        loading: result.fetching,
        error: result.error ?? null,
        refetch: reexecute,
    };
}

interface UseWorkItemTeamAttributionsOptions {
    filters: MetricFilter;
    /** Work item IDs to fetch backend attribution provenance for. */
    workItemIds: string[];
    /** Optional team filter passed straight through to the backend. */
    teamId?: string | null;
    pause?: boolean;
}

interface UseWorkItemTeamAttributionsResult {
    /** workItemId -> primary backend attribution. Render-only; never recomputed. */
    byWorkItemId: Map<string, WorkItemTeamAttribution>;
    loading: boolean;
    error: Error | null;
    refetch: () => void;
}

interface WorkItemTeamAttributionsResponse {
    workItemTeamAttributions: WorkItemTeamAttribution[];
}

/**
 * Fetch backend-computed team-attribution provenance for a set of work items
 * (CHAOS-2608 / CS7). Attribution is resolved BACKEND-ONLY; this hook only
 * surfaces the `source`/`confidence` the system-of-record returned.
 */
export function useWorkItemTeamAttributions(
    options: UseWorkItemTeamAttributionsOptions,
): UseWorkItemTeamAttributionsResult {
    const { filters, workItemIds, teamId = null, pause = false } = options;
    const contextOrgId = useOrgId();

    const variables = useMemo(() => {
        // Provenance is render-only — a missing org context must NOT crash the
        // view. Resolve the org id defensively and pause instead of throwing.
        let orgId = "";
        try {
            orgId = getOrgId(filters, contextOrgId);
        } catch {
            orgId = "";
        }
        // Stable, de-duplicated ID list so urql can cache identical requests.
        const ids = Array.from(new Set(workItemIds)).sort();
        return { orgId, workItemIds: ids, teamId };
    }, [filters, workItemIds, teamId, contextOrgId]);

    const [result, reexecute] = useQuery<WorkItemTeamAttributionsResponse>({
        query: WORK_ITEM_TEAM_ATTRIBUTIONS_QUERY,
        variables,
        pause: pause || !variables.orgId || variables.workItemIds.length === 0,
        requestPolicy: "cache-and-network",
    });

    const byWorkItemId = useMemo(() => {
        const map = new Map<string, WorkItemTeamAttribution>();
        const rows = result.data?.workItemTeamAttributions ?? [];
        const grouped = new Map<string, WorkItemTeamAttribution[]>();
        for (const row of rows) {
            const bucket = grouped.get(row.workItemId);
            if (bucket) bucket.push(row);
            else grouped.set(row.workItemId, [row]);
        }
        for (const [workItemId, bucket] of grouped) {
            const primary = selectPrimaryAttribution(bucket);
            if (primary) map.set(workItemId, primary);
        }
        return map;
    }, [result.data]);

    return {
        byWorkItemId,
        loading: result.fetching,
        error: result.error ?? null,
        refetch: reexecute,
    };
}
