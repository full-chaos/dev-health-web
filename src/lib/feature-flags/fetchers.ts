import { auth } from "@/lib/auth";
import { graphqlFetch } from "@/lib/graphql/urqlClient";
import type { WorkGraphEdgesResult } from "@/lib/graphql/types";
import {
  FEATURE_FLAG_REGISTRY_QUERY,
  FEATURE_FLAG_EVENTS_QUERY,
  RELEASE_IMPACT_QUERY,
} from "./queries";
import type {
  FeatureFlagRegistryResult,
  FeatureFlagEventsResult,
  ReleaseImpactResult,
  FeatureFlagData,
} from "./types";

const EMPTY_RESULT: WorkGraphEdgesResult = {
  edges: [],
  totalCount: 0,
  pageInfo: { hasNextPage: false, hasPreviousPage: false },
};

async function resolveOrgId(orgId?: string): Promise<string> {
  if (orgId) return orgId;
  const session = await auth();
  return (session?.user?.org_id as string | undefined) ?? "default-org";
}

export async function fetchFeatureFlagRegistry(
  orgIdOverride?: string,
  limit: number = 500,
): Promise<FeatureFlagRegistryResult> {
  const orgId = await resolveOrgId(orgIdOverride);

  try {
    const res = await graphqlFetch<{ workGraphEdges: WorkGraphEdgesResult }>(
      FEATURE_FLAG_REGISTRY_QUERY,
      {
        orgId,
        filters: {
          sourceType: "FEATURE_FLAG",
          limit,
        },
      },
    );

    return {
      flags: res.workGraphEdges.edges,
      totalCount: res.workGraphEdges.totalCount,
      pageInfo: res.workGraphEdges.pageInfo,
    };
  } catch (error) {
    console.error("Failed to fetch feature flag registry:", error);
    return { flags: [], totalCount: 0, pageInfo: EMPTY_RESULT.pageInfo };
  }
}

export async function fetchFeatureFlagEvents(
  flagId: string,
  orgIdOverride?: string,
  limit: number = 200,
): Promise<FeatureFlagEventsResult> {
  const orgId = await resolveOrgId(orgIdOverride);

  try {
    const res = await graphqlFetch<{ workGraphEdges: WorkGraphEdgesResult }>(
      FEATURE_FLAG_EVENTS_QUERY,
      {
        orgId,
        filters: {
          nodeId: flagId,
          edgeType: "CONFIG_CHANGED_BY",
          limit,
        },
      },
    );

    return {
      events: res.workGraphEdges.edges,
      totalCount: res.workGraphEdges.totalCount,
      pageInfo: res.workGraphEdges.pageInfo,
    };
  } catch (error) {
    console.error("Failed to fetch feature flag events:", error);
    return { events: [], totalCount: 0, pageInfo: EMPTY_RESULT.pageInfo };
  }
}

export async function fetchReleaseImpact(
  releaseId: string,
  orgIdOverride?: string,
  limit: number = 200,
): Promise<ReleaseImpactResult> {
  const orgId = await resolveOrgId(orgIdOverride);

  try {
    const res = await graphqlFetch<{ workGraphEdges: WorkGraphEdgesResult }>(
      RELEASE_IMPACT_QUERY,
      {
        orgId,
        filters: {
          nodeId: releaseId,
          sourceType: "RELEASE",
          limit,
        },
      },
    );

    return {
      edges: res.workGraphEdges.edges,
      totalCount: res.workGraphEdges.totalCount,
      pageInfo: res.workGraphEdges.pageInfo,
    };
  } catch (error) {
    console.error("Failed to fetch release impact:", error);
    return { edges: [], totalCount: 0, pageInfo: EMPTY_RESULT.pageInfo };
  }
}

export async function fetchFeatureFlagData(
  orgIdOverride?: string,
): Promise<FeatureFlagData> {
  const orgId = await resolveOrgId(orgIdOverride);

  try {
    const [registry, events, releaseImpact] = await Promise.all([
      fetchFeatureFlagRegistry(orgId),
      fetchFeatureFlagEvents("", orgId),
      fetchReleaseImpact("", orgId),
    ]);

    return { registry, events, releaseImpact };
  } catch (error) {
    console.error("Failed to fetch feature flag data:", error);
    return {
      registry: { flags: [], totalCount: 0, pageInfo: EMPTY_RESULT.pageInfo },
      events: { events: [], totalCount: 0, pageInfo: EMPTY_RESULT.pageInfo },
      releaseImpact: { edges: [], totalCount: 0, pageInfo: EMPTY_RESULT.pageInfo },
    };
  }
}
