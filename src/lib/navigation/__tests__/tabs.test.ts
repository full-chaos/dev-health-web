import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { getAreaById, isNavChildVisible } from "../areas";
import { CTA_LABELS } from "@/lib/design/cta";
import { METRIC_TABS } from "@/lib/metrics/metricTabs";

import { TAB_SETS, getTabSet, tabHref, type TabSet } from "../tabs";

// The sets as the general type: loops over every set do not depend on each set's literal type.
const SETS: readonly TabSet[] = TAB_SETS;

// The tab lists the two pages carried inline before the registry: the registry must say exactly this
// (same ids, same labels, same order). This is the pin that used to be the page source text.
const BEFORE = {
    complexity: [
        ["overview", "Overview"],
        ["flame", "Flame"],
        ["hotspots", "Hotspots"],
        ["ownership-risk", "Ownership Risk"],
        ["churn", "Churn"],
    ],
    "cognitive-load": [
        ["overview", "Overview"],
        ["heatmap", "Heatmap"],
        ["context-switching", "Context Switching"],
        ["focus-pressure", "Focus Pressure"],
        ["load-drivers", "Load Drivers"],
    ],
    landscape: [
        ["overview", "Overview"],
        ["teams", "Teams"],
        ["repos", "Repos"],
        ["ownership", "Ownership"],
        ["hotspots", "Hotspots"],
    ],
    investment: [
        ["overview", "Overview"],
        ["allocation", "Allocation"],
        ["evidence", "Evidence"],
        ["confidence", "Confidence"],
    ],
    metrics: [
        ["dora", "DORA"],
        ["flow", "Flow"],
        ["throughput", "Throughput"],
    ],
    "ai-governance-risk": [
        ["overview", "Overview"],
        ["test-gaps", "Test Gaps"],
        ["evidence", "Evidence"],
    ],
    testops: [
        ["overview", "Overview"],
        ["pipelines", "Pipelines"],
        ["tests", "Tests"],
        ["coverage", "Coverage"],
    ],
    "work-graph": [
        ["overview", "Overview"],
        ["dependencies", "Dependencies"],
        ["inflow-outflow", "Inflow-Outflow"],
        ["review-network", "Review Network"],
        ["artifacts", "Artifacts"],
    ],
} as const;

describe("tab registry", () => {
    it.each(Object.entries(BEFORE))(
        "holds the %s tabs exactly as the page listed them",
        (id, tabs) => {
            const set: TabSet = getTabSet(id as keyof typeof BEFORE);
            expect(set.tabs.map((tab) => [tab.id, tab.label])).toEqual(tabs);
        },
    );

    it("has unique set ids and unique tab ids per set, and a default tab that exists", () => {
        expect(new Set(SETS.map((s) => s.id)).size).toBe(SETS.length);
        for (const set of SETS) {
            const ids = set.tabs.map((t) => t.id);
            expect(new Set(ids).size, set.id).toBe(ids.length);
            expect(ids, set.id).toContain(set.defaultTabId);
        }
    });

    it("builds the default tab without a query value and the others with the parameter", () => {
        const set = getTabSet("complexity");
        expect(tabHref(set, "overview")).toBe("/complexity");
        expect(tabHref(set, "flame")).toBe("/complexity?tab=flame");
        expect(tabHref(set, "ownership-risk")).toBe("/complexity?tab=ownership-risk");
        expect(tabHref(getTabSet("cognitive-load"), "load-drivers")).toBe(
            "/cognitive-load?tab=load-drivers",
        );
        expect(tabHref(getTabSet("landscape"), "teams")).toBe("/landscape?tab=teams");
        expect(tabHref(getTabSet("investment"), "overview")).toBe("/investment");
        expect(tabHref(getTabSet("work-graph"), "inflow-outflow")).toBe(
            "/diagnose/work-graph?tab=inflow-outflow",
        );
        // Metrics always linked its default tab with the parameter; TestOps tabs are routes.
        expect(tabHref(getTabSet("metrics"), "dora")).toBe("/metrics?tab=dora");
        expect(tabHref(getTabSet("metrics"), "throughput")).toBe("/metrics?tab=throughput");
        // The Governance Risk subviews use `view`, not `tab`; the e2e spec pins the "Evidence" link name.
        expect(tabHref(getTabSet("ai-governance-risk"), "overview")).toBe("/ai/risk");
        expect(tabHref(getTabSet("ai-governance-risk"), "test-gaps")).toBe(
            "/ai/risk?view=test-gaps",
        );
        expect(tabHref(getTabSet("ai-governance-risk"), "evidence")).toBe("/ai/risk?view=evidence");
        expect(CTA_LABELS.evidence).toBe("Evidence");
        expect(tabHref(getTabSet("testops"), "overview")).toBe("/testops");
        expect(tabHref(getTabSet("testops"), "coverage")).toBe("/testops/coverage");
    });

    it("names a destination the sidebar lists: every set's destination path is a visible navAreas child", () => {
        for (const set of SETS) {
            const child = getAreaById(set.areaId)?.children.find(
                (c) => c.path === (set.childPath ?? set.basePath),
            );
            expect(child, set.id).toBeDefined();
            expect(isNavChildVisible(child!, {}), set.id).toBe(true);
        }
    });

    const PAGE_FILE = {
        complexity: "app/(app)/complexity/page.tsx",
        "cognitive-load": "app/(app)/cognitive-load/page.tsx",
        landscape: "app/(app)/landscape/page.tsx",
        investment: "app/(app)/investment/page.tsx",
        "work-graph": "app/(app)/diagnose/work-graph/buildTabs.ts",
        metrics: "app/(app)/metrics/page.tsx",
        "ai-governance-risk": "components/ai/AIGovernanceRiskTabs.tsx",
        testops: "app/(app)/testops/TestOpsTabs.tsx",
    } as const;

    it("route sets give every tab its own route, query sets give none", () => {
        for (const set of SETS) {
            for (const tab of set.tabs) {
                expect("path" in tab && Boolean(tab.path), `${set.id}/${tab.id}`).toBe(
                    set.param === "route",
                );
            }
        }
    });

    it("the Metrics data is keyed by exactly the registry's tab ids, in registry order", () => {
        expect(METRIC_TABS.map((tab) => tab.id)).toEqual(
            getTabSet("metrics").tabs.map((tab) => tab.id),
        );
        for (const tab of METRIC_TABS) {
            expect(tab.metrics.length, tab.id).toBeGreaterThan(0);
            expect(tab.highlight, tab.id).toBeTruthy();
        }
    });

    it.each(Object.keys(PAGE_FILE) as Array<keyof typeof PAGE_FILE>)(
        "%s renders its tabs from the registry and holds no inline list",
        (page) => {
            const source = readFileSync(join(process.cwd(), "src", PAGE_FILE[page]), "utf8");
            expect(source).toContain(`getTabSet("${page}")`);
            expect(source).toMatch(/tabHref\((tabSet|\w+Tabs|set), (tab\.id|id)\)/);
            // No tab literal of the old inline list is left in the page.
            for (const [id, label] of BEFORE[page]) {
                expect(source).not.toContain(`id: "${id}"`);
                expect(source).not.toContain(`label: "${label}"`);
            }
        },
    );
});
