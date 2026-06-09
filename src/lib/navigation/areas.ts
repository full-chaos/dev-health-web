// ── Primary navigation: decision areas ───────────────────────────────────────
//
// Design Framework A1 (two-level sidebar) + A2 (tabs are sibling views *within*
// a destination, never the sidebar). The sidebar surfaces the eight decision
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

export type NavAreaId =
    | "cockpit"
    | "diagnose"
    | "plan"
    | "improve"
    | "govern"
    | "ai"
    | "reports"
    | "admin";

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
 * Children are DESTINATIONS, not tabs — local tab subviews are siblings *within*
 * a destination (Framework A2)
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
    exact?: boolean;
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
        ownedPathPrefixes: ["/dashboard"],
        legacyActiveIds: ["home", "cockpit"],
        hubItems: [],
        // Cockpit's only destination is its landing route — no expandable children.
        children: [],
    },
    {
        id: "diagnose",
        label: "Diagnose",
        href: "/diagnose",
        placement: "main",
        ownedPathPrefixes: [
            "/diagnose",
            "/metrics",
            "/team-flow",
            "/investment",
            "/people",
            "/code",
            "/landscape",
            "/complexity",
            "/cognitive-load",
            "/bottleneck",
        ],
        legacyActiveIds: [
            "work",
            "flow",
            "investment",
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
                id: "flow",
                label: "Flow",
                href: "/metrics?tab=flow",
                description: "Flow trends and delivery movement.",
                metricLabel: "Deploy frequency",
            },
            {
                id: "investment",
                label: "Investment",
                href: "/investment",
                description: "Effort and attention allocation.",
                metricLabel: "Planned allocation",
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
                href: "/landscape",
                description: "System landscape overview.",
                metricLabel: "Bus factor",
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
                // Wired via the cognitiveLoad GraphQL resolver (CHAOS-2077):
                // headline = avg PR interruption load over the window.
                metricLabel: "Interruption load",
            },
            {
                id: "bottleneck",
                label: "Bottlenecks",
                href: "/bottleneck",
                description: "Flow bottleneck detection.",
                metricLabel: "WIP saturation",
            },
        ],
        children: [
            {
                id: "diagnose-overview",
                label: "Overview",
                path: "/diagnose",
                navVisible: true,
            },
            {
                id: "flow",
                label: "Flow",
                path: "/metrics?tab=flow",
                navVisible: true,
                ownedPaths: ["/metrics"],
            },
            {
                id: "investment",
                label: "Investment",
                path: "/investment",
                navVisible: true,
            },
            {
                id: "landscape",
                label: "Landscape",
                path: "/landscape",
                navVisible: true,
            },
            {
                id: "work-graph",
                label: "Work Graph",
                path: "/diagnose/work-graph",
                navVisible: true,
            },
            {
                id: "complexity",
                label: "Complexity",
                path: "/complexity",
                navVisible: true,
            },
            {
                id: "cognitive-load",
                label: "Cognitive Load",
                path: "/cognitive-load",
                navVisible: true,
            },
            {
                id: "bottleneck",
                label: "Bottlenecks",
                path: "/bottleneck",
                navVisible: true,
            },
            { id: "people", label: "People", path: "/people", navVisible: true },
            { id: "code", label: "Code", path: "/code", navVisible: true },
        ],
    },
    {
        id: "plan",
        label: "Plan",
        href: "/plan",
        placement: "main",
        ownedPathPrefixes: ["/plan", "/capacity-planning", "/operating-review"],
        legacyActiveIds: [
            "capacity-planning",
            "delivery-forecast",
            "capacity",
            "operating-review",
            "plan",
        ],
        hubItems: [
            {
                id: "capacity",
                label: "Capacity Forecast",
                href: "/plan/capacity",
                description: "Monte Carlo throughput forecasting.",
                metricLabel: "Forecast window",
            },
        ],
        children: [
            {
                id: "plan-overview",
                label: "Overview",
                path: "/plan",
                navVisible: true,
            },
            {
                id: "capacity",
                label: "Capacity Forecast",
                path: "/plan/capacity",
                navVisible: true,
            },
            {
                id: "operating-review",
                label: "Operating Review",
                path: "/operating-review",
                navVisible: false,
                preview: true,
            },
        ],
    },
    {
        id: "improve",
        label: "Improve",
        href: "/opportunities",
        placement: "main",
        ownedPathPrefixes: ["/opportunities", "/improve"],
        legacyActiveIds: ["opportunities", "experiments", "automations", "improve"],
        hubItems: [
            {
                id: "opportunities",
                label: "Opportunities",
                href: "/opportunities",
                description: "Evidence-linked improvement opportunities.",
                metricLabel: "Opportunities data",
            },
            {
                id: "experiments",
                label: "Experiments",
                href: "/improve/experiments",
                description: "Run and track improvement experiments.",
                metricLabel: "Experiments data",
            },
            {
                id: "improve-automations",
                label: "Automations",
                href: "/improve/automations",
                description: "Automated improvement workflows.",
                metricLabel: "Automations data",
            },
        ],
        children: [
            {
                id: "opportunities",
                label: "Opportunities",
                path: "/opportunities",
                navVisible: true,
            },
            {
                id: "experiments",
                label: "Experiments",
                path: "/improve/experiments",
                navVisible: false,
                preview: true,
            },
            {
                id: "improve-automations",
                label: "Automations",
                path: "/improve/automations",
                navVisible: false,
                preview: true,
            },
        ],
    },
    {
        id: "govern",
        label: "Govern",
        href: "/govern",
        placement: "main",
        ownedPathPrefixes: [
            "/govern",
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
        // each internally severity-sorted by the resolver (getGovernSignals).
        hubItems: [
            // ── Cluster: Quality ──────────────────────────────────────────────────
            {
                id: "testops",
                label: "TestOps",
                href: "/testops",
                description: "Pipeline, test, and coverage health.",
                cluster: "Quality",
                metricLabel: "Worst TestOps signal",
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
        children: [
            {
                id: "govern-overview",
                label: "Overview",
                path: "/govern",
                navVisible: true,
            },
            {
                id: "testops",
                label: "TestOps",
                path: "/testops",
                navVisible: true,
                ownedPaths: [
                    "/testops",
                    "/testops/pipelines",
                    "/testops/tests",
                    "/testops/coverage",
                ],
                isCluster: true,
            },
            {
                id: "quality",
                label: "Quality",
                path: "/quality",
                navVisible: true,
            },
            {
                id: "risk",
                label: "Delivery Risk",
                path: "/testops/risk",
                navVisible: true,
            },
            {
                id: "incident-correlation",
                label: "Incident Correlation",
                path: "/incident-correlation",
                navVisible: true,
            },
            {
                id: "security",
                label: "Security",
                path: "/security",
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
            {
                id: "risk-compounding",
                label: "Compounding Risk",
                path: "/risk/compounding",
                navVisible: true,
            },
        ],
    },
    {
        id: "ai",
        label: "AI",
        href: "/ai",
        placement: "main",
        ownedPathPrefixes: ["/ai"],
        legacyActiveIds: ["ai", "ai-workflows"],
        // CHAOS-2198: AI is sub-grouped into "Signal" (monitoring metrics) and
        // "Action" (opportunity / recommendation surfaces), severity-sorted by
        // the resolver (getAISignals). Mirrors the Govern cluster pattern.
        hubItems: [
            // ── Cluster: Signal ──────────────────────────────────────────────────
            {
                id: "ai-impact",
                label: "Impact",
                href: "/ai/impact",
                description: "AI-assisted delivery and review impact.",
                cluster: "Signal",
                metricLabel: "AI impact",
            },
            {
                id: "ai-review-load",
                label: "Review Load",
                href: "/ai/review-load",
                description: "AI-associated review pressure.",
                cluster: "Signal",
                metricLabel: "Review pressure",
            },
            {
                id: "ai-governance-risk",
                label: "Governance Risk",
                href: "/ai/risk",
                description: "Quality and governance signals for AI-associated work.",
                cluster: "Signal",
                metricLabel: "Governance risk",
            },
            // ── Cluster: Action ──────────────────────────────────────────────────
            {
                id: "ai-automations",
                label: "Automations",
                href: "/ai/automations",
                description: "Responsible automation opportunities.",
                cluster: "Action",
                metricLabel: "Automation candidates",
            },
        ],
        children: [
            { id: "ai-overview", label: "Overview", path: "/ai", navVisible: true },
            {
                id: "ai-impact",
                label: "Impact",
                path: "/ai/impact",
                navVisible: true,
            },
            {
                id: "ai-attribution",
                label: "Attribution",
                path: "/ai/attribution",
                navVisible: false,
                preview: true,
            },
            {
                id: "ai-review-load",
                label: "Review Load",
                path: "/ai/review-load",
                navVisible: true,
            },
            {
                id: "ai-governance-risk",
                label: "Governance Risk",
                path: "/ai/risk",
                // CHAOS-2197: Test Gaps + Evidence are in-page tabs here; their
                // retired standalone routes redirect and resolve to this child.
                ownedPaths: ["/ai/risk", "/ai/test-gaps", "/ai/evidence"],
                navVisible: true,
            },
            {
                id: "ai-automations",
                label: "Automations",
                path: "/ai/automations",
                navVisible: true,
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
            {
                id: "report-center",
                label: "Report Center",
                path: "/reports",
                navVisible: true,
                exact: true,
            },
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
        children: [
            {
                id: "organization",
                label: "Organization",
                path: "/admin",
                navVisible: true,
                exact: true,
            },
            {
                id: "connections",
                label: "Connections",
                path: "/admin/sync",
                navVisible: true,
            },
            {
                id: "data-confidence",
                label: "Data Confidence",
                path: "/data-health",
                navVisible: true,
            },
            {
                id: "settings",
                label: "Settings",
                path: "/settings",
                navVisible: true,
            },
            {
                id: "billing",
                label: "Billing",
                path: "/admin/billing",
                navVisible: false,
                preview: true,
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
            const matches = child.exact ? pathname === owned : pathMatchesPrefix(pathname, owned);
            if (matches && owned.length > (selected?.score ?? -1)) {
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
 * link-less crumb. If no child owns the pathname, the area is the current crumb.
 *
 * Returns `[]` for routes no area owns (callers fall back to bespoke crumbs).
 */
export function navTrailForPathname(pathname: string): Crumb[] {
    const resolved = resolveAreaAndChild(pathname);
    if (!resolved) return [];
    const { area, child } = resolved;

    if (!child) {
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
    if (child) return child.label;
    return area.label;
}

/** Strip query/hash so route comparisons use the bare path. */
export function basePath(href: string): string {
    return href.split("?")[0].split("#")[0];
}
