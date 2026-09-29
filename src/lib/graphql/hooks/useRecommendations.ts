import { useQuery } from "urql";

import { RECOMMENDATIONS_QUERY } from "../queries";
import type { Recommendation, WindowInput } from "../__generated__/types";
import { useOrgId } from "../provider";

interface UseRecommendationsOptions {
    /** Team id the recommendations are scoped to (backend requires a concrete team). */
    team: string;
    /** Rolling window; defaults to the schema default (4 weeks). */
    window?: WindowInput;
    pause?: boolean;
}

interface UseRecommendationsResult {
    data: Recommendation[] | undefined;
    loading: boolean;
    error: Error | null;
    refetch: () => void;
}

interface RecommendationsResponse {
    recommendations: Recommendation[];
}

const DEFAULT_WINDOW: WindowInput = { value: 4, unit: "WEEK" };

/**
 * Fetch backend-computed, rule-based recommendations for one team over a
 * window (CHAOS-7068 / CHAOS-6084). Recommendations are derived BACKEND-ONLY;
 * the web layer is render-only and never recomputes rules or severity.
 *
 * No web view calls this hook yet (typed query + hook only, no
 * new UI). `team` is required — the resolver has no org-wide
 * form — so callers must resolve a concrete team id before using this hook.
 */
export function useRecommendations(options: UseRecommendationsOptions): UseRecommendationsResult {
    const { team, window = DEFAULT_WINDOW, pause = false } = options;
    const orgId = useOrgId();

    const [result, reexecute] = useQuery<RecommendationsResponse>({
        query: RECOMMENDATIONS_QUERY,
        variables: { orgId: orgId ?? "", team, window },
        pause: pause || !orgId || !team,
        requestPolicy: "cache-and-network",
    });

    return {
        data: result.data?.recommendations,
        loading: result.fetching,
        error: result.error ?? null,
        refetch: reexecute,
    };
}
