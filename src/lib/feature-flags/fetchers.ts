import { auth } from "@/lib/auth";
import { graphqlFetch } from "@/lib/graphql/urqlClient";
import type { WorkGraphEdgesResult } from "@/lib/graphql/types";
import { logger } from "@/lib/logger";
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
    FeatureFlag,
    FeatureFlagEvent,
} from "./types";
import { getDistinctSourceIds } from "./graph";

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
        const res = await graphqlFetch<{ featureFlags: FeatureFlagRegistryResult }>(
            FEATURE_FLAG_REGISTRY_QUERY,
            {
                orgId,
                provider: null,
                project: null,
                includeArchived: false,
                limit,
            },
        );

        return {
            flags: res.featureFlags.flags,
            totalCount: res.featureFlags.totalCount,
            degradedReason: res.featureFlags.degradedReason,
        };
    } catch (error) {
        logger.error({ err: error }, "Failed to fetch feature flag registry");
        return { flags: [], totalCount: 0, degradedReason: null };
    }
}

export async function fetchFeatureFlagEvents(
    flagKey?: string,
    orgIdOverride?: string,
    limit: number = 200,
    environment?: string,
): Promise<FeatureFlagEventsResult> {
    const orgId = await resolveOrgId(orgIdOverride);

    try {
        const res = await graphqlFetch<{ featureFlagEvents: FeatureFlagEventsResult }>(
            FEATURE_FLAG_EVENTS_QUERY,
            {
                orgId,
                flagKey: flagKey || null,
                environment: environment || null,
                limit,
            },
        );

        return {
            events: res.featureFlagEvents.events,
            totalCount: res.featureFlagEvents.totalCount,
            degradedReason: res.featureFlagEvents.degradedReason,
        };
    } catch (error) {
        logger.error({ err: error }, "Failed to fetch feature flag events");
        return { events: [], totalCount: 0, degradedReason: null };
    }
}

function eventStateIsActive(nextState: string): boolean | null {
    const normalized = nextState.trim().toLowerCase();
    if (!normalized) return null;
    if (["on", "enabled", "active", "true"].includes(normalized)) return true;
    if (["off", "disabled", "inactive", "false"].includes(normalized)) return false;
    // Unknown/unrecognized state (incl. empty next_state from LD audit events):
    // report unknown rather than defaulting to active.
    return null;
}

function mapFlagToListItem(flag: FeatureFlag, latestEvent?: FeatureFlagEvent): FeatureFlagListItem {
    return {
        flagId: flag.flagId,
        flagKey: flag.flagKey,
        provider: flag.provider,
        projectKey: flag.projectKey,
        createdAt: flag.createdAt,
        lastToggledAt: latestEvent?.eventTs ?? null,
        isActive: latestEvent ? eventStateIsActive(latestEvent.nextState) : null,
    };
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
        logger.error({ err: error }, "Failed to fetch release impact");
        return { edges: [], totalCount: 0, pageInfo: EMPTY_RESULT.pageInfo };
    }
}

/**
 * Returns the value of the last bucket in a sparkline, or null when the
 * sparkline is empty. Use this to derive a card "current value" from the
 * same timeseries source that backs the sparkline, so card and trend agree.
 */
export function latestFromSpark(spark: SparkPoint[]): number | null {
    if (spark.length === 0) return null;
    return spark[spark.length - 1].value;
}

/**
 * Returns the first→last change across a sparkline (last − first), rounded to
 * one decimal place. Returns null when fewer than two data points are present.
 * Use this to compute a period-over-period delta from an existing sparkline
 * when no dedicated delta measure is exposed by the backend.
 */
