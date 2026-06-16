export const iaPreservationBaseline = {
    navVisibleDestinations: [
        {
            areaId: "diagnose",
            childId: "diagnose-overview",
            label: "Overview",
            path: "/diagnose",
        },
        {
            areaId: "diagnose",
            childId: "flow",
            label: "Flow",
            path: "/metrics?tab=flow",
        },
        {
            areaId: "diagnose",
            childId: "investment",
            label: "Investment",
            path: "/investment",
        },
        {
            areaId: "diagnose",
            childId: "landscape",
            label: "Landscape",
            path: "/landscape",
        },
        {
            areaId: "diagnose",
            childId: "work-graph",
            label: "Work Graph",
            path: "/diagnose/work-graph",
        },
        { areaId: "diagnose", childId: "people", label: "People", path: "/people" },
        { areaId: "diagnose", childId: "code", label: "Code", path: "/code" },
        {
            areaId: "diagnose",
            childId: "complexity",
            label: "Complexity",
            path: "/complexity",
        },
        {
            areaId: "diagnose",
            childId: "cognitive-load",
            label: "Cognitive Load",
            path: "/cognitive-load",
        },
        {
            areaId: "diagnose",
            childId: "bottleneck",
            label: "Bottlenecks",
            path: "/bottleneck",
        },
        {
            areaId: "plan",
            childId: "plan-overview",
            label: "Overview",
            path: "/plan",
        },
        {
            areaId: "plan",
            childId: "capacity",
            label: "Completion Forecast",
            path: "/plan/capacity",
        },
        {
            areaId: "improve",
            childId: "improve-overview",
            label: "Overview",
            path: "/improve",
        },
        {
            areaId: "improve",
            childId: "opportunities",
            label: "Opportunities",
            path: "/opportunities",
        },
        {
            areaId: "govern",
            childId: "govern-overview",
            label: "Overview",
            path: "/govern",
        },
        {
            areaId: "govern",
            childId: "testops",
            label: "TestOps",
            path: "/testops",
        },
        {
            areaId: "govern",
            childId: "quality",
            label: "Quality",
            path: "/quality",
        },
        {
            areaId: "govern",
            childId: "risk",
            label: "Delivery Risk",
            path: "/testops/risk",
        },
        {
            areaId: "govern",
            childId: "incident-correlation",
            label: "Incident Correlation",
            path: "/incident-correlation",
        },
        {
            areaId: "govern",
            childId: "security",
            label: "Security",
            path: "/security",
        },
        {
            areaId: "govern",
            childId: "feature-flags",
            label: "Feature Flags",
            path: "/feature-flags",
        },
        {
            areaId: "govern",
            childId: "risk-compounding",
            label: "Compounding Risk",
            path: "/risk/compounding",
        },
        { areaId: "ai", childId: "ai-overview", label: "Overview", path: "/ai" },
        { areaId: "ai", childId: "ai-impact", label: "Impact", path: "/ai/impact" },
        {
            areaId: "ai",
            childId: "ai-review-load",
            label: "Review Load",
            path: "/ai/review-load",
        },
        {
            areaId: "ai",
            childId: "ai-governance-risk",
            label: "Governance Risk",
            path: "/ai/risk",
        },
        {
            areaId: "ai",
            childId: "ai-automations",
            label: "Automations",
            path: "/ai/automations",
        },
        {
            areaId: "reports",
            childId: "report-center",
            label: "Report Center",
            path: "/reports",
        },
        {
            areaId: "admin",
            childId: "organization",
            label: "Organization",
            path: "/org/admin",
        },
        {
            areaId: "admin",
            childId: "connections",
            label: "Connections",
            path: "/org/admin/sync",
        },
        {
            areaId: "admin",
            childId: "data-confidence",
            label: "Data Confidence",
            path: "/data-health",
        },
        {
            areaId: "admin",
            childId: "settings",
            label: "Settings",
            path: "/settings",
        },
    ],
    legacyWorkRedirects: [
        { href: "/work", expectedPath: "/diagnose" },
        { href: "/work?view=work", expectedPath: "/diagnose/work-graph" },
        { tab: "overview", href: "/work?tab=overview", expectedPath: "/diagnose" },
        { tab: "flow", href: "/work?tab=flow", expectedPath: "/metrics" },
        {
            tab: "capacity",
            href: "/work?tab=capacity",
            expectedPath: "/plan/capacity",
        },
        {
            tab: "heatmap",
            href: "/work?tab=heatmap",
            expectedPath: "/cognitive-load",
        },
        { tab: "flame", href: "/work?tab=flame", expectedPath: "/complexity" },
        {
            tab: "evidence",
            href: "/work?tab=evidence",
            expectedPath: "/diagnose/work-graph",
        },
        {
            tab: "graph",
            href: "/work?tab=graph",
            expectedPath: "/diagnose/work-graph",
        },
    ],
    investigationDeepLinks: [
        {
            source: "InvestigationPanel",
            intent: "cycle breakdown flame view",
            href: "/complexity?tab=flame&mode=cycle_breakdown",
            expectedPath: "/complexity",
            expectedTab: "flame",
        },
        {
            source: "InvestigationPanel",
            intent: "throughput flame view",
            href: "/complexity?tab=flame&mode=throughput",
            expectedPath: "/complexity",
            expectedTab: "flame",
        },
        {
            source: "InvestigationPanel",
            intent: "code hotspots flame view",
            href: "/complexity?tab=flame&mode=code_hotspots",
            expectedPath: "/complexity",
            expectedTab: "flame",
        },
        {
            source: "InvestigationPanel",
            intent: "related patterns heatmap view",
            href: "/cognitive-load?tab=heatmap",
            expectedPath: "/cognitive-load",
            expectedTab: "heatmap",
        },
        {
            source: "FlowView",
            intent: "selected node flame view",
            href: "/complexity?tab=flame&mode=throughput&context_node=Selected%20Node",
            expectedPath: "/complexity",
            expectedTab: "flame",
        },
        {
            source: "FlowView/InspectPanel",
            intent: "work graph view",
            href: "/diagnose/work-graph",
            expectedPath: "/diagnose/work-graph",
            expectedTab: null,
        },
    ],
    // Direct destination links (NOT Work workbench deep-links): these point at a
    // real area destination. LandscapeView's 'Open metrics' CTA goes straight to the
    // Flow destination (/metrics?tab=flow), reversing the old 2-hop /work?tab=flow.
    directDestinationLinks: [
        {
            source: "LandscapeView",
            intent: "open metrics (flow)",
            href: "/metrics?tab=flow",
            expectedPath: "/metrics",
            expectedTab: "flow",
        },
    ],
    // Legacy alias routes: reachable redirect-only pages that preserve the query and
    // forward to a real destination. Guarded so a future cleanup cannot delete a
    // reachable alias (the #609/#610 failure mode) unnoticed. Invariant #7 cross-checks
    // this list against an INDEPENDENT filesystem scan of redirect-only route files.
    legacyAliasRoutes: [
        { route: "/team-flow", redirectsTo: "/metrics?tab=flow" },
        { route: "/capacity-planning", redirectsTo: "/plan/capacity" },
        { route: "/plan/delivery-forecast", redirectsTo: "/plan" },
        { route: "/explore/landscape", redirectsTo: "/landscape" },
    ],
} as const;
