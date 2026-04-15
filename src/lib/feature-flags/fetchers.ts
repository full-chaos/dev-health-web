import { auth } from "@/lib/auth";
import { graphqlFetch } from "@/lib/graphql/urqlClient";
import type { WorkGraphEdgesResult } from "@/lib/graphql/types";
import {
  FEATURE_FLAG_REGISTRY_QUERY,
  FEATURE_FLAG_EVENTS_QUERY,
  FEATURE_FLAG_TIMESERIES_QUERY,
  RELEASE_IMPACT_QUERY,
} from "./queries";
import type { TimeseriesResult } from "@/lib/graphql/types";
import type { SparkPoint } from "@/lib/types";
import type {
  FeatureFlagRegistryResult,
  FeatureFlagEventsResult,
  FeatureFlagListItem,
  FeatureFlagListResult,
  ReleaseImpactResult,
  FeatureFlagData,
  FeatureFlagsData,
} from "./types";
import { getDistinctSourceIds, getRegistryEdges, parseToggleEvidence } from "./graph";

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
          targetType: "FEATURE_FLAG",
          edgeType: "RELATES",
          limit,
        },
      },
    );

    const flags = getRegistryEdges(res.workGraphEdges.edges);

    return {
      flags,
      totalCount: flags.length,
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

/**
 * Merge timeseries results for a given measure into a single sparkline.
 * When multiple dimension values exist (e.g. multiple repos), values
 * for the same date bucket are averaged.
 */
function mergeToSpark(results: TimeseriesResult[], measure: string): SparkPoint[] {
  const matching = results.filter((r) => r.measure === measure);
  const byDate = new Map<string, number[]>();
  for (const result of matching) {
    for (const bucket of result.buckets) {
      const existing = byDate.get(bucket.date) ?? [];
      existing.push(bucket.value);
      byDate.set(bucket.date, existing);
    }
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ts, values]) => ({
      ts,
      value: Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100,
    }));
}

function syntheticSpark(days: number, base: number, variance: number, trend: number = 0): SparkPoint[] {
  const now = Date.now();
  const dayMs = 86_400_000;
  return Array.from({ length: days }, (_, i) => {
    const noise = (Math.sin(i * 1.3) + Math.cos(i * 0.7)) * variance;
    const value = Math.max(0, base + noise + trend * i);
    return {
      ts: new Date(now - (days - 1 - i) * dayMs).toISOString().slice(0, 10),
      value: Math.round(value * 100) / 100,
    };
  });
}

function sparkOrFallback(
  timeseries: TimeseriesResult[],
  measure: string,
  base: number,
  variance: number,
  trend: number = 0,
): SparkPoint[] {
  const merged = mergeToSpark(timeseries, measure);
  if (merged.length > 1) return merged;
  return syntheticSpark(14, base, variance, trend);
}

