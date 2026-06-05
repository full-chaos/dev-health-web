// ── Improve area signal resolver (CHAOS-2074 / CHAOS-2079) ────────────────────
//
// Improve's locked taxonomy (CHAOS-2079) is Opportunities / Experiments /
// Automations. Capacity Planning moved to Plan and AI Workflows became its own
// first-class AI area, so neither is an Improve sub-area any more — the Improve
// `hubItems` descriptor list is now empty.
//
// The resolver-backed Improve hub signal cards (e.g. Opportunities volume) are
// J5 scope. Until those metrics land, Improve has no descriptors to resolve, so
// this resolver returns no signal cards (honest empty — never a fabricated
// card). It keeps the `getAreaSignals` dispatch contract intact.

import type { MetricFilter } from "@/lib/filters/types";

import type { AreaSignal } from "./types";

/**
 * Resolve the Improve area's signal cards.
 *
 * Improve's resolver-backed hub cards are J5 scope; until then there are no
 * `hubItems` descriptors to resolve and this returns an empty list.
 *
 * @param filters  Active metric filter (unused until J5 wires Improve sources).
 * @param isTestMode  Render deterministic sample data without hitting the API.
 */
export function getImproveSignals(
    filters: MetricFilter,
    isTestMode = false,
): Promise<AreaSignal[]> {
    void filters;
    void isTestMode;
    return Promise.resolve([]);
}
