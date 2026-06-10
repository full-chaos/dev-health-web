// ── Improve area signal resolver (CHAOS-2217) ─────────────────────────────────
//
// Resolves the Improve landing's signal cards. Mirrors the Govern reference
// resolver (`govern.ts`): fetches backing sources IN PARALLEL (`Promise.all`),
// then maps each onto an `AreaSignal` whose static metadata (label, href,
// demoted) comes from the single nav source of truth (`navAreas` → Improve →
// hubItems). The synthesized TOP-SIGNAL is the one exception — it is not a
// sub-area/hubItem but a derived "worst opportunity" lead (see below).
//
// Improve is FLAT (no clusters). Descriptors carry no `cluster` field.
//
// Honest-state contract (owner decision 1): a sub-area whose value cannot be
// resolved is emitted with `state: "unavailable"` and an empty `value` — never
// a fabricated number — and sinks to the bottom of the sort.
//
// Signal policy:
//   - Top signal (synthesized): the SINGLE worst worsened metric (home
//     `deltas[]` with `delta_pct > 0` for lower-is-better, or `< 0` for
//     higher-is-better, max absolute shift) — the same ranking the backend uses
//     to build opportunity cards (`build_opportunities_response` sorts the
//     worsened deltas desc; `items[0]` is this metric). Emitted as a severity
//     card ("Reduce <metric>" or "Recover <metric>" · ±N%) linking to `/opportunities`, so
//     `AreaOverview` promotes it to the hero and Opportunities drops to a
//     workflow card. GATED on opportunities actually being present so the hero
//     always links to a real opportunity. Zero worsened metrics → no top signal
//     (the Opportunities count becomes the neutral lead — no fabricated severity).
//   - Opportunities: REAL — count from `getOpportunities(filters)`. SHORT value
//     ("N open") so the gradient `metric-hero` reads as a clean number, with the
//     evidence-linked count on the secondary `metricLabel` line. State is
//     "neutral" whenever the fetch SUCCEEDS (a count is informational, not a
//     severity), including a healthy zero ("0 open"). Only a FAILED fetch
//     (safe() → undefined) degrades to "unavailable" (genuine "not connected").
//   - Experiments (CHAOS-2219): REAL — count derived from opportunitiesData.items[*].suggested_experiments
//     (no extra fetch; same data the Opportunities card already reads).  State is
//     "neutral" on a successful fetch (even zero), "unavailable" only on failure.
//   - Automations (CHAOS-2220): REAL — count of flow opportunities from
//     FlowOpportunityDetector via `improveOpportunities` GraphQL query.
//     "neutral" when detectorReady (even zero is a valid "all green" state).
//     "unavailable" when the fetch fails or the detector is not ready.

import { getHomeData, getOpportunities } from "@/lib/api/home";
import { graphqlFetch } from "@/lib/graphql/server";
import { IMPROVE_OPPORTUNITIES_QUERY } from "@/lib/graphql/queries";
import type { ImproveOpportunitiesResult } from "@/lib/graphql/__generated__/types";
import { getAreaById, type NavAreaHubItem } from "@/lib/navigation/areas";
import type { MetricFilter } from "@/lib/filters/types";
import type { MetricDelta } from "@/lib/types";
import { formatNumber } from "@/lib/formatters";
import { logger } from "@/lib/logger";

/** Resolve the org scope from the auth session (mirrors ai.ts / server.ts lazy-auth pattern). */
async function resolveOrgId(): Promise<string | undefined> {
    try {
        const { auth } = await import("@/lib/auth");
        const session = await auth();
        return session?.user?.org_id as string | undefined;
    } catch {
        return undefined;
    }
}

import type { AreaSignal, AreaSignalState } from "./types";
import { sortBySeverity } from "./sort";
import { getMetricPolarity } from "@/lib/metrics/catalog";

/** The unavailable (honest-empty) resolution — no fabricated value. */
const UNAVAILABLE = { state: "unavailable" as const, value: "" };

/** Synthetic top-signal id (NOT a sub-area/hubItem — a derived "worst opportunity" lead). */
const TOP_SIGNAL_ID = "improve-top-signal";

type Resolution = { state: AreaSignalState; value: string; preview?: boolean };

