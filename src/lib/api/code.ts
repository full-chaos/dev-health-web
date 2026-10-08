import { AuthErrors } from "@/lib/constants/errors";
import type { MetricFilter } from "@/lib/filters/types";
import {
    complexityScopeInputFromFilter,
    complexityWindowFromFilter,
} from "@/lib/complexity/filters";
import { getBusFactorViaGraphQL } from "@/lib/graphql/codeFetchers";
import { HOTSPOTS_QUERY } from "@/lib/graphql/queries";
import { graphqlFetch } from "@/lib/graphql/server";
import type { BusFactor, BusFactorScopeInput } from "@/lib/graphql/types";
import type { RepoHotspot } from "@/lib/graphql/__generated__/types";

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

/**
 * Each repository's single highest-risk file, as served by `hotspots.repos`: no repository score,
 * no count. The file rows themselves are not used here, so the smallest row limit is asked for.
 */
export async function getRepoTopHotspots(filters: MetricFilter): Promise<RepoHotspot[]> {
    const auth = await getAuth();
    const session = await auth();
    const orgId = session?.user?.org_id;

    if (!orgId) {
        throw new Error(AuthErrors.OrgIdRequiredFromSession);
    }

    const { sinceUtc, untilUtc } = complexityWindowFromFilter(filters.time);
    const data = await graphqlFetch<{ hotspots: { repos: RepoHotspot[] } }>(
        HOTSPOTS_QUERY,
        {
            input: {
                orgId,
                sinceUtc,
                untilUtc,
                ...complexityScopeInputFromFilter(filters),
                limit: 1,
            },
        },
        { orgId },
    );
    return data.hotspots?.repos ?? [];
}
