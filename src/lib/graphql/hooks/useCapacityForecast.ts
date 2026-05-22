/**
 * GraphQL hook for capacity forecast queries.
 *
 * Uses urql's useQuery for automatic caching, deduplication,
 * and loading state management.
 */

import { useQuery } from "urql";
import { CAPACITY_FORECAST_QUERY } from "../queries";
import type {
  CapacityForecast,
  CapacityForecastInput,
  CapacityForecastQueryResponse,
} from "../types";

interface UseCapacityForecastOptions {
  orgId: string;
  input?: CapacityForecastInput;
  pause?: boolean;
}

interface UseCapacityForecastResult {
  data: CapacityForecast | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to fetch capacity forecast data via GraphQL.
 *
 * @param options - Query options including orgId and optional forecast input
 * @returns Capacity forecast data, loading state, error, and refetch function
 *
 * @example
 * ```tsx
 * function CapacityView({ orgId, teamId }) {
 *   const { data, loading, error, refetch } = useCapacityForecast({
 *     orgId,
 *     input: { teamId, historyDays: 90 },
 *   });
 *
 *   if (loading) return <Spinner />;
 *   if (error) return <Error message={error.message} />;
 *   return <ForecastChart forecast={data} />;
 * }
 * ```
 */
export function useCapacityForecast(
  options: UseCapacityForecastOptions,
): UseCapacityForecastResult {
  const { orgId, input, pause = false } = options;

  const [result, reexecute] = useQuery<CapacityForecastQueryResponse>({
    query: CAPACITY_FORECAST_QUERY,
    variables: { orgId, input: input ?? null },
    pause,
    requestPolicy: "cache-and-network",
  });

  return {
    data: result.data?.capacityForecast ?? null,
    loading: result.fetching,
    error: result.error ?? null,
    refetch: reexecute,
  };
}
