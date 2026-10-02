// The tab registry: the in-page tabs of a destination, in one place.
//
// `areas.ts` lists DESTINATIONS (sidebar rows). A destination can also have tabs: sibling views on
// one page, chosen with a query parameter. Their lists used to live inside each page; the pages and
// the command palette now read them from here, so a tab is declared once.
//
// A tab set names its destination by `basePath` (the path of a visible `navAreas` child). The first
// tab is the default: its link has no query value (`/complexity`, not `/complexity?tab=overview`),
// as the pages always linked it. Labels and ids are exactly what the pages rendered before.

import { CTA_LABELS } from "@/lib/design/cta";

import type { NavAreaId } from "./areas";

export type TabDef = {
    /** The value of the query parameter (and the `ViewSet` item id). */
    id: string;
    label: string;
    /** Route sets only (`param: "route"`): the tab's own route. */
    path?: string;
};

export type TabSet = {
    id: string;
    /** The area that owns the destination (the palette's second line names it). */
    areaId: NavAreaId;
    /** The destination's route: a `navAreas` child path. */
    basePath: string;
    /** The query parameter that carries the active tab, or `route`: each tab is its own route. */
    param: "tab" | "view" | "route";
    /**
     * The `navAreas` child path when it differs from `basePath` (Metrics: the sidebar's Flow row is
     * `/metrics?tab=flow`). The palette matches the destination by this path.
     */
    childPath?: string;
    /** The id of the default tab: no query value in its link. */
    defaultTabId: string;
    /** Keep the default tab's query value in its link (Metrics always linked `?tab=dora`). */
    explicitDefault?: boolean;
    tabs: readonly TabDef[];
};

export const TAB_SETS = [
    {
        id: "complexity",
        areaId: "diagnose",
        basePath: "/complexity",
        param: "tab",
        defaultTabId: "overview",
        tabs: [
            { id: "overview", label: "Overview" },
            { id: "flame", label: "Flame" },
            { id: "hotspots", label: "Hotspots" },
            { id: "ownership-risk", label: "Ownership Risk" },
            { id: "churn", label: "Churn" },
        ],
    },
    {
        id: "cognitive-load",
        areaId: "diagnose",
        basePath: "/cognitive-load",
        param: "tab",
        defaultTabId: "overview",
        tabs: [
            { id: "overview", label: "Overview" },
            { id: "heatmap", label: "Heatmap" },
            { id: "context-switching", label: "Context Switching" },
            { id: "focus-pressure", label: "Focus Pressure" },
            { id: "load-drivers", label: "Load Drivers" },
        ],
    },
    {
        id: "landscape",
        areaId: "diagnose",
        basePath: "/landscape",
        param: "tab",
        defaultTabId: "overview",
        tabs: [
            { id: "overview", label: "Overview" },
            { id: "teams", label: "Teams" },
            { id: "repos", label: "Repos" },
            { id: "ownership", label: "Ownership" },
            { id: "hotspots", label: "Hotspots" },
        ],
    },
    {
        id: "investment",
        areaId: "diagnose",
        basePath: "/investment",
        param: "tab",
        defaultTabId: "overview",
        tabs: [
            { id: "overview", label: "Overview" },
            { id: "allocation", label: "Allocation" },
            { id: "evidence", label: CTA_LABELS.evidence },
            { id: "confidence", label: "Confidence" },
        ],
    },
    {
        id: "work-graph",
        areaId: "diagnose",
        basePath: "/diagnose/work-graph",
        param: "tab",
        defaultTabId: "overview",
        tabs: [
            { id: "overview", label: "Overview" },
            { id: "dependencies", label: "Dependencies" },
            { id: "inflow-outflow", label: "Inflow-Outflow" },
            { id: "review-network", label: "Review Network" },
            { id: "artifacts", label: "Artifacts" },
        ],
    },
    {
        id: "metrics",
        areaId: "diagnose",
        basePath: "/metrics",
        childPath: "/metrics?tab=flow",
        param: "tab",
        defaultTabId: "dora",
        explicitDefault: true,
        tabs: [
            { id: "dora", label: "DORA" },
            { id: "flow", label: "Flow" },
            { id: "throughput", label: "Throughput" },
        ],
    },
    {
        id: "ai-governance-risk",
        areaId: "ai",
        basePath: "/ai/risk",
        param: "view",
        defaultTabId: "overview",
        tabs: [
            { id: "overview", label: "Overview" },
            { id: "test-gaps", label: "Test Gaps" },
            { id: "evidence", label: CTA_LABELS.evidence },
        ],
    },
    {
        id: "testops",
        areaId: "govern",
        basePath: "/testops",
        param: "route",
        defaultTabId: "overview",
        tabs: [
            { id: "overview", label: "Overview", path: "/testops" },
            { id: "pipelines", label: "Pipelines", path: "/testops/pipelines" },
            { id: "tests", label: "Tests", path: "/testops/tests" },
            { id: "coverage", label: "Coverage", path: "/testops/coverage" },
        ],
    },
] as const satisfies readonly TabSet[];

export type TabSetId = (typeof TAB_SETS)[number]["id"];

/** The tab ids of one set, as a union (for a page's `activeTab` type). */
export type TabIdOf<S extends TabSetId> = Extract<
    (typeof TAB_SETS)[number],
    { id: S }
>["tabs"][number]["id"];

type TabSetOf<S extends TabSetId> = Extract<(typeof TAB_SETS)[number], { id: S }>;

// One entry per set, so `getTabSet("metrics")` has the literal type of that set (its tab ids are a
// union, not `string`). `satisfies` makes the compiler check that each key holds its own set.
const TAB_SET_BY_ID = {
    complexity: TAB_SETS[0],
    "cognitive-load": TAB_SETS[1],
    landscape: TAB_SETS[2],
    investment: TAB_SETS[3],
    "work-graph": TAB_SETS[4],
    metrics: TAB_SETS[5],
    "ai-governance-risk": TAB_SETS[6],
    testops: TAB_SETS[7],
} as const satisfies { [S in TabSetId]: TabSetOf<S> };

export function getTabSet<S extends TabSetId>(id: S): (typeof TAB_SET_BY_ID)[S] {
    return TAB_SET_BY_ID[id];
}

/** The link of a tab, without the user's state (`withFilterParam` adds it). */
export function tabHref(set: TabSet, tabId: string): string {
    if (set.param === "route") {
        const path = set.tabs.find((tab) => tab.id === tabId)?.path;
        if (!path) throw new Error(`Tab ${tabId} of ${set.id} has no route`);
        return path;
    }
    return tabId === set.defaultTabId && !set.explicitDefault
        ? set.basePath
        : `${set.basePath}?${set.param}=${encodeURIComponent(tabId)}`;
}