/**
 * Map a worsened-metric magnitude (positive `delta_pct`) onto the severity
 * ladder so the worst opportunity reads as "high"/"medium" (not "neutral") and
 * `AreaOverview` can promote it to the hero. Tuned so a ~+19% shift lands on
 * "high" (Penpot's "ELEVATED" lead). Only ever called for `delta_pct > 0`.
 */
function severityForDelta(deltaPct: number): Exclude<AreaSignalState, "neutral" | "unavailable"> {
    if (deltaPct >= 25) return "critical";
    if (deltaPct >= 15) return "high";
    if (deltaPct >= 5) return "medium";
    return "low";
}

/** The single worst worsened metric (largest absolute delta in the wrong direction), or undefined when none worsened. */
function worstWorsenedDelta(deltas: MetricDelta[] | undefined): MetricDelta | undefined {
    const worsened = (deltas ?? []).filter((d) => {
        const polarity = getMetricPolarity(d.metric);
        if (!polarity) {
            logger.warn({ metric: d.metric }, "Unknown metric polarity, excluding from top signal");
            return false;
        }
        return polarity === "higherIsBetter" ? d.delta_pct < 0 : d.delta_pct > 0;
    });
    if (worsened.length === 0) return undefined;
    return [...worsened].sort((a, b) => Math.abs(b.delta_pct) - Math.abs(a.delta_pct))[0];
}

/**
 * Build an `AreaSignal` from its nav descriptor + resolved state/value. Pulls
 * label / href / cluster / demoted from the descriptor so the card metadata
 * stays anchored to the single nav source of truth. `metricLabel` is resolved
 * per-card (not from the descriptor) so a card never just repeats its own label.
 * `preview` marks a card whose route does not yet exist so the renderer keeps it
 * non-clickable.
 */
function buildSignal(
    descriptor: NavAreaHubItem,
    resolved: Resolution & { metricLabel: string },
): AreaSignal {
    return {
        id: descriptor.id,
        label: descriptor.label,
        href: descriptor.href,
        cluster: descriptor.cluster,
        metricLabel: resolved.metricLabel,
        value: resolved.value,
        state: resolved.state,
        demoted: descriptor.demoted,
        preview: resolved.preview,
    };
}

/**
 * Run a source fetch, swallowing failures to `undefined` so one dead source
 * degrades to a single honest-empty card instead of failing the whole area.
 */
async function safe<T>(fn: () => Promise<T>, source: string): Promise<T | undefined> {
    try {
        return await fn();
    } catch (error) {
        logger.error({ err: error, source }, "Improve signal source failed");
        return undefined;
    }
}

/**
 * Resolve the Improve area's signal cards.
 *
 * @param filters  Active metric filter (drives the home/opportunities date range).
 * @param isTestMode  Accepted for dispatcher-signature parity with the other area
 *   resolvers. NOT used as a fetch gate: both sources are MSW-mockable REST and
 *   are fetched unconditionally (see the fetch block) so the Overview renders
 *   real cards under Playwright's mock backend, matching Diagnose/Govern.
 */
