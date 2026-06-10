/**
 * Server-side fetcher for the cognitiveLoad GraphQL query (CHAOS-2077).
 *
 * Mirrors the structure of workGraphFetchers.ts:
 * - Uses graphqlFetch from ./server (per-request urql client with auth + X-Org-Id).
 * - Returns the raw result object; the caller maps it to UI shapes.
 */

import { graphqlFetch } from "./server";
import { COGNITIVE_LOAD_QUERY } from "./queries";

// ---------------------------------------------------------------------------
// Types (mirroring the generated SDL types to avoid an extra import chain)
// ---------------------------------------------------------------------------

export interface CognitiveLoadSignal {
    day: string; // Date scalar → ISO string "YYYY-MM-DD"
    prInterruptionLoad: number;
    contextSpreadCount: number;
    reviewRequestLoad: number;
    afterHoursCommitRatio: number | null | undefined;
    weekendCommitRatio: number | null | undefined;
}

export interface CognitiveLoadResult {
    orgId: string;
    teamId: string | null | undefined;
    totalDays: number;
    signals: CognitiveLoadSignal[];
}

interface CognitiveLoadQueryResponse {
    cognitiveLoad: CognitiveLoadResult;
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

/**
 * Fetch cognitive-load signals server-side via the cognitiveLoad GraphQL resolver.
 *
 * @param orgId     - Org scope (required by the resolver; also sent as X-Org-Id header).
 * @param sinceDate - Start of the time window, inclusive ("YYYY-MM-DD").
 * @param untilDate - End of the time window, inclusive ("YYYY-MM-DD").
 * @param teamId    - Optional team filter.  When the active filter scope is "team",
 *                    pass the team id so the resolver can scope team_metrics_daily.
 */
export async function getCognitiveLoadViaGraphQL(params: {
    orgId: string;
    sinceDate: string;
    untilDate: string;
    teamId?: string | null;
}): Promise<CognitiveLoadResult> {
    const response = await graphqlFetch<CognitiveLoadQueryResponse>(
        COGNITIVE_LOAD_QUERY,
        {
            input: {
                orgId: params.orgId,
                sinceDate: params.sinceDate,
                untilDate: params.untilDate,
                teamId: params.teamId ?? null,
            },
        },
        { orgId: params.orgId },
    );
    return response.cognitiveLoad;
}
