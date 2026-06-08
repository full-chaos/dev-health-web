// ── Diagnose area signal resolver (CHAOS-2074) ────────────────────────────────
//
// Resolves the Diagnose landing's sub-area signal cards. Mirrors the Govern
// reference resolver (`govern.ts`) exactly: fetches every backing source IN
// PARALLEL (`Promise.all`, no serial N+1), then maps each source onto an
// `AreaSignal` whose static metadata (label, href, demoted) comes from the
// single nav source of truth (`navAreas` → Diagnose → hubItems).
//
// Diagnose is FLAT (no clusters). Descriptors carry no `cluster` field.
//
// Honest-state contract (owner decision 1): a sub-area whose value cannot be
// resolved is emitted with `state: "unavailable"` and an empty `value` — never a
// fabricated number — and sinks to the bottom of the sort.
//
// Severity policy per the confirmed data contract:
//   - "Derive": run `deriveState` on the headline value with the metric's
//     polarity + family thresholds.
//   - "Returned": reuse the server-resolved severity (home REST `signals[]`,
//     deltas severity).
//
// Backend gap (CHAOS-2077): People has no area-level aggregate metric yet and
// surfaces as an honest "unavailable" card. Landscape (org-level bus factor via
// getBusFactorData) and Cognitive Load (avg PR interruption load via the
// cognitiveLoad resolver) are now wired.

import { auth } from "@/lib/auth";
import { getHomeData } from "@/lib/api/home";
import { getBusFactorData } from "@/lib/api/code";
import { graphqlFetch } from "@/lib/graphql/server";
import { COMPLEXITY_TIMESERIES_QUERY } from "@/lib/graphql/queries";
import type { ComplexityTimeseriesResult } from "@/lib/graphql/__generated__/types";
import { complexityScopeInputFromFilter } from "@/lib/complexity/filters";
import { getCognitiveLoadViaGraphQL } from "@/lib/graphql/cognitiveLoadFetchers";
import type { CognitiveLoadResult } from "@/lib/graphql/cognitiveLoadFetchers";
import { getAreaById, type NavAreaHubItem } from "@/lib/navigation/areas";
import type { MetricFilter } from "@/lib/filters/types";
import { formatNumber } from "@/lib/formatters";
import { logger } from "@/lib/logger";

import { deriveState } from "./deriveState";
import type { SeverityThresholds } from "./deriveState";
import type { AreaSignal, AreaSignalState } from "./types";

// ── Provisional Complexity thresholds (CHAOS-2074) ────────────────────────────
//
// CHAOS-2074: provisional Complexity thresholds — pending calibration.
// Applied to avgComplexity (mean cyclomaticPerKloc across all repo points; higher=WORSE).
// This is NOT a 0–100 scale; cut points are raw cyclomatic-per-Kloc values.
// Flag for owner: these need empirical calibration before the card goes stable.
const COMPLEXITY_THRESHOLDS: SeverityThresholds = {
    critical: 40, // cyclomaticPerKloc >= 40 → critical
    high: 25, // cyclomaticPerKloc >= 25 → high
    medium: 15, // cyclomaticPerKloc >= 15 → medium
    // else → low
};

// ── Provisional Landscape bus-factor thresholds (CHAOS-2074) ─────────────────
//
// CHAOS-2074: provisional Landscape bus-factor thresholds — pending calibration.
// Applied to the org-level bus factor (higher = safer; lower = single-owner risk).
// Bus factor represents the minimum number of maintainers covering the majority
// of commits. Thresholds here are conservative starting points: a bus factor
// below 1.5 (effectively a single maintainer) is critical; below 2 is high risk;
// below 3 is medium risk. Flag for owner: calibrate against real org distribution.
const LANDSCAPE_BUSFACTOR_THRESHOLDS: SeverityThresholds = {
    critical: 1.5, // bus factor < 1.5 → critical (single-owner risk)
    high: 2, // bus factor < 2 → high
    medium: 3, // bus factor < 3 → medium
    // else → low (bus factor >= 3)
};

