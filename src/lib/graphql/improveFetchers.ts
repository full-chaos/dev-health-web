/**
 * GraphQL fetchers for the Improve area — Experiments sub-area (CHAOS-2219).
 *
 * v1: experiments are derived from OpportunityCard.suggested_experiments at
 * query-time; ``derivedFromOpportunities`` signals whether live opportunity
 * data was available.
 */

import type { MetricFilter } from "@/lib/filters/types";
import { EXPERIMENTS_QUERY } from "./queries";
import { translateMetricFilterToGraphQL } from "./investmentFetchers";
import { graphqlFetch } from "./urqlClient";
import type { ExperimentsQueryResponse, ExperimentsResult } from "./types";

/**
 * Fetch derived experiments for the Improve / Experiments page.
 *
 * Accepts the standard MetricFilter (from URL params / filterFromQueryParams)
 * and translates it to GraphQL FilterInput before sending — normalising
 * scope.level from lowercase ("org", "team") to GraphQL uppercase ("ORG", "TEAM").
 *
 * Returns null if the GraphQL query fails — callers should render a DataState
 * variant rather than throwing.
 */
export async function getExperimentsViaGraphQL(
    orgId: string,
    filters?: MetricFilter | null,
): Promise<ExperimentsResult | null> {
    try {
        const graphqlFilters = filters ? translateMetricFilterToGraphQL(filters) : null;
        const response = await graphqlFetch<ExperimentsQueryResponse>(
            EXPERIMENTS_QUERY,
            { orgId, filters: graphqlFilters },
            { orgId },
        );
        return response.experiments;
    } catch {
        return null;
    }
}
