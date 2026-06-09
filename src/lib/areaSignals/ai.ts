// ── AI area signal resolver (CHAOS-2206) ───────────────────────────────────────
//
// Resolves the AI landing's sub-area signal cards. Mirrors the Govern resolver
// pattern (CHAOS-2074): parallel fetch, severity derivation from real AI data,
// honest "unavailable" per-card degradation when a source has no data.
//
// Signal policy (severity derivation):
//   - ai-impact        : AI_ASSISTED bucket reworkDragRate (lowerIsBetter ×100),
//                        BACKEND_LADDER; display value = aiAssistedPrRatio %.
//   - ai-review-load   : AI_ASSISTED bucket reviewAmplification multiplier
//                        (lowerIsBetter); display value = formatted multiplier.
//   - ai-governance-risk: recentViolations severity ladder (RETURNED — critical/
//                        high/medium from the violation rows); display = count.
//   - ai-automations   : aiOpportunities detectorReady + recommendations count
//                        (informational: "neutral" when candidates exist; "low"
//                        when ready but zero; "unavailable" when not yet ready).
//
// Honest-state contract: a sub-area whose value cannot be resolved is emitted
// with `state: "unavailable"` and an empty `value` — never a fabricated number.

import { auth } from "@/lib/auth";
import { graphqlFetch } from "@/lib/graphql/server";
import {
    AI_GOVERNANCE_SUMMARY_QUERY,
    AI_IMPACT_SUMMARY_QUERY,
    AI_OPPORTUNITIES_QUERY,
    AI_REVIEW_LOAD_QUERY,
} from "@/lib/graphql/queries";
import type {
    AiGovernanceSummary,
    AiImpactSummary,
    AiOpportunitiesResult,
    AiReviewLoadResult,
} from "@/lib/graphql/__generated__/types";
import { metricFilterToAIFilter } from "@/lib/filters/ai";
import type { MetricFilter } from "@/lib/filters/types";
import { getAreaById, type NavAreaHubItem } from "@/lib/navigation/areas";
import { formatNumber, formatPercent } from "@/lib/formatters";
import { logger } from "@/lib/logger";

import { BACKEND_LADDER, deriveState, type SeverityThresholds } from "./deriveState";
import type { AreaSignal, AreaSignalState } from "./types";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** The unavailable (honest-empty) resolution — no fabricated value. */
const UNAVAILABLE = { state: "unavailable" as const, value: "" };

/**
 * Review-amplification severity ladder (lowerIsBetter, multiplier scale).
 * 1.0× = same load as baseline; ≥ 3.0× = critical review pressure.
 */
const REVIEW_AMPLIFICATION_THRESHOLDS: SeverityThresholds = {
    critical: 3.0,
    high: 2.0,
    medium: 1.5,
};

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

/** Resolve the org scope from the auth session. */
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
        logger.error({ err: error, source }, "AI signal source failed");
        return undefined;
    }
}

// ── Resolver ──────────────────────────────────────────────────────────────────

/**
 * Resolve the AI area's signal cards.
 *
 * @param filters    Active metric filter (drives the AI date range + scope).
 * @param isTestMode Render deterministic sample data without hitting the API.
 */
