import { useQuery } from "urql";

import { AI_COMPARISON_QUERY, AI_IMPACT_SUMMARY_QUERY, AI_OPPORTUNITIES_QUERY } from "../queries";
import { useOrgId } from "../provider";
import type { AIFilter } from "@/lib/filters/ai";
import type {
    AiComparison,
    AiDateRangeInput,
    AiImpactSummary,
    AiOpportunitiesResult,
    AiScopeInput,
} from "../__generated__/types";

export function toAIQueryVariables(filter: AIFilter): {
    dateRange: AiDateRangeInput;
    scope: AiScopeInput;
} {
    return {
        dateRange: {
            startDate: filter.startDate,
            endDate: filter.endDate,
        },
        scope: {
            repoId: filter.repoId ?? null,
            teamId: filter.teamId ?? null,
            workType: filter.workType ?? null,
            buckets: filter.buckets ?? null,
        },
    };
}

type HookResult<T> = {
    data: T | undefined;
    fetching: boolean;
    error: Error | undefined;
};

export function useAIImpactSummary(
    filter: AIFilter,
): HookResult<{ aiImpactSummary: AiImpactSummary }> {
    const orgId = useOrgId();
    const { dateRange, scope } = toAIQueryVariables(filter);
    const [result] = useQuery<{ aiImpactSummary: AiImpactSummary }>({
        query: AI_IMPACT_SUMMARY_QUERY,
        variables: { orgId: orgId ?? "", dateRange, scope },
        pause: !orgId,
        requestPolicy: "cache-and-network",
    });

    return { data: result.data, fetching: result.fetching, error: result.error };
}

export function useAIComparison(filter: AIFilter): HookResult<{ aiComparison: AiComparison }> {
    const orgId = useOrgId();
    const { dateRange, scope } = toAIQueryVariables(filter);
    const [result] = useQuery<{ aiComparison: AiComparison }>({
        query: AI_COMPARISON_QUERY,
        variables: { orgId: orgId ?? "", dateRange, scope },
        pause: !orgId,
        requestPolicy: "cache-and-network",
    });

    return { data: result.data, fetching: result.fetching, error: result.error };
}

export function useAIOpportunities(
    filter: AIFilter,
): HookResult<{ aiOpportunities: AiOpportunitiesResult }> {
    const orgId = useOrgId();
    const { scope } = toAIQueryVariables(filter);
    const [result] = useQuery<{ aiOpportunities: AiOpportunitiesResult }>({
        query: AI_OPPORTUNITIES_QUERY,
        variables: { orgId: orgId ?? "", scope, limit: 5 },
        pause: !orgId,
        requestPolicy: "cache-and-network",
    });

    return { data: result.data, fetching: result.fetching, error: result.error };
}
