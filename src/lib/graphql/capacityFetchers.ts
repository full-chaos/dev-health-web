/**
 * GraphQL-based fetchers for Capacity Planning view.
 *
 * These fetchers use graphqlFetch
 * to query capacity forecast data from the backend.
 */

import { graphqlFetch } from "./urqlClient";
import { CAPACITY_FORECAST_QUERY, THROUGHPUT_FORECAST_QUERY } from "./queries";
import type {
    CapacityForecast,
    CapacityForecastInput,
    CapacityForecastQueryResponse,
    ThroughputForecast,
    ThroughputForecastInput,
    ThroughputForecastQueryResponse,
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
    input?: CapacityForecastInput,
): Promise<CapacityForecast | null> {
    const response = await graphqlFetch<CapacityForecastQueryResponse>(
        CAPACITY_FORECAST_QUERY,
        { orgId, input: input ?? null },
        { orgId },
    );

    return response.capacityForecast;
}

export async function getThroughputForecastViaGraphQL(
    orgId: string,
    input: ThroughputForecastInput,
): Promise<ThroughputForecast | null> {
    const response = await graphqlFetch<ThroughputForecastQueryResponse>(
        THROUGHPUT_FORECAST_QUERY,
        { orgId, input },
        { orgId },
    );

    return response.throughputForecast;
}
