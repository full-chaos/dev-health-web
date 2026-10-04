// CHAOS-8584: the Allocation Sankey hover names a node as the page names it. ECharts hands the
// tooltip the chart's internal node KEY (the served node id, e.g. "THEME:feature_delivery"; see
// `buildSankeyAdapterData`), not the node's name. The hover resolves the key to its node, prints
// the name (a theme by the one label source, `allocationNodeLabel`: "Quality", never
// "Quality / Reliability" or "quality"), and reads every value by that node's name.
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

// No theme subscription in a unit test (jsdom has no matchMedia); colours are not under test.
vi.mock("@/components/charts/chartTheme", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/components/charts/chartTheme")>()),
    useChartTheme: () => ({}),
    useChartColors: () => [],
    useChartTokens: () => ({}),
}));

import { buildSankeyAdapterData } from "@/components/charts/SankeyChart";
import { adaptSankeyResult } from "@/lib/graphql/investmentFetchers";
import type { SankeyResult } from "@/lib/graphql/types";
import { computeSankeyMetrics } from "@/lib/sankey";
import type { SankeyNode, SankeyResponse } from "@/lib/types";
import { useInvestmentColorMaps } from "./useInvestmentColorMaps";

// The served shape: node ids are "<DIMENSION>:<label>", edges point at ids.
const served = (values: { fd: number; q: number; un: number }): SankeyResult => ({
    nodes: [
        { id: "TEAM:Platform", label: "Platform", dimension: "TEAM", value: values.fd + values.q },
        { id: "TEAM:unassigned", label: "unassigned", dimension: "TEAM", value: values.un },
        {
            id: "THEME:feature_delivery",
            label: "feature_delivery",
            dimension: "THEME",
            value: values.fd + values.un,
        },
        { id: "THEME:quality", label: "quality", dimension: "THEME", value: values.q },
        {
            id: "REPO:acme/api",
            label: "acme/api",
            dimension: "REPO",
            value: values.fd + values.q + values.un,
        },
    ],
    edges: [
        { source: "TEAM:Platform", target: "THEME:feature_delivery", value: values.fd },
        { source: "TEAM:Platform", target: "THEME:quality", value: values.q },
        { source: "TEAM:unassigned", target: "THEME:feature_delivery", value: values.un },
        { source: "THEME:feature_delivery", target: "REPO:acme/api", value: values.fd + values.un },
        { source: "THEME:quality", target: "REPO:acme/api", value: values.q },
    ],
});

const setup = (over: { baseline?: SankeyResult; legacyKeys?: boolean } = {}) => {
    const { result } = renderHook(() =>
        useInvestmentColorMaps({ investmentMix: null, workUnits: [], selectedThemeKey: null }),
    );
    const { prepareSankeyFlow, buildSankeyTooltipFormatter } = result.current;
    const prepare = (raw: SankeyResult) => {
        const adapted = adaptSankeyResult(raw, "investment");
        const flow: SankeyResponse = over.legacyKeys
            ? { ...adapted, nodes: adapted.nodes.map(({ id: _id, ...node }) => node) }
            : adapted;
        return prepareSankeyFlow(flow, 12)!;
    };
    const flow = prepare(served({ fd: 6, q: 2, un: 2 }));
    const baseline = over.baseline ? prepare(over.baseline) : null;
    // The node map as the sections build it: by node name.
    const nodeMap = new Map<string, SankeyNode>(flow.nodes.map((node) => [node.name, node]));
    const format = buildSankeyTooltipFormatter({
        nodeMap,
        metrics: computeSankeyMetrics(flow.nodes, flow.links),
        baselineFlow: baseline,
        baselineMetrics: baseline ? computeSankeyMetrics(baseline.nodes, baseline.links) : null,
        timeRange: {} as never,
        showBaselineDelta: Boolean(baseline),
    });
    // The keys the chart really gives ECharts (the producer of the tooltip's params).
    const { chartNodes, chartLinks } = buildSankeyAdapterData(flow.nodes, flow.links);
    // The tooltip's text, one space between its elements (the badge is its own element).
    const text = (html: string) => {
        const div = document.createElement("div");
        div.innerHTML = html;
        const parts: string[] = [];
        const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) parts.push(walker.currentNode.textContent ?? "");
        return parts.join(" ").replace(/\s+/g, " ").trim();
    };
    const hoverNode = (name: string) => {
        const index = flow.nodes.findIndex((node) => node.name === name);
        expect(index, name).toBeGreaterThanOrEqual(0);
        return text(format({ dataType: "node", data: chartNodes[index] }, "work units"));
    };
    const hoverLink = (source: string, target: string) => {
        const index = flow.links.findIndex(
            (link) => link.source === source && link.target === target,
        );
        expect(index, `${source} -> ${target}`).toBeGreaterThanOrEqual(0);
        return text(format({ dataType: "edge", data: chartLinks[index] }, "work units"));
    };
    return { chartNodes, hoverNode, hoverLink };
};