// ── Provisional Cognitive-Load thresholds (CHAOS-2077) ───────────────────────
//
// Applied to the average daily PR interruption load over the window (reviews,
// first-review events, and review feedback interrupting focused delivery).
// Higher = WORSE (lowerIsBetter polarity). Cut points mirror the bands the
// /cognitive-load surface itself uses (Rising > 15, Watch > 8). Flag for owner:
// provisional — calibrate against the real interruption-load distribution.
const COGNITIVE_LOAD_THRESHOLDS: SeverityThresholds = {
    critical: 25, // avg interruption load >= 25 → critical
    high: 15, // >= 15 → high (matches the surface's "Rising" band)
    medium: 8, // >= 8 → medium (matches the surface's "Watch" band)
    // else → low
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build an `AreaSignal` from its nav descriptor + resolved state/value. Pulls
 * label / href / demoted from the descriptor so the card metadata stays
 * anchored to the single nav source of truth.
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

/** The unavailable (honest-empty) resolution — no fabricated value. */
const UNAVAILABLE = { state: "unavailable" as const, value: "" };

/** Find a home `deltas[]` entry by its backend metric key. */
function homeDeltaValue(
    deltas: { metric: string; value: number; unit: string }[] | undefined,
    metric: string,
): { value: number; unit: string } | undefined {
    const delta = deltas?.find((d) => d.metric === metric);
    return delta ? { value: delta.value, unit: delta.unit } : undefined;
}

/** Find a home `signals[]` entry by its backend metric key. */
function homeSignalByMetric(
    signals: { metric: string; severity: string }[] | undefined,
    metric: string,
): { metric: string; severity: AreaSignalState } | undefined {
    const match = signals?.find((s) => s.metric === metric);
    return match ? (match as { metric: string; severity: AreaSignalState }) : undefined;
}

function meanCyclomaticPerKloc(result: ComplexityTimeseriesResult | undefined): number | undefined {
    const points = result?.points ?? [];
    if (points.length === 0) return undefined;
    const latestByScope = new Map<string, (typeof points)[number]>();
    for (const point of points) {
        const current = latestByScope.get(point.scopeId);
        if (!current || point.date > current.date) {
            latestByScope.set(point.scopeId, point);
        }
    }
    const values = [...latestByScope.values()]
        .map((p) => p.cyclomaticPerKloc)
        .filter((v): v is number => typeof v === "number" && !isNaN(v));
    if (values.length === 0) return undefined;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Compute the average daily PR interruption load across a cognitiveLoad result. */
function avgInterruptionLoad(result: CognitiveLoadResult | undefined): number | undefined {
    const signals = result?.signals ?? [];
    if (signals.length === 0) return undefined;
    const values = signals
        .map((s) => s.prInterruptionLoad)
        .filter((v): v is number => typeof v === "number" && !isNaN(v));
    if (values.length === 0) return undefined;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
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
        logger.error({ err: error, source }, "Diagnose signal source failed");
        return undefined;
    }
}

// ── Resolver ──────────────────────────────────────────────────────────────────

/**
 * Resolve the Diagnose area's signal cards.
 *
 * Diagnose is FLAT (no clusters). Metrics, Code, and Bottlenecks all share a
 * single `getHomeData` call (fetched once, reused across all three). Complexity
 * uses the `complexityTimeseries` GraphQL query. Landscape (bus factor) and
 * Cognitive Load (interruption load) are resolver-backed; People has no
 * area-level metric yet (CHAOS-2077) and surfaces as an honest "unavailable" card.
 *
 * @param filters  Active metric filter (drives the REST date range).
 * @param isTestMode  Render deterministic sample data without hitting the API.
 */
export async function getDiagnoseSignals(
    filters: MetricFilter,
    isTestMode = false,
): Promise<AreaSignal[]> {
    const diagnose = getAreaById("diagnose");
    if (!diagnose) return [];

    // Descriptor lookup by id — card metadata is owned by `navAreas`.
    const byId = new Map(diagnose.hubItems.map((item) => [item.id, item]));
    const descriptor = (id: string): NavAreaHubItem | undefined => byId.get(id);

    // Shared date range for the complexity GraphQL call.
    const rangeDays = filters.time?.range_days ?? 14;
    const today = new Date();
    const endDate = filters.time?.end_date ?? today.toISOString().slice(0, 10);
    const startDate =
        filters.time?.start_date ??
        new Date(today.getTime() - rangeDays * 86_400_000).toISOString().slice(0, 10);

    // Resolve the org scope server-side (the complexity GraphQL call needs it
    // threaded in as a variable AND as the `X-Org-Id` header).
    const orgId = isTestMode ? "default-org" : await resolveOrgId();
    const complexityScopeInput = complexityScopeInputFromFilter(filters);

    // cognitiveLoad only supports org-wide or team aggregation (the resolver takes orgId
    // plus an optional teamId). Repo/service/developer filters cannot be honored, so the
    // card stays honestly UNAVAILABLE for them rather than silently presenting org-wide
    // data as if it were the filtered scope — which would also break the cognitive-load
    // surface's self-only privacy framing under a developer scope (CHAOS-2077).
    //
    // DELIBERATE: a "team" scope with no id is the "Team: All" default — the org-wide team
    // aggregate (resolver teamId = null). That is the SAME org-wide value the cognitive-load
    // page and every other Diagnose card show for "Team: All", so it stays supported. There
    // is no specific team selected to "breach"; a concrete team id scopes to that one team.
    const scopeLevel = filters.scope?.level;
    const cognitiveLoadScopeSupported = scopeLevel === "org" || scopeLevel === "team";
    const cognitiveLoadTeamId =
        scopeLevel === "team" && (filters.scope?.ids?.length ?? 0) > 0
            ? filters.scope.ids[0]
            : null;

    // ── Fetch every source in parallel (no serial N+1) ───────────────────────
    // Metrics + Code + Bottlenecks all come from a single getHomeData call.
    const [homeData, complexityData, busFactor, cognitiveLoad] = await Promise.all([
        safe(() => getHomeData(filters), "home"),
        safe(
            () =>
                isTestMode
                    ? Promise.resolve(undefined)
                    : graphqlFetch<{
                          complexityTimeseries: ComplexityTimeseriesResult;
                      }>(
                          COMPLEXITY_TIMESERIES_QUERY,
                          {
                              input: {
                                  orgId,
                                  sinceUtc: startDate + "T00:00:00Z",
                                  untilUtc: endDate + "T23:59:59Z",
                                  granularity: "DAY",
                                  scope: "REPO",
                                  ...complexityScopeInput,
                                  limit: 50,
                              },
                          },
                          { orgId },
                      ).then((r) => r.complexityTimeseries),
            "complexity",
        ),
        safe(() => getBusFactorData(filters), "bus-factor"),
        safe(
            () =>
                isTestMode || !cognitiveLoadScopeSupported
                    ? Promise.resolve(undefined)
                    : getCognitiveLoadViaGraphQL({
                          orgId,
                          sinceDate: startDate,
                          untilDate: endDate,
                          teamId: cognitiveLoadTeamId,
                      }),
            "cognitive-load",
        ),
    ]);

    const signals: AreaSignal[] = [];
    const push = (id: string, resolved: { state: AreaSignalState; value: string }) => {
        const d = descriptor(id);
        if (d) signals.push(buildSignal(d, resolved));
    };

    // ── Metrics (/metrics) ────────────────────────────────────────────────────
    // Home REST deltas[metric=deploy_freq] value; RETURNED severity from
    // signals[metric=deploy_freq].severity.
    const deploySignal = homeSignalByMetric(homeData?.signals, "deploy_freq");
    const deployDelta = homeDeltaValue(homeData?.deltas, "deploy_freq");
    push(
        "flow",
        deploySignal
            ? {
                  state: deploySignal.severity,
                  value: deployDelta ? formatNumber(deployDelta.value) : "",
              }
            : UNAVAILABLE,
    );

    // ── People (/people) ─────────────────────────────────────────────────────
    // No area-level aggregate metric exists → honest "unavailable" (CHAOS-2077).
    push("people", UNAVAILABLE);

    // ── Code (/code) ──────────────────────────────────────────────────────────
    // Home REST deltas[metric=churn] value; RETURNED severity from
    // signals[metric=churn].severity.
    const churnSignal = homeSignalByMetric(homeData?.signals, "churn");
    const churnDelta = homeDeltaValue(homeData?.deltas, "churn");
    push(
        "code",
        churnSignal
            ? {
                  state: churnSignal.severity,
                  value: churnDelta ? formatNumber(churnDelta.value) : "",
              }
            : UNAVAILABLE,
    );

    // ── Landscape (/landscape) ────────────────────────────────────────────────
    // GraphQL busFactor; headline = org bus-factor value. Higher = safer →
    // higherIsBetter polarity. DERIVE.
    // CHAOS-2074: provisional thresholds — see LANDSCAPE_BUSFACTOR_THRESHOLDS above.
    const busFactorValue = busFactor?.value;
    const hasBusFactor = typeof busFactorValue === "number" && (busFactor?.repos?.length ?? 0) > 0;
    push(
        "landscape",
        hasBusFactor
            ? {
                  state: deriveState(busFactorValue, {
                      thresholds: LANDSCAPE_BUSFACTOR_THRESHOLDS,
                      direction: "higherIsBetter",
                  }),
                  value: formatNumber(busFactorValue, { maximumFractionDigits: 1 }),
              }
            : UNAVAILABLE,
    );

    // ── Complexity (/complexity) ──────────────────────────────────────────────
    // GraphQL complexityTimeseries; headline = mean cyclomaticPerKloc across all
    // repo points. Higher = WORSE (lowerIsBetter polarity). DERIVE.
    // CHAOS-2074: provisional thresholds — see COMPLEXITY_THRESHOLDS above.
    const avgComplexity = meanCyclomaticPerKloc(complexityData);
    push(
        "complexity",
        avgComplexity != null
            ? {
                  state: deriveState(avgComplexity, {
                      thresholds: COMPLEXITY_THRESHOLDS,
                      direction: "lowerIsBetter",
                  }),
                  value: formatNumber(avgComplexity, { maximumFractionDigits: 1 }),
              }
            : UNAVAILABLE,
    );

    // ── Cognitive Load (/cognitive-load) ──────────────────────────────────────
    // GraphQL cognitiveLoad; headline = avg daily PR interruption load over the window.
    // Higher = WORSE (lowerIsBetter polarity). DERIVE. Only org/team scope is supported by
    // the resolver — other scopes stay UNAVAILABLE (see the scope gate above) so the card
    // never publishes org-wide data under a repo/service/developer filter.
    // CHAOS-2077: provisional thresholds — see COGNITIVE_LOAD_THRESHOLDS above.
    const avgInterruption = cognitiveLoadScopeSupported
        ? avgInterruptionLoad(cognitiveLoad)
        : undefined;
    push(
        "cognitive-load",
        avgInterruption != null
            ? {
                  state: deriveState(avgInterruption, {
                      thresholds: COGNITIVE_LOAD_THRESHOLDS,
                      direction: "lowerIsBetter",
                  }),
                  value: formatNumber(avgInterruption, { maximumFractionDigits: 0 }),
              }
            : UNAVAILABLE,
    );

    // ── Bottlenecks (/bottleneck) ─────────────────────────────────────────────
    // Home REST deltas[metric=wip_saturation] value; RETURNED severity from
    // signals[metric=wip_saturation].severity.
    const wipSignal = homeSignalByMetric(homeData?.signals, "wip_saturation");
    const wipDelta = homeDeltaValue(homeData?.deltas, "wip_saturation");
    push(
        "bottleneck",
        wipSignal
            ? {
                  state: wipSignal.severity,
                  value: wipDelta ? `${formatNumber(wipDelta.value)}%` : "",
              }
            : UNAVAILABLE,
    );

    return signals;
}
