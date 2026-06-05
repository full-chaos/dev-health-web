/**
 * GraphQL hook for analytics queries.
 */

import { useQuery } from "urql";
import { INVESTMENT_BREAKDOWN_QUERY } from "../queries";
import type {
    AnalyticsRequestInput,
    AnalyticsResult,
    DimensionInput,
    MeasureInput,
} from "../types";

interface UseAnalyticsOptions {
    orgId: string;
    batch: AnalyticsRequestInput;
    pause?: boolean;
}

interface UseAnalyticsResult {
    data: AnalyticsResult | null;
    loading: boolean;
    error: Error | null;
    refetch: () => void;
}

/**
 * Hook to fetch analytics data (breakdowns, timeseries, sankey).
 *
 * @param options - Query options
 * @returns Analytics data, loading state, and error
 */
export function useAnalytics(options: UseAnalyticsOptions): UseAnalyticsResult {
    const { orgId, batch, pause = false } = options;

    const [result, reexecute] = useQuery<{ analytics: AnalyticsResult }>({
        query: INVESTMENT_BREAKDOWN_QUERY,
        variables: { orgId, batch },
        pause,
        requestPolicy: "cache-and-network",
    });

    return {
        data: result.data?.analytics ?? null,
        loading: result.fetching,
        error: result.error ?? null,
        refetch: reexecute,
    };
}

interface UseBreakdownOptions {
    orgId: string;
    dimension: string;
    measure: string;
    startDate: string;
    endDate: string;
    topN?: number;
    pause?: boolean;
}

/**
 * Hook to fetch a single breakdown.
 */
export function useBreakdown(options: UseBreakdownOptions): UseAnalyticsResult {
    const { orgId, dimension, measure, startDate, endDate, topN = 10, pause = false } = options;

    const batch: AnalyticsRequestInput = {
        breakdowns: [
            {
                dimension: dimension as DimensionInput,
                measure: measure as MeasureInput,
                dateRange: { startDate, endDate },
                topN,
            },
        ],
        timeseries: [],
    };

    return useAnalytics({ orgId, batch, pause });
}

interface UseSankeyOptions {
    orgId: string;
    path: string[];
    measure: string;
    startDate: string;
    endDate: string;
    maxNodes?: number;
    maxEdges?: number;
    pause?: boolean;
}

/**
 * Hook to fetch Sankey flow data.
 */
export function useSankey(options: UseSankeyOptions): UseAnalyticsResult {
    const {
        orgId,
        path,
        measure,
        startDate,
        endDate,
        maxNodes = 50,
        maxEdges = 200,
        pause = false,
    } = options;

    const batch: AnalyticsRequestInput = {
        breakdowns: [],
        timeseries: [],
        sankey: {
            path: path as DimensionInput[],
            measure: measure as MeasureInput,
            dateRange: { startDate, endDate },
            maxNodes,
            maxEdges,
        },
    };

    return useAnalytics({ orgId, batch, pause });
}
