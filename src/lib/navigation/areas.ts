// ── Primary navigation: decision areas ───────────────────────────────────────
//
// Design Framework A1 (two-level sidebar) + A2 (tabs are sibling views *within*
// a destination, never the sidebar). The sidebar surfaces the six decision
// areas; the ACTIVE area expands to its child destinations (`children`) as an
// indented list. Inactive areas stay collapsed.
//
// Two route models live here, kept deliberately distinct:
//   - `children`  → the SIDEBAR route tree (CHAOS-2075): real destinations the
//                   active area expands to. Tab subviews are NOT children.
//   - `hubItems`  → the landing-page triage cards (CHAOS-2074 signal-card
//                   descriptors). Untouched by the sidebar work.
//
// This is the single source of truth shared by:
//   - PrimaryNav (renders the area rows, expands the active area's children)
//   - AreaHub (renders each area's signal-card drill-down on its landing page)
//   - Breadcrumbs / page titles (navTrailForPathname / navTitleForPathname, so
//     sidebar label === breadcrumb === page title, rule A6)
//   - PrimaryNav.test / areas.test (contract + reachability guarantees)
//
// CHAOS-2073 (history): the prior collapse rendered every leaf flat; CHAOS-2075
// reintroduces leaf rows ONLY as the active area's expanded children, never as a
// flat always-on list, and only for routes that resolve to a real page.

import type { Crumb } from "@/components/Breadcrumbs";

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

/**
 * A child *destination* in the two-level sidebar (CHAOS-2075). Distinct from
 * {@link NavAreaHubItem} (the 2074 signal-card descriptors that drive the
 * landing triage grid): a `NavChildRoute` is a real route the active area
 * expands to as an indented sidebar row.
 *
 * Children are DESTINATIONS, not tabs — tab subviews (AI: Impact/Attribution/…;
 * Work: Landscape/Flow/…) are siblings *within* a destination (Framework A2)
 * and must never appear here. Only routes that resolve to a real page are
 * `navVisible`; phantom/not-yet-built routes are `preview` and never rendered.
 */
export type NavChildRoute = {
  id: string;
  label: string;
  /** The child's canonical route — the sidebar row links here. */
  path: string;
  /** Rendered in the sidebar only when true. Preview routes stay false. */
  navVisible: boolean;
  /** Phantom/not-yet-built route held for reference; never rendered. */
  preview?: boolean;
  /**
   * Routes whose active state resolves to THIS child (longest match wins among
   * a single area's navVisible children). Defaults to `[path]`. A cluster child
   * lists every route it fronts (e.g. `/testops/tests`, `/quality`).
   */
  ownedPaths?: string[];
  /** R4 low-value surface — render visually secondary within the list. */
  demoted?: boolean;
  /**
   * True when this single row fronts several destinations behind one in-page
   * tab strip (Phase 2). The sidebar shows ONE row; the tab strip lives on the
   * page, not in the sidebar.
   */
  isCluster?: boolean;
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
  /**
   * The two-level sidebar route tree (CHAOS-2075): the destinations the active
   * area expands to as indented rows. DISTINCT from `hubItems` — see
   * {@link NavChildRoute}. Empty when the area's only destination is its landing
   * route (e.g. Cockpit).
   */
  children: NavChildRoute[];
};

