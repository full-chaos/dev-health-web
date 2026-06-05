import { useMemo } from "react";
import { useQuery } from "urql";

import type { ChordGroupingDimension, ChordRecord } from "@/lib/types";

import { adaptSankeyToChord } from "../chordAdapter";
import { useOrgId } from "../provider";
import { FLOW_MATRIX_QUERY } from "../queries";
import type {
    AnalyticsQueryResponse,
    AnalyticsRequestInput,
    DimensionInput,
    MeasureInput,
} from "../types";

type UseChordFlowArgs = {
    orgId?: string;
    grouping: ChordGroupingDimension;
    dateRange: { startDate: string; endDate: string };
    measure?: string;
    pause?: boolean;
};

type UseChordFlowResult = {
    data: ChordRecord[] | null;
    fetching: boolean;
    error: unknown;
};

const GROUPING_TO_DIMENSION: Record<ChordGroupingDimension, DimensionInput> = {
    team: "TEAM",
    repo: "REPO",
    work_type: "WORK_TYPE",
};

/**
 * Fetch chord flow records from the native same-dimension `analytics.flowMatrix`
 * resolver. Produces directional N×N data, so inflow / outflow / net modes each
 * render distinct matrices (previously collapsed by the two-hop projection).
 */
export function useChordFlow(args: UseChordFlowArgs): UseChordFlowResult {
    const { orgId: orgIdOverride, grouping, dateRange, measure = "COUNT", pause = false } = args;
    const sessionOrgId = useOrgId();
    const orgId = orgIdOverride || sessionOrgId || "";

    const variables = useMemo(() => {
        const dimension = GROUPING_TO_DIMENSION[grouping];
        const batch: AnalyticsRequestInput = {
            flowMatrix: {
                dimension,
                measure: measure as MeasureInput,
                dateRange,
                maxNodes: 50,
                maxEdges: 200,
                useInvestment: true,
            },
            useInvestment: true,
        };

        return { orgId, batch };
    }, [dateRange, grouping, measure, orgId]);

    const [result] = useQuery<AnalyticsQueryResponse>({
        query: FLOW_MATRIX_QUERY,
        variables,
        pause: pause || !orgId,
        requestPolicy: "cache-and-network",
    });

    const data = useMemo<ChordRecord[] | null>(() => {
        if (result.fetching || result.error || !result.data?.analytics?.flowMatrix) {
            return null;
        }

        return adaptSankeyToChord(result.data.analytics.flowMatrix, grouping);
    }, [grouping, result.data, result.error, result.fetching]);

    return {
        data,
        fetching: result.fetching,
        error: result.error,
    };
}