export function deltaFromSpark(spark: SparkPoint[]): number | null {
    if (spark.length < 2) return null;
    return Math.round((spark[spark.length - 1].value - spark[0].value) * 10) / 10;
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

export function classifySeverity(delta: number): "low" | "moderate" | "high" | "critical" {
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

        // Build sparklines first — all card values and deltas derive from the
        // same timeseries source so card and sparkline always agree.
        const activeFlagsSpark = mergeToSpark(timeseries, "FLAG_ACTIVATION_RATE");
        const frictionSpark = mergeToSpark(timeseries, "FLAG_FRICTION_DELTA");
        const errorSpark = mergeToSpark(timeseries, "FLAG_ERROR_RATE_DELTA");
        const coverageRatioSpark = mergeToSpark(timeseries, "FLAG_COVERAGE_RATIO");

        // FLAG_FRICTION_DELTA and FLAG_ERROR_RATE_DELTA are exposed via the analytics
        // timeseries API and are the canonical source for these card values.
        // Using the last bucket ensures the card matches the sparkline endpoint.
        const releaseFrictionDelta = latestFromSpark(frictionSpark) ?? 0;
        const releaseErrorRateDelta = latestFromSpark(errorSpark) ?? 0;

        // coverageRatio: source from FLAG_COVERAGE_RATIO timeseries (matches sparkline).
        // Fall back to work-graph computation when no timeseries data is available.
        // NOTE: The || 1 denominator fabrication has been removed — an empty release
        // graph returns 0 rather than a synthetic 100% coverage figure.
        const coverageRatioFromTimeseries = latestFromSpark(coverageRatioSpark);
        let coverageRatio: number;
        if (coverageRatioFromTimeseries !== null) {
            coverageRatio = Math.round(coverageRatioFromTimeseries);
        } else {
            const impactEdges = impact.edges.filter((edge) => edge.edgeType === "IMPACTS");
            const totalReleases = getDistinctSourceIds(impact.edges).size;
            const withTelemetry = getDistinctSourceIds(impactEdges).size;
            // When no releases exist yet, coverage is genuinely unknown — use 0.
            coverageRatio =
                totalReleases > 0 ? Math.round((withTelemetry / totalReleases) * 100) : 0;
        }

        // activeFlagsDelta and coverageRatioDelta are intentionally omitted:
        // FLAG_ACTIVE_COUNT_DELTA and FLAG_COVERAGE_RATIO_DELTA are not yet exposed
        // by the analytics schema. Using a proxy (e.g. FLAG_ACTIVATION_RATE first→last
        // Δ) would conflate a rate measure with a count metric and mislead users.
        // The card renders deltaUnavailableLabel ("No prior period") when the field
        // is undefined — which is the honest state.
        // TODO(backend): expose FLAG_ACTIVE_COUNT_DELTA + FLAG_COVERAGE_RATIO_DELTA.

        return {
            summary: {
                activeFlags,
                // activeFlagsDelta: intentionally absent — see comment above
                activeFlagsSpark,
                releaseFrictionDelta,
                releaseFrictionSeverity: classifySeverity(releaseFrictionDelta),
                releaseFrictionSpark: frictionSpark,
                releaseErrorRateDelta,
                releaseErrorRateSpark: errorSpark,
                coverageRatio,
                // coverageRatioDelta: intentionally absent — see comment above
                coverageRatioSpark,
            },
        };
    } catch (error) {
        logger.error({ err: error }, "Failed to fetch feature flags summary");
        // Re-throw so callers receive an honest error signal rather than an
        // all-zero summary that masquerades as healthy data.
        throw error;
    }
}

export async function fetchFeatureFlagList(
    offset: number = 0,
    limit: number = 20,
    orgIdOverride?: string,
): Promise<FeatureFlagListResult> {
    const orgId = await resolveOrgId(orgIdOverride);

    try {
        const registry = await fetchFeatureFlagRegistry(orgId, 500);
        const pagedFlags = registry.flags.slice(offset, offset + limit);

        // Resolve the latest event per VISIBLE flag, scoped by flagKey. A single
        // global event fetch ordered event_ts ASC only surfaces the OLDEST N
        // events org-wide, yielding stale lastToggledAt/isActive on busy orgs
        // (CHAOS-2629 review). Per-flag fetches keep each pool to one flag's
        // history, so the last (newest) entry is the true latest.
        const items: FeatureFlagListItem[] = await Promise.all(
            pagedFlags.map(async (flag) => {
                const flagEvents = await fetchFeatureFlagEvents(flag.flagKey, orgId, 1000);
                const evs = flagEvents.events;
                const latest = evs.length > 0 ? evs[evs.length - 1] : undefined;
                return mapFlagToListItem(flag, latest);
            }),
        );

        return {
            items,
            totalCount: registry.flags.length,
            hasNextPage: offset + limit < registry.flags.length,
        };
    } catch (error) {
        logger.error({ err: error }, "Failed to fetch feature flag list");
        return { items: [], totalCount: 0, hasNextPage: false };
    }
}

export async function fetchFeatureFlagData(orgIdOverride?: string): Promise<FeatureFlagData> {
    const orgId = await resolveOrgId(orgIdOverride);

    try {
        const [registry, events, releaseImpact] = await Promise.all([
            fetchFeatureFlagRegistry(orgId),
            fetchFeatureFlagEvents("", orgId),
            fetchReleaseImpact("", orgId),
        ]);

        return { registry, events, releaseImpact };
    } catch (error) {
        logger.error({ err: error }, "Failed to fetch feature flag data");
        return {
            registry: { flags: [], totalCount: 0, degradedReason: null },
            events: { events: [], totalCount: 0, degradedReason: null },
            releaseImpact: { edges: [], totalCount: 0, pageInfo: EMPTY_RESULT.pageInfo },
        };
    }
}