export async function getAISignals(
    filters: MetricFilter,
    isTestMode = false,
): Promise<AreaSignal[]> {
    const ai = getAreaById("ai");
    if (!ai) return [];

    // Descriptor lookup by id — card metadata is owned by `navAreas`.
    const byId = new Map(ai.hubItems.map((item) => [item.id, item]));
    const descriptor = (id: string): NavAreaHubItem | undefined => byId.get(id);

    const orgId = isTestMode ? "default-org" : await resolveOrgId();

    // Derive AI query variables from the canonical metric filter.
    const aiFilter = metricFilterToAIFilter(filters);
    const dateRange = { startDate: aiFilter.startDate, endDate: aiFilter.endDate };
    const scope = {
        repoId: aiFilter.repoId ?? null,
        teamId: aiFilter.teamId ?? null,
        workType: aiFilter.workType ?? null,
        buckets: aiFilter.buckets ?? null,
    };

    // ── Fetch all 4 sources in parallel (no serial N+1) ─────────────────────────
    const [impact, reviewLoad, governance, opportunities] = await Promise.all([
        safe(
            () =>
                isTestMode
                    ? Promise.resolve(undefined)
                    : graphqlFetch<{ aiImpactSummary: AiImpactSummary }>(
                          AI_IMPACT_SUMMARY_QUERY,
                          { orgId, dateRange, scope },
                          { orgId },
                      ).then((r) => r.aiImpactSummary),
            "ai-impact",
        ),
        safe(
            () =>
                isTestMode
                    ? Promise.resolve(undefined)
                    : graphqlFetch<{ aiReviewLoad: AiReviewLoadResult }>(
                          AI_REVIEW_LOAD_QUERY,
                          { orgId, dateRange, scope },
                          { orgId },
                      ).then((r) => r.aiReviewLoad),
            "ai-review-load",
        ),
        safe(
            () =>
                isTestMode
                    ? Promise.resolve(undefined)
                    : graphqlFetch<{ aiGovernanceSummary: AiGovernanceSummary }>(
                          AI_GOVERNANCE_SUMMARY_QUERY,
                          { orgId, dateRange, scope, violationLimit: 50 },
                          { orgId },
                      ).then((r) => r.aiGovernanceSummary),
            "ai-governance-risk",
        ),
        safe(
            () =>
                isTestMode
                    ? Promise.resolve(undefined)
                    : graphqlFetch<{ aiOpportunities: AiOpportunitiesResult }>(
                          AI_OPPORTUNITIES_QUERY,
                          { orgId, scope, limit: 5 },
                          { orgId },
                      ).then((r) => r.aiOpportunities),
            "ai-automations",
        ),
    ]);

    const signals: AreaSignal[] = [];
    const push = (id: string, resolved: { state: AreaSignalState; value: string }) => {
        const d = descriptor(id);
        if (d) signals.push(buildSignal(d, resolved));
    };

    // ── ai-impact: AI adoption + rework drag signal ───────────────────────────────
    //
    // Primary display value: aiAssistedPrRatio (0–1 → × 100 for formatPercent).
    // Severity: AI_ASSISTED bucket reworkDragRate (0–1 → × 100, lowerIsBetter,
    //   BACKEND_LADDER). Falls back to "neutral" when reworkDragRate is absent
    //   but adoption data is present (informational only — no rework signal yet).
    if (impact?.dataAvailable) {
        const aiBucket = impact.byBucket.find((b) => b.bucket === "AI_ASSISTED");
        const reworkDrag = aiBucket?.reworkDragRate;
        const adoptionRatio = impact.aiAssistedPrRatio;
        const state: AreaSignalState =
            reworkDrag != null
                ? deriveState(reworkDrag * 100, {
                      thresholds: BACKEND_LADDER,
                      direction: "lowerIsBetter",
                  })
                : "neutral";
        push("ai-impact", {
            state,
            value: adoptionRatio != null ? `${formatPercent(adoptionRatio * 100)} AI-assisted` : "",
        });
    } else {
        push("ai-impact", UNAVAILABLE);
    }

    // ── ai-review-load: AI-side review amplification ──────────────────────────────
    //
    // AI_ASSISTED bucket reviewAmplification multiplier (lowerIsBetter).
    // dataAvailable guards against a non-null but empty result.
    if (reviewLoad?.dataAvailable) {
        const aiBucket = reviewLoad.byBucket.find((b) => b.bucket === "AI_ASSISTED");
        const amplification = aiBucket?.reviewAmplification;
        if (amplification != null) {
            push("ai-review-load", {
                state: deriveState(amplification, {
                    thresholds: REVIEW_AMPLIFICATION_THRESHOLDS,
                    direction: "lowerIsBetter",
                }),
                value: `${amplification.toFixed(1)}× amplification`,
            });
        } else {
            push("ai-review-load", UNAVAILABLE);
        }
    } else {
        push("ai-review-load", UNAVAILABLE);
    }

    // ── ai-governance-risk: recent violation severity ladder ─────────────────────
    //
    // RETURNED severity from the violation rows. The rule engine emits severity
    // labels as strings; the known ladder is:
    //   "critical" > "high" > "medium" > "warning" / "info" (low-signal)
    // Zero violations → "low". Only info/warning violations → "low" (they are
    // advisory, not actionable; collapsing them to "medium" would over-state risk).
    if (governance?.dataAvailable) {
        const violations = governance.recentViolations;
        if (violations.length === 0) {
            push("ai-governance-risk", {
                state: "low",
                value: `${formatNumber(0)} violations`,
            });
        } else {
            const hasCritical = violations.some((v) => v.severity === "critical");
            const hasHigh = violations.some((v) => v.severity === "high");
            const hasMedium = violations.some((v) => v.severity === "medium");
            const state: AreaSignalState = hasCritical
                ? "critical"
                : hasHigh
                  ? "high"
                  : hasMedium
                    ? "medium"
                    : "low";
            push("ai-governance-risk", {
                state,
                value: `${formatNumber(violations.length)} violation${violations.length === 1 ? "" : "s"}`,
            });
        }
    } else {
        push("ai-governance-risk", UNAVAILABLE);
    }

    // ── ai-automations: automation candidate count (informational) ─────────────────
    //
    // detectorReady=false means the detector is not yet trained → honest
    // "unavailable" (no fabricated candidate count). detectorReady=true with
    // recommendations → "neutral" (the count is informational, not a severity
    // ladder). Ready but zero recommendations → "low" (all-clear informational).
    if (opportunities) {
        if (!opportunities.detectorReady) {
            push("ai-automations", UNAVAILABLE);
        } else {
            const count = opportunities.recommendations.length;
            push("ai-automations", {
                state: count > 0 ? "neutral" : "low",
                value: `${formatNumber(count)} ${count === 1 ? "opportunity" : "opportunities"}`,
            });
        }
    } else {
        push("ai-automations", UNAVAILABLE);
    }

    return signals;
}
