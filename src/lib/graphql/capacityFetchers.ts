/**
 * GraphQL-based fetchers for Capacity Planning view.
 *
 * These fetchers use the lightweight graphqlClient (fetch-based)
 * to query capacity forecast data from the backend.
 */

import { graphqlClient } from "./client";
import { CAPACITY_FORECAST_QUERY } from "./queries";
import type {
    CapacityForecast,
    CapacityForecastInput,
    CapacityForecastQueryResponse,
} from "./types";

/**
 * Fetch capacity forecast via GraphQL.
 *
 * @param orgId - Organization ID
 * @param input - Optional forecast input parameters
 * @returns Capacity forecast or null if not available
 */
export async function getCapacityForecastViaGraphQL(
    orgId: string,
    input?: CapacityForecastInput
): Promise<CapacityForecast | null> {
    const response = await graphqlClient.query<CapacityForecastQueryResponse>(
        CAPACITY_FORECAST_QUERY,
        { orgId, input: input ?? null },
        { orgId }
    );

    return response.capacityForecast;
}