describe("Allocation Sankey hover (CHAOS-8584): names, not chart keys", () => {
    it("the chart gives the tooltip the served node id, not the name (the case this pins)", () => {
        const { chartNodes } = setup();
        expect(chartNodes.map((node) => node.name)).toContain("THEME:feature_delivery");
    });

    it("titles a theme node by the one short label source", () => {
        const { hoverNode } = setup();
        expect(hoverNode("feature_delivery")).toMatch(/^Feature Delivery Theme Total allocated/u);
        expect(hoverNode("quality")).toMatch(/^Quality Theme Total allocated/u);
        for (const shown of [hoverNode("feature_delivery"), hoverNode("quality")]) {
            expect(shown).not.toMatch(/THEME:|feature_delivery|Reliability/u);
        }
    });

    it("titles a team and a repo node by their names, with no key prefix", () => {
        const { hoverNode } = setup();
        expect(hoverNode("Platform")).toMatch(/^Platform Team Total allocated/u);
        expect(hoverNode("acme/api")).toMatch(/^acme\/api Repo Total allocated/u);
        expect(hoverNode("Platform") + hoverNode("acme/api")).not.toMatch(/TEAM:|REPO:/u);
    });

    it("names both ends of a link, theme by the short label", () => {
        const { hoverLink } = setup();
        const teamToTheme = hoverLink("Platform", "quality");
        expect(teamToTheme).toContain("From: Platform (Team)");
        expect(teamToTheme).toContain("To: Quality (Theme)");
        const themeToRepo = hoverLink("feature_delivery", "acme/api");
        expect(themeToRepo).toContain("From: Feature Delivery (Theme)");
        expect(themeToRepo).toContain("To: acme/api (Repo)");
        expect(teamToTheme + themeToRepo).not.toMatch(/TEAM:|THEME:|REPO:|_/u);
    });

    it("keeps the unassigned note on the unassigned team node and its links", () => {
        const { hoverNode, hoverLink } = setup();
        expect(hoverNode("Unassigned team")).toMatch(/^Unassigned team Team Total allocated/u);
        expect(hoverNode("Unassigned team")).toContain("Missing team attribution in source data");
        expect(hoverLink("Unassigned team", "feature_delivery")).toContain(
            "Missing team attribution in source data",
        );
    });

    it("reads the baseline share of a node and a link by the node's name", () => {
        // Baseline: Platform -> quality 4 of a total of 10 (4 + 4 + 2 at the roots).
        const { hoverNode, hoverLink } = setup({ baseline: served({ fd: 4, q: 4, un: 2 }) });
        // Current: quality 2 of 10 = 20%; baseline 4 of 10 = 40%.
        const node = hoverNode("quality");
        expect(node).toContain("Current allocation share: 20%");
        expect(node).toContain("Baseline allocation share: 40%");
        expect(node).toContain("Delta: ↓ -20%");
        const link = hoverLink("Platform", "quality");
        expect(link).toContain("Baseline allocation share: 40%");
        expect(link).toContain("Delta: ↓ -20%");
    });

    it("resolves the legacy group:name key the same way (a flow with no node ids)", () => {
        const { chartNodes, hoverNode, hoverLink } = setup({ legacyKeys: true });
        expect(chartNodes.map((node) => node.name)).toContain("category:quality");
        expect(hoverNode("quality")).toMatch(/^Quality Theme Total allocated/u);
        expect(hoverLink("Platform", "quality")).toContain("To: Quality (Theme)");
    });
});
