import { BUS_FACTOR_QUERY } from "./queries";
import { graphqlFetch } from "./urqlClient";
import type {
  BusFactorQueryResponse,
  BusFactorResult,
  BusFactorScopeInput,
} from "./types";

export async function getBusFactorViaGraphQL(
  orgId: string,
  scope?: BusFactorScopeInput
): Promise<BusFactorResult | null> {
  const response = await graphqlFetch<BusFactorQueryResponse>(
    BUS_FACTOR_QUERY,
    { orgId, scope: scope ?? null },
    { orgId }
  );

  return response.busFactor;
}
