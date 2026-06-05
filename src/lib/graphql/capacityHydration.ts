/**
 * RSC → client hydration fetchers for the Capacity view (CHAOS-1276 Phase E).
 *
 * Mirrors the variable-building logic of `useCapacityForecast` in
 * `./hooks/useCapacityForecast.ts` so the server-issued urql operation has the
 * same cache key as the client-issued one. Any drift here silently breaks
 * hydration — keep the two in sync.
 */

import type { SSRData } from "@urql/core";
import type { MetricFilter } from "@/lib/filters/types";
import { CAPACITY_FORECAST_QUERY } from "./queries";
import { graphqlFetchForHydration } from "./server";
import type {
    CapacityForecast,
    CapacityForecastInput,
    CapacityForecastQueryResponse,
} from "./types";

/**
 * Build the exact variables used by `useCapacityForecast`'s client-side query.
 *
 * Exported so tests can assert parity against the client hook without
 * reimplementing the shape; keep the two in sync.
 */
export function buildCapacityForecastVariables(
    filters: MetricFilter,
    orgId: string,
): { orgId: string; input: CapacityForecastInput } {
    const teamId =
        filters.scope.level === "team" && filters.scope.ids.length > 0
            ? filters.scope.ids[0]
            : undefined;

    const historyDays = filters.time.range_days ?? 90;

    return {
        orgId,
        input: {
            teamId,
            historyDays,
        },
    };
}

/**
 * Server-side capacity forecast fetch that returns both the GraphQL response
 * data and the urql `SSRData` payload keyed to the client hook's cache entry.
 * Pair with `<HydrateUrqlResults>` on a client boundary to eliminate the
 * server → client double-fetch.
 */
export async function getCapacityForecastForHydration(
    filters: MetricFilter,
    orgId: string,
): Promise<{ data: CapacityForecast | null; hydrationPayload: SSRData }> {
    const variables = buildCapacityForecastVariables(filters, orgId);
    const { data, hydrationPayload } =
        await graphqlFetchForHydration<CapacityForecastQueryResponse>(
            CAPACITY_FORECAST_QUERY,
            variables,
            { orgId },
        );

    return {
        data: data.capacityForecast,
        hydrationPayload,
    };
}
