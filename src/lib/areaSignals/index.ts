// ── Area signals: shared dispatcher (CHAOS-2074) ──────────────────────────────
//
// `getAreaSignals(areaId, filters)` is the single RSC entry point an area
// landing calls to resolve its sub-area signal cards. Govern is wired to its
// real resolver now; Diagnose / Improve are Phase-2 stubs that currently return
// the static descriptors as honest-empty ("unavailable") cards so the landing
// renders the right SHAPE before the resolver fetching lands. Cockpit / utility
// areas have no signal grid.
//
// Phase 2 only has to replace the `diagnose` / `improve` cases with real
// resolvers mirroring `getGovernSignals` — the type, the AreaHub rendering, and
// the descriptors are already in place.

import { getAreaById, type NavAreaId } from "@/lib/navigation/areas";
import type { MetricFilter } from "@/lib/filters/types";

import { getGovernSignals } from "./govern";
import type { AreaSignal } from "./types";

export type { AreaSignal, AreaSignalState } from "./types";
export { getGovernSignals } from "./govern";

/**
 * Resolve an area's signal cards. Returns `[]` for areas with no signal grid
 * (cockpit, reports, admin) and honest-empty descriptor cards for areas whose
 * resolver is not yet wired (Phase 2).
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
    case "improve":
      // Phase 2 wires these resolvers. Until then, surface the descriptors as
      // honest-empty cards (never fabricated values) so the grid shape is right.
      return descriptorStubs(areaId, "unavailable");
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
 * "unavailable" → honest-empty (DataState) for not-yet-wired metric areas;
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
