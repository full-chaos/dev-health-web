/**
 * Server-side fetcher for the reviewEdges GraphQL query (CHAOS-2077).
 *
 * Mirrors the structure of cognitiveLoadFetchers.ts:
 * - Uses graphqlFetch from ./server (per-request urql client with auth + X-Org-Id).
 * - Asks for the served display name and key of each person (CHAOS-8485), not for the stored
 *   identities, and returns rows with no e-mail address in any field (CHAOS-7973): no address
 *   leaves the server. See reviewEdgeIdentities.ts.
 */

import { graphqlFetch } from "./server";
import { REVIEW_EDGES_QUERY } from "./queries";
import {
    withoutEmailAddresses,
    type ReviewEdgeRow,
    type ServedReviewEdgeRow,
} from "./reviewEdgeIdentities";

// ---------------------------------------------------------------------------
// Types (mirroring the generated SDL types to avoid an extra import chain)
// ---------------------------------------------------------------------------

/** A row as the page gets it: keys and names, never an e-mail address. */
export type { ReviewEdgeRow };

export interface ReviewEdgesResult {
    edges: ReviewEdgeRow[];
    totalCount: number;
}

interface ReviewEdgesQueryResponse {
    reviewEdges: { edges: ServedReviewEdgeRow[]; totalCount: number };
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
    // The served names and keys go to the page; an e-mail address, if one came, stops here.
    return {
        edges: withoutEmailAddresses(response.reviewEdges.edges),
        totalCount: response.reviewEdges.totalCount,
    };
}
