import { AuthErrors } from "@/lib/constants/errors";
import { getCapacityForecastViaGraphQL } from "@/lib/graphql/capacityFetchers";
import type {
  CapacityForecast,
  CapacityForecastInput,
} from "@/lib/graphql/types";
import { getAuth } from "./_shared";

export async function getCapacityForecast(params: {
  orgId?: string;
  input?: CapacityForecastInput;
}): Promise<CapacityForecast | null> {
  let orgId = params.orgId;
  if (!orgId) {
    const auth = await getAuth();
    const session = await auth();
    orgId = session?.user?.org_id;
  }
  if (!orgId) {
    throw new Error(AuthErrors.OrgIdRequiredFromSession);
  }
  return getCapacityForecastViaGraphQL(orgId, params.input);
}