export const navAreas: readonly NavArea[] = [
  // ── Main spine ──────────────────────────────────────────────────────────────
  {
    id: "cockpit",
    label: "Cockpit",
    href: "/dashboard",
    placement: "main",
    // Operating Review moved to Improve (CHAOS-2075). `/operating-review` is no
    // longer area-owned here, so it resolves to Improve. The `hubItems` entry is
    // intentionally untouched (the 2074 landing cards are demoted in Phase 2).
    ownedPathPrefixes: ["/dashboard"],
    legacyActiveIds: ["home", "cockpit"],
    hubItems: [
      {
        id: "operating-review",
        label: "Operating Review",
        href: "/operating-review",
        description: "Periodic operating review of system health.",
      },
    ],
    // Cockpit's only destination is its landing route — no expandable children.
    children: [],
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
    // Two-level sidebar children (CHAOS-2075): Diagnose's destinations. Each is a
    // real page; the borrowed Work sub-views (Landscape/Flow/Heatmap/…) are TABS
    // on /work, not children. Work is the area landing AND a child row so the
    // expansion is self-consistent.
    children: [
      { id: "work", label: "Work", path: "/work", navVisible: true },
      { id: "metrics", label: "Metrics", path: "/metrics", navVisible: true },
      { id: "people", label: "People", path: "/people", navVisible: true },
      { id: "code", label: "Code", path: "/code", navVisible: true },
      { id: "landscape", label: "Landscape", path: "/explore/landscape", navVisible: true },
      { id: "complexity", label: "Complexity", path: "/complexity", navVisible: true },
      {
        id: "cognitive-load",
        label: "Cognitive Load",
        path: "/cognitive-load",
        navVisible: true,
      },
      { id: "bottleneck", label: "Bottlenecks", path: "/bottleneck", navVisible: true },
    ],
  },
  {
    id: "improve",
    label: "Improve",
    href: "/opportunities",
    placement: "main",
    // `/operating-review` moved here from Cockpit (CHAOS-2075).
    ownedPathPrefixes: [
      "/opportunities",
      "/capacity-planning",
      "/capacity",
      "/ai",
      "/operating-review",
    ],
    legacyActiveIds: [
      "opportunities",
      "capacity-planning",
      "ai-workflows",
      "operating-review",
      "improve",
    ],
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
    // Two-level sidebar children (CHAOS-2075). AI Workflows is ONE child row; its
    // Impact/Attribution/Review Load/Test Gaps/Risk/Evidence/Automations surfaces
    // are TABS on /ai (Framework A2), not sidebar children. `/ai` owns its whole
    // subtree so any AI tab keeps the AI Workflows row active. Operating Review
    // landed here from Cockpit.
    children: [
      { id: "opportunities", label: "Opportunities", path: "/opportunities", navVisible: true },
      {
        id: "capacity-planning",
        label: "Capacity Planning",
        path: "/capacity-planning",
        navVisible: true,
      },
      {
        id: "ai-workflows",
        label: "AI Workflows",
        path: "/ai",
        navVisible: true,
        ownedPaths: ["/ai"],
      },
      {
        id: "operating-review",
        label: "Operating Review",
        path: "/operating-review",
        navVisible: true,
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
    // Two-level sidebar children (CHAOS-2075). Tests · Quality · Coverage collapse
    // into ONE cluster row (owner decision): the row links to /testops/coverage
    // and stays active on any of its owned paths; the actual tab strip across
    // those three surfaces is Phase 2 (the sidebar only ever shows one row).
    // Pipelines stays a standalone row.
    children: [
      { id: "testops", label: "Overview", path: "/testops", navVisible: true },
      { id: "pipelines", label: "Pipelines", path: "/testops/pipelines", navVisible: true },
      {
        id: "tests-quality-coverage",
        label: "Tests · Quality · Coverage",
        path: "/testops/coverage",
        navVisible: true,
        isCluster: true,
        ownedPaths: ["/testops/tests", "/quality", "/testops/coverage"],
      },
      { id: "risk", label: "Delivery Risk", path: "/testops/risk", navVisible: true },
      {
        id: "incident-correlation",
        label: "Incident Correlation",
        path: "/incident-correlation",
        navVisible: true,
      },
      { id: "security", label: "Security", path: "/security", navVisible: true },
      {
        id: "risk-compounding",
        label: "Compounding Risk",
        path: "/risk/compounding",
        navVisible: true,
      },
      {
        id: "feature-flags",
        label: "Feature Flags",
        path: "/feature-flags",
        navVisible: true,
        // R4 low-value surface — rendered visually secondary in the list.
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
    // Report Center is the only built destination. Weekly Review / Executive
    // Summary / Export History are PREVIEW (phantom routes held for reference);
    // they are never rendered and never resolved until their pages exist — DO
    // NOT create stub pages for them (CHAOS-2075).
    children: [
      { id: "report-center", label: "Report Center", path: "/reports", navVisible: true },
      {
        id: "weekly-review",
        label: "Weekly Review",
        path: "/reports/weekly",
        navVisible: false,
        preview: true,
      },
      {
        id: "executive-summary",
        label: "Executive Summary",
        path: "/reports/executive",
        navVisible: false,
        preview: true,
      },
      {
        id: "export-history",
        label: "Export History",
        path: "/reports/exports",
        navVisible: false,
        preview: true,
      },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    href: "/admin",
    placement: "utility",
    // `/data-health` (Data Confidence) is an Admin destination outside `/admin`.
    ownedPathPrefixes: ["/admin", "/settings", "/data-health"],
    legacyActiveIds: ["admin", "settings", "data-health"],
    hubItems: [],
    // Built Admin destinations. Organization (distributed across admin subpages)
    // and Billing (no page) are intentionally omitted — not phantom-previewed,
    // just absent (CHAOS-2075).
    children: [
      { id: "settings", label: "Settings", path: "/admin/settings", navVisible: true },
      { id: "connections", label: "Connections", path: "/admin/integrations", navVisible: true },
      {
        id: "data-confidence",
        label: "Data Confidence",
        path: "/data-health",
        navVisible: true,
      },
    ],
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

/** The routes a child claims for active-state. Defaults to `[child.path]`. */
function ownedPathsFor(child: NavChildRoute): readonly string[] {
  return child.ownedPaths ?? [child.path];
}

/**
 * Resolve the single active CHILD within an area (A10: exactly one selected).
 * Only `navVisible` children are considered; the longest owned-path match wins,
 * so a cluster child (e.g. Tests · Quality · Coverage) lights up across every
 * path it fronts (`/quality`, `/testops/tests`, `/testops/coverage`) while a
 * more specific sibling (Pipelines `/testops/pipelines`) still beats the
 * area Overview (`/testops`). Returns `undefined` when no child owns the path
 * (the area row is selected, but no child is).
 */
export function selectedChildForPathname(
  area: NavArea,
  pathname: string,
): NavChildRoute | undefined {
  let selected: { child: NavChildRoute; score: number } | undefined;

  for (const child of area.children) {
    if (!child.navVisible) continue;
    for (const owned of ownedPathsFor(child)) {
      if (pathMatchesPrefix(pathname, owned) && owned.length > (selected?.score ?? -1)) {
        selected = { child, score: owned.length };
      }
    }
  }

  return selected?.child;
}

/**
 * Resolve the area (and its active child, if any) for a pathname using the same
 * longest-match rules the sidebar renders with. Shared by the breadcrumb/title
 * helpers so route metadata can never drift from the sidebar (rule A6).
 */
function resolveAreaAndChild(
  pathname: string,
): { area: NavArea; child?: NavChildRoute } | undefined {
  const areaId = selectedAreaIdForPathname(navAreas, pathname);
  if (!areaId) return undefined;
  const area = getAreaById(areaId);
  if (!area) return undefined;
  return { area, child: selectedChildForPathname(area, pathname) };
}

/**
 * Config-derived location trail (Area → Child) for `<Breadcrumbs>` (rule A6:
 * crumb labels are the sidebar labels, verbatim). The area crumb links to its
 * landing route; the child crumb is the current page — rendered as the last,
 * link-less crumb. When the pathname IS the area landing (or resolves to no
 * child) the area is the single, current crumb.
 *
 * Returns `[]` for routes no area owns (callers fall back to bespoke crumbs).
 */
export function navTrailForPathname(pathname: string): Crumb[] {
  const resolved = resolveAreaAndChild(pathname);
  if (!resolved) return [];
  const { area, child } = resolved;

  // No distinct child (area landing, or child === the landing route): the area
  // is the current page — a single, link-less crumb.
  if (!child || basePath(child.path) === basePath(area.href)) {
    return [{ label: area.label }];
  }

  return [{ label: area.label, href: area.href }, { label: child.label }];
}

/**
 * The page title for a pathname — the active child's label, else the area's
 * label (rule A6: page title === sidebar label === breadcrumb). Returns the
 * empty string for routes no area owns so callers can supply their own.
 */
export function navTitleForPathname(pathname: string): string {
  const resolved = resolveAreaAndChild(pathname);
  if (!resolved) return "";
  const { area, child } = resolved;
  if (child && basePath(child.path) !== basePath(area.href)) return child.label;
  return area.label;
}

/** Strip query/hash so route comparisons use the bare path. */
function basePath(href: string): string {
  return href.split("?")[0].split("#")[0];
}
