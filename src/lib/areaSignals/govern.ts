// ── Govern area signal resolver (CHAOS-2074) ──────────────────────────────────
//
// Resolves the Govern landing's sub-area signal cards. This is the REFERENCE
// resolver for the shared area-signal pattern (Phase 2 mirrors it for Diagnose /
// Improve): it fetches every backing source IN PARALLEL (`Promise.all`, no
// serial N+1), then maps each source onto an `AreaSignal` whose static metadata
// (label, href, cluster, demoted) comes from the single nav source of truth
// (`navAreas` → Govern → hubItems).
//
// Honest-state contract (owner decision 1): a sub-area whose value cannot be
// resolved is emitted with `state: "unavailable"` and an empty `value` — never a
// fabricated number — and sinks to the bottom of the sort.
//
// Severity policy per the confirmed data contract:
//   - "Derive": run `deriveState` on the headline value with the metric's
//     polarity + family thresholds.
//   - "Returned": reuse the server-resolved severity (home REST `signals[]`,
//     compoundingRisk rows, feature-flag friction severity).

import { auth } from "@/lib/auth";
import { getHomeData } from "@/lib/api/home";
import { fetchFeatureFlagsData } from "@/lib/feature-flags/fetchers";
import { graphqlFetch } from "@/lib/graphql/server";
import { COMPOUNDING_RISK_QUERY, SECURITY_OVERVIEW_QUERY } from "@/lib/graphql/queries";
import type {
    CompoundingRiskResult,
    CompoundingRiskSeverity,
    SecurityOverview,
} from "@/lib/graphql/__generated__/types";
import { getAreaById, type NavAreaHubItem } from "@/lib/navigation/areas";
import { fetchCoverageMetrics, fetchRiskMetrics, fetchTestOpsData } from "@/lib/testops/fetchers";
import type { AnalyticsRequestInput, TimeseriesResult } from "@/lib/graphql/schemas/analytics";
import type { MetricFilter } from "@/lib/filters/types";
import { formatNumber, formatPercent } from "@/lib/formatters";
import { logger } from "@/lib/logger";
import type { CockpitSignal, SignalSeverity } from "@/lib/types";
import type { TestOpsData } from "@/lib/testops/types";

import {
    COVERAGE_THRESHOLDS,
    DELIVERY_RISK_THRESHOLDS,
    FLAKE_THRESHOLDS,
    PIPELINE_SHORTFALL_THRESHOLDS,
    deriveState,
} from "./deriveState";
import type { AreaSignal, AreaSignalState } from "./types";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Latest bucket value for a measure in an analytics timeseries result. */
function latestMeasure(timeseries: TimeseriesResult[], measure: string): number | undefined {
    const series = timeseries.find((t) => t.measure === measure);
    if (!series || series.buckets.length === 0) return undefined;
    return series.buckets[series.buckets.length - 1].value;
}

/** Map a backend compounding-risk severity onto the cockpit severity ladder. */
function mapCompoundingSeverity(severity: CompoundingRiskSeverity): AreaSignalState {
    switch (severity) {
        case "HIGH":
            return "critical";
        case "ELEVATED":
            return "medium";
        case "LOW":
            return "low";
        default:
            return "unavailable"; // UNKNOWN
    }
}

/** Map a feature-flag friction severity onto the cockpit severity ladder. */
function mapFrictionSeverity(severity: "low" | "moderate" | "high" | "critical"): SignalSeverity {
    return severity === "moderate" ? "medium" : severity;
}

/** Find a home `signals[]` entry by its backend metric key. */
function homeSignalByMetric(
    signals: CockpitSignal[] | undefined,
    metric: string,
): CockpitSignal | undefined {
    return signals?.find((s) => s.metric === metric);
}

