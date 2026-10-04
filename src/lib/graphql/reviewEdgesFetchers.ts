/**
 * Server-side fetcher for the reviewEdges GraphQL query (CHAOS-2077).
 *
 * Mirrors the structure of cognitiveLoadFetchers.ts:
 * - Uses graphqlFetch from ./server (per-request urql client with auth + X-Org-Id).
 * - Returns the rows with every e-mail address taken out (CHAOS-7973): the stored identity of a
 *   person can be an e-mail address, and no address leaves the server. See reviewEdgeIdentities.ts.
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
 * @param teamIds   - Optional team scope (CHAOS-7785): the repositories these teams OWN. Sent only
 *                    when non-empty, so a query-api that predates the field is not asked for it.
 * @param limit     - Max rows to return (default 500, as per SDL default).
 */
export async function getReviewEdgesViaGraphQL(params: {
    orgId: string;
    sinceDate: string;
    untilDate: string;
    repoIds?: string[] | null;
    teamIds?: string[] | null;
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
                ...(params.teamIds && params.teamIds.length > 0 ? { teamIds: params.teamIds } : {}),
                limit: params.limit ?? 500,
            },
        },
        { orgId: params.orgId },
    );
    // The served identities can be e-mail addresses: they stop here.
    return {
        edges: withoutEmailAddresses(response.reviewEdges.edges),
        totalCount: response.reviewEdges.totalCount,
    };
}
