import { AuthErrors } from "@/lib/constants/errors";
import type { MetricFilter } from "@/lib/filters/types";
import { getBusFactorViaGraphQL } from "@/lib/graphql/codeFetchers";
import type { BusFactor, BusFactorScopeInput } from "@/lib/graphql/types";

import { getAuth } from "./_shared";

export async function getBusFactorData(filters: MetricFilter): Promise<BusFactor | null> {
  const auth = await getAuth();
  const session = await auth();
  const orgId = session?.user?.org_id;

  if (!orgId) {
    throw new Error(AuthErrors.OrgIdRequiredFromSession);
  }

  const scope: BusFactorScopeInput | undefined =
    filters.scope.level === "repo" && filters.scope.ids[0]
      ? { repoId: filters.scope.ids[0] }
      : filters.scope.level === "team" && filters.scope.ids[0]
        ? { teamId: filters.scope.ids[0] }
        : undefined;

  return getBusFactorViaGraphQL(orgId, scope);
}