/** Find a home `deltas[]` value by its backend metric key. */
function homeDeltaValue(
    deltas: { metric: string; value: number; unit: string }[] | undefined,
    metric: string,
): { value: number; unit: string } | undefined {
    const delta = deltas?.find((d) => d.metric === metric);
    return delta ? { value: delta.value, unit: delta.unit } : undefined;
}

/**
 * Build an `AreaSignal` from its nav descriptor + resolved state/value. Pulls
 * label / href / cluster / demoted from the descriptor so the card metadata
 * stays anchored to the single nav source of truth.
 */
function buildSignal(
    descriptor: NavAreaHubItem,
    resolved: { state: AreaSignalState; value: string },
): AreaSignal {
    return {
        id: descriptor.id,
        label: descriptor.label,
        href: descriptor.href,
        cluster: descriptor.cluster,
        metricLabel: descriptor.metricLabel ?? descriptor.label,
        value: resolved.value,
        state: resolved.state,
        demoted: descriptor.demoted,
    };
}

function stateRank(state: AreaSignalState): number {
    return {
        unavailable: -1,
        neutral: 0,
        low: 1,
        medium: 2,
        high: 3,
        critical: 4,
    }[state];
}

function worstResolution(
    resolutions: Array<{ state: AreaSignalState; value: string } | undefined>,
): { state: AreaSignalState; value: string } {
    const available = resolutions.filter(
        (resolution): resolution is { state: AreaSignalState; value: string } =>
            resolution != null && resolution.state !== "unavailable",
    );
    return available.sort((a, b) => stateRank(b.state) - stateRank(a.state))[0] ?? UNAVAILABLE;
}

/** The unavailable (honest-empty) resolution — no fabricated value. */
const UNAVAILABLE = { state: "unavailable" as const, value: "" };

// ── Resolver ──────────────────────────────────────────────────────────────────

/**
 * Resolve the Govern area's signal cards.
 *
 * @param filters  Active metric filter (drives the analytics date range).
 * @param isTestMode  Render deterministic sample data without hitting the API.
 * @param prefetched  Optional prefetched data from the calling page. When the
 *   page has already called fetchTestOpsData with a batch that covers
 *   PIPELINE_SUCCESS_RATE, TEST_FLAKE_RATE, and COVERAGE_LINE_PCT, pass it
 *   here to avoid a duplicate analytics POST per render.
 */
