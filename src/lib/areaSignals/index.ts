// ── Area signals: shared dispatcher (CHAOS-2074) ──────────────────────────────
//
// `getAreaSignals(areaId, filters)` is the single RSC entry point an area
// landing calls to resolve its sub-area signal cards. Govern, Diagnose, and
// Improve are wired to their real resolvers. Cockpit renders its single
// navigational sub-area as a calm "neutral" card; reports / admin have no
// signal grid. No sub-area ever renders a fabricated value — a missing or
// failed source degrades to an honest "unavailable" (DataState) card.

import { getAreaById, type NavAreaId } from "@/lib/navigation/areas";
import type { MetricFilter } from "@/lib/filters/types";

import { getDiagnoseSignals } from "./diagnose";
import { getGovernSignals } from "./govern";
import { getImproveSignals } from "./improve";
import type { AreaSignal } from "./types";

export type { AreaSignal, AreaSignalState } from "./types";
export { getDiagnoseSignals } from "./diagnose";
export { getGovernSignals } from "./govern";
export { getImproveSignals } from "./improve";

/**
 * Resolve an area's signal cards. Govern/Diagnose/Improve fetch real signals;
 * Cockpit returns its single sub-area as a calm "neutral" card; reports / admin
 * return `[]` (no signal grid).
 */
export async function getAreaSignals(
  areaId: NavAreaId,
  filters: MetricFilter,
  isTestMode = false,
): Promise<AreaSignal[]> {
  switch (areaId) {
    case "govern":
      return getGovernSignals(filters, isTestMode);
    case "diagnose":
      return getDiagnoseSignals(filters, isTestMode);
    case "improve":
      return getImproveSignals(filters, isTestMode);
    case "cockpit":
      // Cockpit's single sub-area (Operating Review) has no severity metric; it
      // is a navigational surface. Render it as a calm "neutral" card rather
      // than implying a finding (leave-as-is per CHAOS-2074).
      return descriptorStubs(areaId, "neutral");
    default:
      // reports / admin — no signal grid.
      return [];
  }
}

/**
 * Map an area's nav descriptors to placeholder `AreaSignal`s in a given state.
 * "neutral" → calm navigational card for areas without severity metrics.
 */
function descriptorStubs(areaId: NavAreaId, state: "unavailable" | "neutral"): AreaSignal[] {
  const area = getAreaById(areaId);
  if (!area) return [];
  return area.hubItems.map((item) => ({
    id: item.id,
    label: item.label,
    href: item.href,
    cluster: item.cluster,
    metricLabel: item.metricLabel ?? item.description ?? item.label,
    value: "",
    state,
    demoted: item.demoted,
  }));
}
