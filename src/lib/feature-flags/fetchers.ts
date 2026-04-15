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
  FeatureFlagsData,
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

function classifySeverity(delta: number): "low" | "moderate" | "high" | "critical" {
  const abs = Math.abs(delta);
  if (abs >= 25) return "critical";
  if (abs >= 15) return "high";
  if (abs >= 5) return "moderate";
  return "low";
}

export async function fetchFeatureFlagsData(
  _dateRange: { startDate: string; endDate: string },
  isTestMode?: boolean,
): Promise<FeatureFlagsData> {
  if (isTestMode) {
    const { SAMPLE_FEATURE_FLAGS_DATA } = await import("./sample-data");
    return SAMPLE_FEATURE_FLAGS_DATA;
  }

  try {
    const registry = await fetchFeatureFlagRegistry();
    const impact = await fetchReleaseImpact("");

    const activeFlags = registry.totalCount;
    const frictionEdges = impact.edges.filter(e => e.evidence?.includes("friction"));
    const errorEdges = impact.edges.filter(e => e.evidence?.includes("error"));

    const avgFriction = frictionEdges.length > 0
      ? frictionEdges.reduce((sum, e) => sum + (e.confidence ?? 0), 0) / frictionEdges.length * 100
      : 0;
    const avgError = errorEdges.length > 0
      ? errorEdges.reduce((sum, e) => sum + (e.confidence ?? 0), 0) / errorEdges.length * 100
      : 0;

    const totalReleases = impact.totalCount || 1;
    const withTelemetry = impact.edges.filter(e => e.edgeType === "IMPACTS").length;
    const coverageRatio = Math.round((withTelemetry / totalReleases) * 100);

    return {
      summary: {
        activeFlags,
        activeFlagsDelta: 0,
        activeFlagsSpark: [],
        releaseFrictionDelta: Math.round(avgFriction * 10) / 10,
        releaseFrictionSeverity: classifySeverity(avgFriction),
        releaseFrictionSpark: [],
        releaseErrorRateDelta: Math.round(-avgError * 10) / 10,
        releaseErrorRateSpark: [],
        coverageRatio,
        coverageRatioDelta: 0,
        coverageRatioSpark: [],
      },
    };
  } catch (error) {
    console.error("Failed to fetch feature flags summary:", error);
    return {
      summary: {
        activeFlags: 0,
        activeFlagsDelta: 0,
        activeFlagsSpark: [],
        releaseFrictionDelta: 0,
        releaseFrictionSeverity: "low",
        releaseFrictionSpark: [],
        releaseErrorRateDelta: 0,
        releaseErrorRateSpark: [],
        coverageRatio: 0,
        coverageRatioDelta: 0,
        coverageRatioSpark: [],
      },
    };
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
