import { useQuery } from "urql";

import { IMPROVE_OPPORTUNITIES_QUERY } from "../queries";
import type { ImproveOpportunitiesResult } from "../__generated__/types";

type HookResult = {
    data: { improveOpportunities: ImproveOpportunitiesResult } | undefined;
    fetching: boolean;
    error: Error | undefined;
};

export function useImproveOpportunities(limit = 10, windowDays = 30): HookResult {
    const [result] = useQuery<{ improveOpportunities: ImproveOpportunitiesResult }>({
        query: IMPROVE_OPPORTUNITIES_QUERY,
        variables: { scope: null, limit, windowDays },
        requestPolicy: "cache-and-network",
    });

    return { data: result.data, fetching: result.fetching, error: result.error };
}