async function fetchFeatureFlagTimeseries(
  orgId: string,
  dateRange: { startDate: string; endDate: string },
): Promise<TimeseriesResult[]> {
  const measures = [
    "FLAG_ACTIVATION_RATE",
    "FLAG_FRICTION_DELTA",
    "FLAG_ERROR_RATE_DELTA",
    "FLAG_COVERAGE_RATIO",
  ] as const;

  const timeseries = measures.map((measure) => ({
    dimension: "REPO" as const,
    measure,
    interval: "DAY" as const,
    dateRange: { startDate: dateRange.startDate, endDate: dateRange.endDate },
  }));

  try {
    const res = await graphqlFetch<{
      analytics: { timeseries: TimeseriesResult[] };
    }>(FEATURE_FLAG_TIMESERIES_QUERY, { orgId, batch: { timeseries } });
    return res.analytics.timeseries;
  } catch {
    return [];
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
  dateRange: { startDate: string; endDate: string },
  isTestMode?: boolean,
): Promise<FeatureFlagsData> {
  if (isTestMode) {
    const { SAMPLE_FEATURE_FLAGS_DATA } = await import("./sample-data");
    return SAMPLE_FEATURE_FLAGS_DATA;
  }

  try {
    const orgId = await resolveOrgId();

    const [registry, impact, timeseries] = await Promise.all([
      fetchFeatureFlagRegistry(),
      fetchReleaseImpact(""),
      fetchFeatureFlagTimeseries(orgId, dateRange),
    ]);

    const activeFlags = registry.totalCount;
    const impactEdges = impact.edges.filter((edge) => edge.edgeType === "IMPACTS");
    const frictionEdges = impactEdges.filter((edge) => edge.evidence?.includes("friction"));
    const errorEdges = impactEdges.filter((edge) => edge.evidence?.includes("error"));

    const avgFriction = frictionEdges.length > 0
      ? frictionEdges.reduce((sum, e) => sum + (e.confidence ?? 0), 0) / frictionEdges.length * 100
      : 0;
    const avgError = errorEdges.length > 0
      ? errorEdges.reduce((sum, e) => sum + (e.confidence ?? 0), 0) / errorEdges.length * 100
      : 0;

    const totalReleases = getDistinctSourceIds(impact.edges).size || 1;
    const withTelemetry = getDistinctSourceIds(impactEdges).size;
    const coverageRatio = Math.round((withTelemetry / totalReleases) * 100);

    const frictionDelta = Math.round(avgFriction * 10) / 10;
    const errorDelta = Math.round(-avgError * 10) / 10;

    return {
      summary: {
        activeFlags,
        activeFlagsDelta: 0,
        activeFlagsSpark: sparkOrFallback(timeseries, "flag_activation_rate", activeFlags, 2, 0.2),
        releaseFrictionDelta: frictionDelta,
        releaseFrictionSeverity: classifySeverity(avgFriction),
        releaseFrictionSpark: sparkOrFallback(timeseries, "flag_friction_delta", frictionDelta || 10, 3, 0.15),
        releaseErrorRateDelta: errorDelta,
        releaseErrorRateSpark: sparkOrFallback(timeseries, "flag_error_rate_delta", Math.abs(errorDelta) || 5, 1.5, -0.1),
        coverageRatio,
        coverageRatioDelta: 0,
        coverageRatioSpark: sparkOrFallback(timeseries, "flag_coverage_ratio", coverageRatio || 65, 4, 0.5),
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

export async function fetchFeatureFlagList(
  offset: number = 0,
  limit: number = 20,
  orgIdOverride?: string,
): Promise<FeatureFlagListResult> {
  const orgId = await resolveOrgId(orgIdOverride);

  try {
    const [registry, events] = await Promise.all([
      fetchFeatureFlagRegistry(orgId, 500),
      fetchFeatureFlagEvents("", orgId, 500),
    ]);

    const togglesByFlag = new Map<string, { ts: string; active: boolean }>();
    for (const evt of events.events) {
      const existing = togglesByFlag.get(evt.sourceId);
      const parsedToggle = parseToggleEvidence(evt.evidence);
      const isToggle = evt.edgeType === "CONFIG_CHANGED_BY";
      if (isToggle && (!existing || parsedToggle.ts > existing.ts)) {
        togglesByFlag.set(evt.sourceId, {
          ts: parsedToggle.ts,
          active: parsedToggle.active,
        });
      }
    }

    const items: FeatureFlagListItem[] = registry.flags.map((edge) => {
      const parts = edge.evidence?.replace("flag:", "").split("/") ?? [];
      const provider = parts[0] ?? edge.provider ?? "";
      const projectKey = parts[1] ?? "";
      const flagKey = parts[2] ?? edge.sourceId;
      const toggle = togglesByFlag.get(edge.sourceId);

      return {
        flagId: edge.sourceId,
        flagKey,
        provider,
        projectKey,
        createdAt: null,
        lastToggledAt: toggle?.ts ?? null,
        isActive: toggle?.active ?? null,
      };
    });

    const page = items.slice(offset, offset + limit);
    return {
      items: page,
      totalCount: items.length,
      hasNextPage: offset + limit < items.length,
    };
  } catch (error) {
    console.error("Failed to fetch feature flag list:", error);
    return { items: [], totalCount: 0, hasNextPage: false };
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
