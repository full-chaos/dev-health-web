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
//   - Opportunities: REAL — fetches `getOpportunities(filters)`. State is
//     "neutral" whenever the fetch SUCCEEDS (a count is informational, not a
//     severity): value "N OPEN · M EVIDENCE-LINKED" for hits, "0 OPEN" for a
//     real healthy zero. Only a FAILED fetch (safe() → undefined) degrades to
//     "unavailable" — a genuine "not connected", distinct from an empty result.
//   - Experiments: UNAVAILABLE + preview (route /improve/experiments has no page
//     yet → card is rendered non-clickable so it can't 404).
//   - Automations: UNAVAILABLE + preview (route /improve/automations, same).

import { getOpportunities } from "@/lib/api/home";
import { getAreaById, type NavAreaHubItem } from "@/lib/navigation/areas";
import type { MetricFilter } from "@/lib/filters/types";
import { formatNumber } from "@/lib/formatters";
import { logger } from "@/lib/logger";

import type { AreaSignal, AreaSignalState } from "./types";
import { sortBySeverity } from "./sort";

/** The unavailable (honest-empty) resolution — no fabricated value. */
const UNAVAILABLE = { state: "unavailable" as const, value: "" };

type Resolution = { state: AreaSignalState; value: string; preview?: boolean };

/**
 * Build an `AreaSignal` from its nav descriptor + resolved state/value. Pulls
 * label / href / cluster / demoted from the descriptor so the card metadata
 * stays anchored to the single nav source of truth. `preview` marks a card whose
 * route does not yet exist so the renderer keeps it non-clickable.
 */
function buildSignal(descriptor: NavAreaHubItem, resolved: Resolution): AreaSignal {
    return {
        id: descriptor.id,
        label: descriptor.label,
        href: descriptor.href,
        cluster: descriptor.cluster,
        metricLabel: descriptor.metricLabel ?? descriptor.label,
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
    const push = (id: string, resolved: Resolution) => {
        const d = descriptor(id);
        if (d) signals.push(buildSignal(d, resolved));
    };

    // ── Opportunities — REAL ────────────────────────────────────────────────────
    // A SUCCESSFUL fetch is always "neutral" (a count, not a severity) — including
    // a healthy zero ("0 OPEN"). Only a FAILED fetch (safe() → undefined) is the
    // honest "unavailable" (not connected). Empty items != disconnect.
    if (opportunitiesData) {
        const items = opportunitiesData.items ?? [];
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

    // ── Experiments — UNAVAILABLE + preview (no backend / no route yet) ──────────
    push("experiments", { ...UNAVAILABLE, preview: true });

    // ── Automations — UNAVAILABLE + preview (no backend / no route yet) ──────────
    push("improve-automations", { ...UNAVAILABLE, preview: true });

    return sortBySeverity(signals);
}
