/**
 * GraphQL fetchers for the Improve area — Experiments sub-area (CHAOS-2219).
 *
 * v1: experiments are derived from OpportunityCard.suggested_experiments at
 * query-time; ``derivedFromOpportunities`` signals whether live opportunity
 * data was available.
 */

import { EXPERIMENTS_QUERY } from "./queries";
import { graphqlFetch } from "./urqlClient";
import type { ExperimentsQueryResponse, ExperimentsResult, FilterInput } from "./types";

/**
 * Fetch derived experiments for the Improve / Experiments page.
 *
 * Returns null if the GraphQL query fails — callers should render a DataState
 * variant rather than throwing.
 */
export async function getExperimentsViaGraphQL(
    orgId: string,
    filters?: FilterInput | null,
): Promise<ExperimentsResult | null> {
    try {
        const response = await graphqlFetch<ExperimentsQueryResponse>(
            EXPERIMENTS_QUERY,
            { orgId, filters: filters ?? null },
            { orgId },
        );
        return response.experiments;
    } catch {
        return null;
    }
}
