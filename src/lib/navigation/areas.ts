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
    hubItems: [
      {
        id: "metrics",
        label: "Metrics",
        href: "/metrics?tab=dora",
        description: "DORA and flow trends.",
      },
      {
        id: "people",
        label: "People",
        href: "/people",
        description: "Individual reflection surfaces.",
      },
      {
        id: "code",
        label: "Code",
        href: "/code",
        description: "Code health and ownership.",
      },
      {
        id: "landscape",
        label: "Landscape",
        href: "/explore/landscape",
        description: "System landscape overview.",
      },
      {
        id: "complexity",
        label: "Complexity",
        href: "/complexity",
        description: "Complexity trend and hotspots.",
      },
      {
        id: "cognitive-load",
        label: "Cognitive Load",
        href: "/cognitive-load",
        description: "Focus and context-switch pressure.",
      },
      {
        id: "bottleneck",
        label: "Bottlenecks",
        href: "/bottleneck",
        description: "Flow bottleneck detection.",
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
    hubItems: [
      {
        id: "capacity-planning",
        label: "Capacity Planning",
        href: "/capacity-planning",
        description: "Plan capacity against demand.",
      },
      {
        id: "ai-workflows",
        label: "AI Workflows",
        href: "/ai",
        description: "AI impact, attribution, and governance.",
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
    hubItems: [
      {
        id: "pipelines",
        label: "Pipelines",
        href: "/testops/pipelines",
        description: "Pipeline stability.",
      },
      {
        id: "tests",
        label: "Tests",
        href: "/testops/tests",
        description: "Test reliability and flake.",
      },
      {
        id: "quality",
        label: "Quality",
        href: "/quality",
        description: "Reliability and rework.",
      },
      {
        id: "coverage",
        label: "Coverage",
        href: "/testops/coverage",
        description: "Coverage delta.",
      },
      {
        id: "risk",
        label: "Delivery Risk",
        href: "/testops/risk",
        description: "Delivery risk drag.",
      },
      {
        id: "incident-correlation",
        label: "Incident Correlation",
        href: "/incident-correlation",
        description: "Incidents correlated to changes.",
      },
      {
        id: "security",
        label: "Security",
        href: "/security",
        description: "Security posture.",
      },
      {
        id: "feature-flags",
        label: "Feature Flags",
        href: "/feature-flags",
        description: "Flag lifecycle and debt.",
      },
      {
        id: "risk-compounding",
        label: "Compounding Risk",
        href: "/risk/compounding",
        description: "Compounding risk signals.",
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
