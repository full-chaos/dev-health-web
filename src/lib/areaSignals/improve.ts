// ── Improve area signal resolver (CHAOS-2217) ─────────────────────────────────
//
// Resolves the Improve landing's sub-area signal cards. Mirrors the Govern
// reference resolver (`govern.ts`): fetches backing sources IN PARALLEL
// (`Promise.all`), then maps each onto an `AreaSignal` whose static metadata
// (label, href, demoted) comes from the single nav source of truth
// (`navAreas` → Improve → hubItems).
//
// Improve is FLAT (no clusters). Descriptors carry no `cluster` field.
//
// Honest-state contract (owner decision 1): a sub-area whose value cannot be
// resolved is emitted with `state: "unavailable"` and an empty `value` — never
// a fabricated number — and sinks to the bottom of the sort.
//
// Signal policy:
//   - Opportunities: REAL — fetches `getOpportunities(filters)`. Value is the
//     open count + evidence-linked count ("2 OPEN · 2 EVIDENCE-LINKED"). State
//     is "neutral" when items exist (count is informational, not a severity),
//     "unavailable" when fetch fails or returns no payload.
//   - Experiments: UNAVAILABLE — no backend yet.
//   - Automations: UNAVAILABLE — no backend yet.

import { getOpportunities } from "@/lib/api/home";
import { getAreaById, type NavAreaHubItem } from "@/lib/navigation/areas";
import type { MetricFilter } from "@/lib/filters/types";
import { formatNumber } from "@/lib/formatters";
import { logger } from "@/lib/logger";

import type { AreaSignal, AreaSignalState } from "./types";
import { sortBySeverity } from "./sort";

/** The unavailable (honest-empty) resolution — no fabricated value. */
const UNAVAILABLE = { state: "unavailable" as const, value: "" };

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

/**
 * Run a source fetch, swallowing failures to `undefined` so one dead source
 * degrades to a single honest-empty card instead of failing the whole area.
 */
async function safe<T>(
    fn: () => Promise<T>,
    source: string,
): Promise<T | undefined> {
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
 * @param filters  Active metric filter (drives the opportunities date range).
 * @param isTestMode  Render deterministic sample data without hitting the API.
 */
export async function getImproveSignals(
    filters: MetricFilter,
    isTestMode = false,
): Promise<AreaSignal[]> {
    const improve = getAreaById("improve");
    if (!improve) return [];

    // Descriptor lookup by id — card metadata is owned by `navAreas`.
    const byId = new Map(improve.hubItems.map((item) => [item.id, item]));
    const descriptor = (id: string): NavAreaHubItem | undefined => byId.get(id);

    // ── Fetch every source in parallel (no serial N+1) ──────────────────────────
    const [opportunitiesData] = await Promise.all([
        isTestMode
            ? Promise.resolve(undefined)
            : safe(() => getOpportunities(filters), "opportunities"),
    ]);

    const signals: AreaSignal[] = [];
    const push = (
        id: string,
        resolved: { state: AreaSignalState; value: string },
    ) => {
        const d = descriptor(id);
        if (d) signals.push(buildSignal(d, resolved));
    };

    // ── Opportunities — REAL ────────────────────────────────────────────────────
    // "neutral" when count > 0 (a count, not a severity); UNAVAILABLE if fetch
    // fails, returns undefined, or returns empty items.
    if (opportunitiesData && opportunitiesData.items.length > 0) {
        const items = opportunitiesData.items;
        const total = items.length;
        const evidenceLinked = items.filter(
            (item) => item.evidence_links.length > 0,
        ).length;
        const value =
            evidenceLinked > 0
                ? `${formatNumber(total)} OPEN · ${formatNumber(evidenceLinked)} EVIDENCE-LINKED`
                : `${formatNumber(total)} OPEN`;
        push("opportunities", { state: "neutral", value });
    } else {
        push("opportunities", UNAVAILABLE);
    }

    // ── Experiments — UNAVAILABLE (no backend yet) ───────────────────────────────
    push("experiments", UNAVAILABLE);

    // ── Automations — UNAVAILABLE (no backend yet) ───────────────────────────────
    push("improve-automations", UNAVAILABLE);

    return sortBySeverity(signals);
}