export async function getGovernSignals(
    filters: MetricFilter,
    isTestMode = false,
    prefetched?: { testOpsData?: TestOpsData },
): Promise<AreaSignal[]> {
    const govern = getAreaById("govern");
    if (!govern) return [];

    // Descriptor lookup by id — card metadata is owned by `navAreas`.
    const byId = new Map(govern.hubItems.map((item) => [item.id, item]));
    const descriptor = (id: string): NavAreaHubItem | undefined => byId.get(id);

    // Shared analytics date range (mirrors the TestOps landing's own derivation).
    const rangeDays = filters.time?.range_days ?? 14;
    const today = new Date();
    const endDate = filters.time?.end_date ?? today.toISOString().slice(0, 10);
    const startDate =
        filters.time?.start_date ??
        new Date(today.getTime() - rangeDays * 86_400_000).toISOString().slice(0, 10);
    const dateRange = { startDate, endDate };

    const analyticsBatch: AnalyticsRequestInput = {
        timeseries: [
            {
                dimension: "TEAM",
                measure: "PIPELINE_SUCCESS_RATE",
                interval: "DAY",
                dateRange,
            },
            {
                dimension: "TEAM",
                measure: "TEST_FLAKE_RATE",
                interval: "DAY",
                dateRange,
            },
            {
                dimension: "TEAM",
                measure: "COVERAGE_LINE_PCT",
                interval: "DAY",
                dateRange,
            },
        ],
        breakdowns: [],
    };

    // Resolve the org scope server-side (the client hooks rely on a provider; the
    // analytics/feature-flag fetchers resolve it internally, but the direct
    // GraphQL calls below need it threaded in as a variable AND `X-Org-Id`).
    const orgId = isTestMode ? "default-org" : await resolveOrgId();

    // ── Fetch every source in parallel (no serial N+1) ──────────────────────────
    // When the calling page has already fetched testOpsData with a batch that
    // covers PIPELINE_SUCCESS_RATE, TEST_FLAKE_RATE, and COVERAGE_LINE_PCT (all
    // three measures this resolver needs), reuse it to avoid a duplicate POST.
    const [homeData, testOps, coverage, risk, security, compounding, featureFlags] =
        await Promise.all([
            safe(() => getHomeData(filters), "home"),
            prefetched?.testOpsData
                ? Promise.resolve(prefetched.testOpsData)
                : safe(() => fetchTestOpsData(analyticsBatch, isTestMode), "testops"),
            safe(() => fetchCoverageMetrics(analyticsBatch, isTestMode), "coverage"),
            safe(() => fetchRiskMetrics(analyticsBatch, isTestMode), "risk"),
            safe(
                () =>
                    isTestMode
                        ? Promise.resolve(undefined)
                        : graphqlFetch<{ securityOverview: SecurityOverview }>(
                              SECURITY_OVERVIEW_QUERY,
                              { orgId, filters: { openOnly: true } },
                              { orgId },
                          ).then((r) => r.securityOverview),
                "security",
            ),
            safe(
                () =>
                    isTestMode
                        ? Promise.resolve(undefined)
                        : graphqlFetch<{ compoundingRisk: CompoundingRiskResult }>(
                              COMPOUNDING_RISK_QUERY,
                              { orgId, filter: null },
                              { orgId },
                          ).then((r) => r.compoundingRisk),
                "compounding",
            ),
            safe(() => fetchFeatureFlagsData(dateRange, isTestMode), "feature-flags"),
        ]);

    const signals: AreaSignal[] = [];
    const push = (id: string, resolved: { state: AreaSignalState; value: string }) => {
        const d = descriptor(id);
        if (d) signals.push(buildSignal(d, resolved));
    };

    // ── Cluster: Quality ────────────────────────────────────────────────────────

    const coveragePct =
        latestMeasure(coverage?.timeseries ?? [], "COVERAGE_LINE_PCT") ??
        latestMeasure(testOps?.coverage.timeseries ?? [], "COVERAGE_LINE_PCT");
    const coverageResolution =
        coveragePct != null
            ? {
                  state: deriveState(coveragePct, {
                      thresholds: COVERAGE_THRESHOLDS,
                      direction: "higherIsBetter",
                  }),
                  value: `${formatPercent(coveragePct)} coverage`,
              }
            : undefined;

    const flakePct = latestMeasure(testOps?.tests.timeseries ?? [], "TEST_FLAKE_RATE");
    const testsResolution =
        flakePct != null
            ? {
                  state: deriveState(flakePct, {
                      thresholds: FLAKE_THRESHOLDS,
                      direction: "lowerIsBetter",
                  }),
                  value: `${formatPercent(flakePct)} flake`,
              }
            : undefined;

    const successPct = latestMeasure(testOps?.pipelines.timeseries ?? [], "PIPELINE_SUCCESS_RATE");
    const pipelineResolution =
        successPct != null
            ? {
                  state: deriveState(Math.max(0, 100 - successPct), {
                      thresholds: PIPELINE_SHORTFALL_THRESHOLDS,
                      direction: "lowerIsBetter",
                  }),
                  value: `${formatPercent(successPct)} success`,
              }
            : undefined;

    push("testops", worstResolution([pipelineResolution, testsResolution, coverageResolution]));

    // Quality — home REST signals[change_failure_rate].severity (RETURNED).
    const qualitySignal = homeSignalByMetric(homeData?.signals, "change_failure_rate");
    const qualityDelta = homeDeltaValue(homeData?.deltas, "change_failure_rate");
    push(
        "quality",
        qualitySignal
            ? {
                  state: qualitySignal.severity,
                  value: qualityDelta
                      ? formatPercent(qualityDelta.value)
                      : qualitySignal.current_value,
              }
            : UNAVAILABLE,
    );

    // ── Cluster: Risk ─────────────────────────────────────────────────────────────

    // Security — GraphQL securityOverview kpis, DERIVE by counts.
    if (security) {
        const { critical, high, openTotal } = security.kpis;
        const state: AreaSignalState =
            critical >= 1 ? "critical" : high >= 1 ? "high" : openTotal > 0 ? "medium" : "low";
        const value = critical >= 1 ? formatNumber(critical) : formatNumber(openTotal);
        push("security", { state, value });
    } else {
        push("security", UNAVAILABLE);
    }

    // Delivery Risk — fetchRiskMetrics release_confidence (0–1 ×100), DERIVE (higher=better).
    const releaseConfidence = risk?.release_confidence;
    push(
        "risk",
        releaseConfidence != null
            ? {
                  state: deriveState(releaseConfidence * 100, {
                      thresholds: DELIVERY_RISK_THRESHOLDS,
                      direction: "higherIsBetter",
                  }),
                  value: formatPercent(releaseConfidence * 100),
              }
            : UNAVAILABLE,
    );

    // Incident Correlation — home REST signals[change_failure_rate].severity (RETURNED).
    // Same backend metric as Quality; the two surfaces frame it differently.
    push(
        "incident-correlation",
        qualitySignal
            ? {
                  state: qualitySignal.severity,
                  value: qualityDelta
                      ? formatPercent(qualityDelta.value)
                      : qualitySignal.current_value,
              }
            : UNAVAILABLE,
    );

    // Compounding Risk — GraphQL compoundingRisk rows[].severity (RETURNED, worst).
    const worstRow = pickWorstCompoundingRow(compounding);
    push(
        "risk-compounding",
        worstRow
            ? {
                  state: mapCompoundingSeverity(worstRow.severity),
                  value: worstRow.score != null ? formatNumber(worstRow.score) : "",
              }
            : UNAVAILABLE,
    );

    // Feature Flags — fetchFeatureFlagsData summary (RETURNED severity, demoted).
    const ffSummary = featureFlags?.summary;
    push(
        "feature-flags",
        ffSummary
            ? {
                  state: mapFrictionSeverity(ffSummary.releaseFrictionSeverity),
                  value: formatNumber(ffSummary.activeFlags),
              }
            : UNAVAILABLE,
    );

    return signals;
}

