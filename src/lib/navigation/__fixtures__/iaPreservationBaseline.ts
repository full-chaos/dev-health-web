export const iaPreservationBaseline = {
    navVisibleDestinations: [
        {
            areaId: "diagnose",
            childId: "diagnose-overview",
            label: "Overview",
            path: "/work",
        },
        {
            areaId: "diagnose",
            childId: "work",
            label: "Work",
            path: "/work?view=work",
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
            label: "Capacity Forecast",
            path: "/plan/capacity",
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
            path: "/admin",
        },
        {
            areaId: "admin",
            childId: "connections",
            label: "Connections",
            path: "/admin/sync",
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
    workWorkbenchViews: [
        { tab: "overview", href: "/work?tab=overview" },
        { tab: "heatmap", href: "/work?tab=heatmap" },
        { tab: "flame", href: "/work?tab=flame" },
        { tab: "evidence", href: "/work?tab=evidence" },
        { tab: "graph", href: "/work?tab=graph" },
    ],
    investigationDeepLinks: [
        {
            source: "InvestigationPanel",
            intent: "cycle breakdown flame view",
            href: "/work?view=work&tab=flame&mode=cycle_breakdown",
            expectedTab: "flame",
        },
        {
            source: "InvestigationPanel",
            intent: "throughput flame view",
            href: "/work?view=work&tab=flame&mode=throughput",
            expectedTab: "flame",
        },
        {
            source: "InvestigationPanel",
            intent: "code hotspots flame view",
            href: "/work?view=work&tab=flame&mode=code_hotspots",
            expectedTab: "flame",
        },
        {
            source: "InvestigationPanel",
            intent: "related patterns heatmap view",
            href: "/work?view=work&tab=heatmap",
            expectedTab: "heatmap",
        },
        {
            source: "FlowView",
            intent: "selected node flame view",
            href: "/work?view=work&tab=flame&mode=throughput&context_node=Selected%20Node",
            expectedTab: "flame",
        },
        {
            source: "FlowView/InspectPanel",
            intent: "work graph view",
            href: "/work?view=work&tab=graph",
            expectedTab: "graph",
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
