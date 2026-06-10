/**
 * Server-side fetcher for the reviewEdges GraphQL query (CHAOS-2077).
 *
 * Mirrors the structure of cognitiveLoadFetchers.ts:
 * - Uses graphqlFetch from ./server (per-request urql client with auth + X-Org-Id).
 * - Returns the raw result object; the caller maps it to UI shapes.
 */

import { graphqlFetch } from "./server";
import { REVIEW_EDGES_QUERY } from "./queries";

// ---------------------------------------------------------------------------
// Types (mirroring the generated SDL types to avoid an extra import chain)
// ---------------------------------------------------------------------------

export interface ReviewEdgeRow {
    reviewer: string; // email
    author: string; // email
    reviewsCount: number;
    day: string; // Date scalar → ISO string "YYYY-MM-DD"
    repoId: string | null | undefined;
}

export interface ReviewEdgesResult {
    edges: ReviewEdgeRow[];
    totalCount: number;
}

interface ReviewEdgesQueryResponse {
    reviewEdges: ReviewEdgesResult;
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

/**
 * Fetch reviewer→author collaboration edges server-side via the reviewEdges GraphQL resolver.
 *
 * @param orgId     - Org scope (required by the resolver; also sent as X-Org-Id header).
 * @param sinceDate - Start of the time window, inclusive ("YYYY-MM-DD").
 * @param untilDate - End of the time window, inclusive ("YYYY-MM-DD").
 * @param repoIds   - Optional repo filter. When the active filter scope targets specific
 *                    repositories, pass them so the resolver narrows review_edges_daily.
 * @param limit     - Max rows to return (default 500, as per SDL default).
 */
export async function getReviewEdgesViaGraphQL(params: {
    orgId: string;
    sinceDate: string;
    untilDate: string;
    repoIds?: string[] | null;
    limit?: number;
}): Promise<ReviewEdgesResult> {
    const response = await graphqlFetch<ReviewEdgesQueryResponse>(
        REVIEW_EDGES_QUERY,
        {
            input: {
                orgId: params.orgId,
                sinceDate: params.sinceDate,
                untilDate: params.untilDate,
                repoIds: params.repoIds ?? null,
                limit: params.limit ?? 500,
            },
        },
        { orgId: params.orgId },
    );
    return response.reviewEdges;
}
