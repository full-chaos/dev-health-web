// ── Primary navigation: decision areas ───────────────────────────────────────
//
// Design Framework A1 ("sidebar = major product areas only") + A2 ("leaves live
// in area tabs/drill-down"). The sidebar surfaces exactly six decision areas;
// individual leaf/metric destinations are NOT enumerated in the sidebar. Each
// area owns a landing route, and its leaves are reachable from that landing via
// the `AreaHub` drill-down (see `@/components/navigation/AreaHub`).
//
// This is the single source of truth shared by:
//   - PrimaryNav (renders the six area rows + active state)
//   - AreaHub (renders each area's leaf drill-down on its landing page)
//   - PrimaryNav.test / areas.test (contract + reachability guarantees)
//
// CHAOS-2073: the prior collapse (CHAOS-2043) only created collapsible group
// headers while still rendering every leaf link flat. Keeping leaf rows in the
// DOM — even visually collapsed — repeats that regression, so leaves live here
// only as `hubItems`, never as sidebar rows.

export type NavAreaId = "cockpit" | "diagnose" | "improve" | "govern" | "reports" | "admin";

export type NavAreaHubItem = {
  id: string;
  label: string;
  href: string;
  description?: string;
  // ── Signal-card descriptors (CHAOS-2074) ───────────────────────────────────
  // Static metadata the area resolver pairs with a fetched value to build an
  // `AreaSignal`. Kept here (the single nav source of truth) so the sidebar,
  // landing hub, and signal resolvers can never drift. The *value* + *state* are
  // resolved at request time by the area resolver (see `@/lib/areaSignals`);
  // these fields only describe HOW a sub-area surfaces as a card.
  /**
   * Optional sub-group header within a dense area. Govern groups into
   * "Quality" / "Risk"; flat areas (Diagnose, Improve) leave this undefined.
   */
  cluster?: string;
  /** Short metric name shown on the card (e.g. "Line coverage", "Open criticals"). */
  metricLabel?: string;
  /**
   * R4 low-value single surface (e.g. Feature Flags): render visually secondary
   * within its cluster rather than at equal billing.
   */
  demoted?: boolean;
};

export type NavArea = {
  id: NavAreaId;
  label: string;
  /** The area's landing route — what the sidebar row links to. */
  href: string;
  placement: "main" | "utility";
  /**
   * Route prefixes this area owns, used for active-state resolution. A pathname
   * is matched against every area's prefixes; the longest matching prefix wins
   * (so `/testops/risk` resolves to Govern, `/risk/compounding` to Govern, etc).
   */
  ownedPathPrefixes: string[];
  /**
   * Legacy per-page `active="…"` ids (the pre-collapse leaf ids). Used only as a
   * fallback when no pathname prefix matches, so existing `<PrimaryNav active=…>`
   * call sites keep highlighting the correct area without editing every page.
   */
  legacyActiveIds: string[];
  /**
   * Leaf destinations reachable from this area's landing page via `AreaHub`.
   * Empty for areas whose only destination is the landing route itself.
   */
  hubItems: NavAreaHubItem[];
};