export async function getImproveSignals(
    filters: MetricFilter,
    isTestMode = false,
): Promise<AreaSignal[]> {
    const improve = getAreaById("improve");
    if (!improve) return [];

    // Descriptor lookup by id — sub-area card metadata is owned by `navAreas`.
    const byId = new Map(improve.hubItems.map((item) => [item.id, item]));
    const descriptor = (id: string): NavAreaHubItem | undefined => byId.get(id);

    // Resolve the org id for GraphQL calls (Automations signal).
    const orgId = isTestMode ? "test-org" : await resolveOrgId();

    // ── Fetch every source in parallel (no serial N+1) ──────────────────────────
    // home `deltas[]` drives the synthesized top signal (worst worsened metric);
    // opportunities drives the Opportunities workflow card + gates the top signal.
    // automations data comes from FlowOpportunityDetector via GraphQL.
    const [opportunitiesData, homeData, automationsData] = await Promise.all([
        safe(() => getOpportunities(filters), "opportunities"),
        safe(() => getHomeData(filters), "home"),
        safe(() => {
            // Guard: without an org in session, require_org_id will reject the
            // request server-side. Short-circuit here so safe() → UNAVAILABLE
            // rather than a false "0 detected / all green" (Warning 4, CHAOS-2220).
            if (!orgId) throw new Error("session missing org_id");
            return graphqlFetch<{ improveOpportunities: ImproveOpportunitiesResult }>(
                IMPROVE_OPPORTUNITIES_QUERY,
                { scope: null, limit: 10, windowDays: 30 },
                { orgId },
            ).then((r) => r.improveOpportunities);
        }, "improve-automations"),
    ]);

    const signals: AreaSignal[] = [];
    const push = (id: string, resolved: Resolution & { metricLabel: string }) => {
        const d = descriptor(id);
        if (d) signals.push(buildSignal(d, resolved));
    };

    const openCount = opportunitiesData ? (opportunitiesData.items ?? []).length : undefined;

    // ── Top signal (synthesized) — worst worsened metric ────────────────────────
    // The most-severe AVAILABLE signal so AreaOverview promotes it to the hero
    // ("Reduce Throughput · +19% · throughput shift") and Opportunities drops to
    // a workflow card. Gated on opportunities existing so the hero links to a
    // real opportunity; zero worsened metrics → no top signal (Opportunities
    // count leads as a neutral, no fabricated severity).
    const worst = worstWorsenedDelta(homeData?.deltas);
    if (worst && openCount && openCount > 0) {
        const polarity = getMetricPolarity(worst.metric);
        const isHigherBetter = polarity === "higherIsBetter";
        const action = isHigherBetter ? "Recover" : "Reduce";
        const sign = worst.delta_pct > 0 ? "+" : "";
        signals.push({
            id: TOP_SIGNAL_ID,
            label: `${action} ${worst.label}`,
            href: "/opportunities",
            metricLabel: `${worst.label} shift`,
            value: `${sign}${formatNumber(worst.delta_pct, { maximumFractionDigits: 0 })}%`,
            state: severityForDelta(Math.abs(worst.delta_pct)),
            direction: isHigherBetter ? "down" : "up",
        });
    }

    // ── Opportunities — REAL (SHORT value + secondary evidence line) ─────────────
    // A SUCCESSFUL fetch is always "neutral" (a count, not a severity) — including
    // a healthy zero ("0 open"). Only a FAILED fetch (safe() → undefined) is the
    // honest "unavailable" (not connected). Empty items != disconnect. The value
    // stays SHORT ("N open") so the gradient hero reads as a clean number; the
    // evidence-linked count lives on the secondary metricLabel line.
    if (opportunitiesData) {
        const items = opportunitiesData.items ?? [];
        const total = items.length;
        const evidenceLinked = items.filter((item) => item.evidence_links.length > 0).length;
        const metricLabel =
            evidenceLinked > 0
                ? `${formatNumber(evidenceLinked)} evidence-linked`
                : "open opportunities";
        push("opportunities", {
            state: "neutral",
            value: `${formatNumber(total)} open`,
            metricLabel,
        });
    } else {
        push("opportunities", { ...UNAVAILABLE, metricLabel: "Opportunities" });
    }

    // ── Experiments — REAL (count derived from opportunity suggested_experiments) ──
    // Experiments are derived from the same opportunities payload already fetched
    // above (no extra API call).  A successful fetch with zero experiments is still
    // "neutral" — healthy zero; only a failed fetch degrades to "unavailable".
    if (opportunitiesData) {
        const experimentCount = (opportunitiesData.items ?? []).reduce(
            (sum, card) => sum + (card.suggested_experiments?.length ?? 0),
            0,
        );
        push("experiments", {
            state: "neutral",
            value: `${formatNumber(experimentCount)} suggested`,
            metricLabel: "Suggested next steps",
        });
    } else {
        push("experiments", { ...UNAVAILABLE, metricLabel: "Experiments" });
    }

    // ── Automations (CHAOS-2220) — REAL signal from FlowOpportunityDetector ───────
    // detectorReady=true + N detected → "neutral" with count ("N detected").
    // detectorReady=true + 0 detected → "neutral" ("0 detected" = all green, not error).
    // fetch failed (safe() → undefined) → "unavailable".
    if (automationsData) {
        const count = automationsData.totalCount ?? 0;
        push("improve-automations", {
            state: "neutral",
            value: `${formatNumber(count)} detected`,
            metricLabel: count > 0 ? "flow opportunities" : "all metrics within thresholds",
        });
    } else {
        push("improve-automations", { ...UNAVAILABLE, metricLabel: "Automations" });
    }

    return sortBySeverity(signals);
}
