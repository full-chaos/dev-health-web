import { useQuery } from "urql";
import {
  CAPACITY_FORECAST_QUERY,
  CAPACITY_FORECASTS_QUERY,
} from "../queries";
import type {
  CapacityForecast,
  CapacityForecastConnection,
  CapacityForecastFilterInput,
  CapacityForecastInput,
  CapacityForecastQueryResponse,
  CapacityForecastsQueryResponse,
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

export function useCapacityForecast(
  options: UseCapacityForecastOptions
): UseCapacityForecastResult {
  const { orgId, input, pause = false } = options;

  const [result, reexecute] = useQuery<CapacityForecastQueryResponse>({
    query: CAPACITY_FORECAST_QUERY,
    variables: { orgId, input },
    pause,
  });

  return {
    data: result.data?.capacityForecast ?? null,
    loading: result.fetching,
    error: result.error ?? null,
    refetch: reexecute,
  };
}

interface UseCapacityForecastsOptions {
  orgId: string;
  filters?: CapacityForecastFilterInput;
  pause?: boolean;
}

interface UseCapacityForecastsResult {
  data: CapacityForecastConnection | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useCapacityForecasts(
  options: UseCapacityForecastsOptions
): UseCapacityForecastsResult {
  const { orgId, filters, pause = false } = options;

  const [result, reexecute] = useQuery<CapacityForecastsQueryResponse>({
    query: CAPACITY_FORECASTS_QUERY,
    variables: { orgId, filters },
    pause,
  });

  return {
    data: result.data?.capacityForecasts ?? null,
    loading: result.fetching,
    error: result.error ?? null,
    refetch: reexecute,
  };
}
