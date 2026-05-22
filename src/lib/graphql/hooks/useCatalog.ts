/**
 * GraphQL hook for catalog queries.
 */

import { useQuery } from "urql";
import { CATALOG_VALUES_QUERY } from "../queries";
import type { CatalogResult, DimensionInput } from "../types";

interface UseCatalogOptions {
  orgId: string;
  dimension?: DimensionInput;
  pause?: boolean;
}

interface UseCatalogResult {
  data: CatalogResult | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to fetch catalog data (dimensions, measures, limits).
 *
 * @param options - Query options
 * @returns Catalog data, loading state, and error
 */
export function useCatalog(options: UseCatalogOptions): UseCatalogResult {
  const { orgId, dimension, pause = false } = options;

  // Catalog values (teams, repos, services, dimensions) are semi-static
  // reference data that rarely changes within a session. Override the client
  // default (`cache-and-network`) with `cache-first` so mounting a filter
  // dropdown doesn't trigger a network request every time — the cache is
  // authoritative until an explicit `reexecute()` call. (CHAOS-1225)
  const [result, reexecute] = useQuery<{ catalog: CatalogResult }>({
    query: CATALOG_VALUES_QUERY,
    variables: { orgId, dimension },
    pause,
    requestPolicy: "cache-first",
  });

  return {
    data: result.data?.catalog ?? null,
    loading: result.fetching,
    error: result.error ?? null,
    refetch: reexecute,
  };
}

interface UseDimensionValuesOptions {
  orgId: string;
  dimension: DimensionInput;
  pause?: boolean;
}

interface DimensionValue {
  value: string;
  count: number;
}

interface UseDimensionValuesResult {
  values: DimensionValue[];
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Hook to fetch distinct values for a dimension.
 *
 * @param options - Query options
 * @returns Dimension values, loading state, and error
 */
export function useDimensionValues(options: UseDimensionValuesOptions): UseDimensionValuesResult {
  const { orgId, dimension, pause = false } = options;

  const [result, reexecute] = useQuery<{ catalog: CatalogResult }>({
    query: CATALOG_VALUES_QUERY,
    variables: { orgId, dimension },
    pause,
    requestPolicy: "cache-first",
  });

  return {
    values: result.data?.catalog?.values ?? [],
    loading: result.fetching,
    error: result.error ?? null,
    refetch: reexecute,
  };
}