export const navAreas: readonly NavArea[] = [
  // ── Main spine ──────────────────────────────────────────────────────────────
  {
    id: "cockpit",
    label: "Cockpit",
    href: "/dashboard",
    placement: "main",
    ownedPathPrefixes: ["/dashboard", "/operating-review"],
    legacyActiveIds: ["home", "operating-review", "cockpit"],
    hubItems: [
      {
        id: "operating-review",
        label: "Operating Review",
        href: "/operating-review",
        description: "Periodic operating review of system health.",
      },
    ],
  },
  {
    id: "diagnose",
    label: "Diagnose",
    href: "/work",
    placement: "main",
    ownedPathPrefixes: [
      "/work",
      "/metrics",
      "/people",
      "/code",
      "/explore",
      "/complexity",
      "/cognitive-load",
      "/bottleneck",
    ],
    legacyActiveIds: [
      "work",
      "metrics",
      "people",
      "code",
      "landscape",
      "complexity",
      "cognitive-load",
      "bottleneck",
      "diagnose",
    ],
    // CHAOS-2074: Diagnose is FLAT (no clusters). Descriptors placed here; Phase
    // 2 wires the resolver fetching (see `@/lib/areaSignals/getAreaSignals`).
    hubItems: [
      {
        id: "metrics",
        label: "Metrics",
        href: "/metrics?tab=dora",
        description: "DORA and flow trends.",
        metricLabel: "Deploy frequency",
      },
      {
        id: "people",
        label: "People",
        href: "/people",
        description: "Individual reflection surfaces.",
        // No area-level metric → resolver surfaces "unavailable" (DataState).
        metricLabel: "No area metric",
      },
      {
        id: "code",
        label: "Code",
        href: "/code",
        description: "Code health and ownership.",
        metricLabel: "Code churn",
      },
      {
        id: "landscape",
        label: "Landscape",
        href: "/explore/landscape",
        description: "System landscape overview.",
        // Gap: no resolver-backed metric yet → "unavailable" (DataState).
        metricLabel: "No area metric",
      },
      {
        id: "complexity",
        label: "Complexity",
        href: "/complexity",
        description: "Complexity trend and hotspots.",
        metricLabel: "Avg complexity",
      },
      {
        id: "cognitive-load",
        label: "Cognitive Load",
        href: "/cognitive-load",
        description: "Focus and context-switch pressure.",
        // Gap: no resolver-backed metric yet → "unavailable" (DataState).
        metricLabel: "No area metric",
      },
      {
        id: "bottleneck",
        label: "Bottlenecks",
        href: "/bottleneck",
        description: "Flow bottleneck detection.",
        metricLabel: "WIP saturation",
      },
    ],
  },
  {
    id: "improve",
    label: "Improve",
    href: "/opportunities",
    placement: "main",
    ownedPathPrefixes: ["/opportunities", "/capacity-planning", "/capacity", "/ai"],
    legacyActiveIds: ["opportunities", "capacity-planning", "ai-workflows", "improve"],
    // CHAOS-2074: Improve is FLAT (no clusters). Opportunities is the area's own
    // landing route (`href: "/opportunities"`), so it is NOT duplicated as a hub
    // item — its volume signal bubbles at the area level via the resolver.
    // Descriptors placed here; Phase 2 wires the resolver fetching.
    hubItems: [
      {
        id: "capacity-planning",
        label: "Capacity Planning",
        href: "/capacity-planning",
        description: "Plan capacity against demand.",
        metricLabel: "Forecast (p50 weeks)",
      },
      {
        id: "ai-workflows",
        label: "AI Workflows",
        href: "/ai",
        description: "AI impact, attribution, and governance.",
        // Adoption %, NOT a severity → resolver surfaces a neutral/info state.
        metricLabel: "AI-assisted PRs",
      },
    ],
  },
  {
    id: "govern",
    label: "Govern",
    href: "/testops",
    placement: "main",
    ownedPathPrefixes: [
      "/testops",
      "/quality",
      "/security",
      "/feature-flags",
      "/incident-correlation",
      "/risk",
    ],
    legacyActiveIds: [
      "testops",
      "pipelines",
      "tests",
      "quality",
      "coverage",
      "risk",
      "incident-correlation",
      "security",
      "feature-flags",
      "risk-compounding",
      "govern",
    ],
    // CHAOS-2074: Govern is sub-grouped into "Quality" and "Risk" clusters,
    // each internally severity-sorted by the resolver (`getGovernSignals`).
    hubItems: [
      // ── Cluster: Quality ──────────────────────────────────────────────────
      {
        id: "coverage",
        label: "Coverage",
        href: "/testops/coverage",
        description: "Coverage delta.",
        cluster: "Quality",
        metricLabel: "Line coverage",
      },
      {
        id: "tests",
        label: "Tests",
        href: "/testops/tests",
        description: "Test reliability and flake.",
        cluster: "Quality",
        metricLabel: "Flake rate",
      },
      {
        id: "pipelines",
        label: "Pipelines",
        href: "/testops/pipelines",
        description: "Pipeline stability.",
        cluster: "Quality",
        metricLabel: "Success rate",
      },
      {
        id: "quality",
        label: "Quality",
        href: "/quality",
        description: "Reliability and rework.",
        cluster: "Quality",
        metricLabel: "Change failure rate",
      },
      // ── Cluster: Risk ─────────────────────────────────────────────────────
      {
        id: "security",
        label: "Security",
        href: "/security",
        description: "Security posture.",
        cluster: "Risk",
        metricLabel: "Open criticals",
      },
      {
        id: "risk",
        label: "Delivery Risk",
        href: "/testops/risk",
        description: "Delivery risk drag.",
        cluster: "Risk",
        metricLabel: "Release confidence",
      },
      {
        id: "incident-correlation",
        label: "Incident Correlation",
        href: "/incident-correlation",
        description: "Incidents correlated to changes.",
        cluster: "Risk",
        metricLabel: "Change failure rate",
      },
      {
        id: "risk-compounding",
        label: "Compounding Risk",
        href: "/risk/compounding",
        description: "Compounding risk signals.",
        cluster: "Risk",
        metricLabel: "Worst risk score",
      },
      {
        id: "feature-flags",
        label: "Feature Flags",
        href: "/feature-flags",
        description: "Flag lifecycle and debt.",
        cluster: "Risk",
        metricLabel: "Active flags",
        // R4: low-value single surface — render secondary, not equal billing.
        demoted: true,
      },
    ],
  },
  // ── Utility tray ────────────────────────────────────────────────────────────
  {
    id: "reports",
    label: "Reports",
    href: "/reports",
    placement: "utility",
    ownedPathPrefixes: ["/reports"],
    legacyActiveIds: ["reports"],
    hubItems: [],
  },
  {
    id: "admin",
    label: "Admin",
    href: "/admin",
    placement: "utility",
    ownedPathPrefixes: ["/admin", "/settings"],
    legacyActiveIds: ["admin", "settings"],
    hubItems: [],
  },
] as const;

export function getAreaById(id: NavAreaId): NavArea | undefined {
  return navAreas.find((area) => area.id === id);
}

/** True when `pathname` is exactly `prefix` or a descendant of it. */
function pathMatchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Resolve the single active area for the current location (A10: exactly one
 * selected destination). Longest owned-path-prefix match wins; if nothing
 * matches the pathname, fall back to the legacy `active` prop id.
 */
export function selectedAreaIdForPathname(
  areas: readonly NavArea[],
  pathname: string,
  fallbackActive?: string,
): NavAreaId | undefined {
  let selected: { id: NavAreaId; score: number } | undefined;

  for (const area of areas) {
    for (const prefix of area.ownedPathPrefixes) {
      if (pathMatchesPrefix(pathname, prefix) && prefix.length > (selected?.score ?? -1)) {
        selected = { id: area.id, score: prefix.length };
      }
    }
  }

  if (selected) return selected.id;

  if (fallbackActive) {
    const fallbackArea = areas.find(
      (area) => area.id === fallbackActive || area.legacyActiveIds.includes(fallbackActive),
    );
    if (fallbackArea) return fallbackArea.id;
  }

  return undefined;
}