/** Pick the worst compounding-risk row by severity rank then score. */
function pickWorstCompoundingRow(
    result: CompoundingRiskResult | undefined,
): { severity: CompoundingRiskSeverity; score?: number | null } | undefined {
    const rows = result?.rows ?? [];
    if (rows.length === 0) return undefined;
    const rank: Record<CompoundingRiskSeverity, number> = {
        HIGH: 0,
        ELEVATED: 1,
        LOW: 2,
        UNKNOWN: 3,
    };
    return [...rows].sort((a, b) => {
        const bySev = rank[a.severity] - rank[b.severity];
        if (bySev !== 0) return bySev;
        return (b.score ?? 0) - (a.score ?? 0);
    })[0];
}

/** Resolve the org scope from the auth session (mirrors the area fetchers). */
async function resolveOrgId(): Promise<string> {
    const session = await auth();
    return (session?.user?.org_id as string | undefined) ?? "default-org";
}

/**
 * Run a source fetch, swallowing failures to `undefined` so one dead source
 * degrades to a single honest-empty card instead of failing the whole area.
 */
async function safe<T>(fn: () => Promise<T>, source: string): Promise<T | undefined> {
    try {
        return await fn();
    } catch (error) {
        logger.error({ err: error, source }, "Govern signal source failed");
        return undefined;
    }
}
