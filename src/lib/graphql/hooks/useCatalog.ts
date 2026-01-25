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

  const [result, reexecute] = useQuery<{ catalog: CatalogResult }>({
    query: CATALOG_VALUES_QUERY,
    variables: { orgId, dimension },
    pause,
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
export function useDimensionValues(
  options: UseDimensionValuesOptions
): UseDimensionValuesResult {
  const { orgId, dimension, pause = false } = options;

  const [result, reexecute] = useQuery<{ catalog: CatalogResult }>({
    query: CATALOG_VALUES_QUERY,
    variables: { orgId, dimension },
    pause,
  });

  return {
    values: result.data?.catalog?.values ?? [],
    loading: result.fetching,
    error: result.error ?? null,
    refetch: reexecute,
  };
}
