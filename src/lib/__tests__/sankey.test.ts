import { describe, expect, it } from "vitest";

import {
  SANKEY_MODES,
  aggregateToMaxLevel,
  buildSankeyDataset,
  computeNodeLevels,
  getNodeDetails,
} from "@/lib/sankey";
import type { SankeyLink, SankeyNode } from "@/lib/types";

describe("buildSankeyDataset", () => {
  SANKEY_MODES.forEach((mode) => {
    it(`builds ${mode.id} with nodes and links`, () => {
      const dataset = buildSankeyDataset(mode.id);
      expect(dataset.nodes.length).toBeGreaterThan(0);
      expect(dataset.links.length).toBeGreaterThan(0);
      const names = dataset.nodes.map((node) => node.name);
      expect(new Set(names).size).toBe(names.length);
    });
  });

  it("builds state flow with issue, PR, and deployment nodes", () => {
    const dataset = buildSankeyDataset("state");
    const names = dataset.nodes.map((node) => node.name);
    expect(names).toContain("Issue Backlog");
    expect(names).toContain("PR Draft");
    expect(names).toContain("Deployment Build");
  });

  it("investment flow is aggregated to max 2 levels", () => {
    const dataset = buildSankeyDataset("investment");
    // Check that nodes have level info
    const levelsPresent = dataset.nodes.filter((n) => n.level !== undefined);
    expect(levelsPresent.length).toBe(dataset.nodes.length);
    // All nodes should be at level 1 or 2
    for (const node of dataset.nodes) {
      expect(node.level).toBeLessThanOrEqual(2);
    }
    // Should have collapsedMap for aggregated nodes
    expect(dataset.collapsedMap).toBeDefined();
    // Original data should be preserved for detail drill-down
    expect(dataset.originalNodes).toBeDefined();
    expect(dataset.originalLinks).toBeDefined();
  });
});

describe("computeNodeLevels", () => {
  it("assigns level 1 to root nodes (no incoming edges)", () => {
    const nodes: SankeyNode[] = [
      { name: "A" },
      { name: "B" },
      { name: "C" },
    ];
    const links: SankeyLink[] = [
      { source: "A", target: "B", value: 10 },
      { source: "B", target: "C", value: 10 },
    ];
    const levels = computeNodeLevels(nodes, links);
    expect(levels.get("A")).toBe(1);
    expect(levels.get("B")).toBe(2);
    expect(levels.get("C")).toBe(3);
  });

  it("handles multiple root nodes", () => {
    const nodes: SankeyNode[] = [
      { name: "A" },
      { name: "B" },
      { name: "C" },
    ];
    const links: SankeyLink[] = [
      { source: "A", target: "C", value: 10 },
      { source: "B", target: "C", value: 10 },
    ];
    const levels = computeNodeLevels(nodes, links);
    expect(levels.get("A")).toBe(1);
    expect(levels.get("B")).toBe(1);
    expect(levels.get("C")).toBe(2);
  });
});

describe("aggregateToMaxLevel", () => {
  it("collapses nodes beyond maxLevel into their ancestors", () => {
    const nodes: SankeyNode[] = [
      { name: "Root" },
      { name: "Mid" },
      { name: "Leaf1" },
      { name: "Leaf2" },
    ];
    const links: SankeyLink[] = [
      { source: "Root", target: "Mid", value: 20 },
      { source: "Mid", target: "Leaf1", value: 10 },
      { source: "Mid", target: "Leaf2", value: 10 },
    ];
    const result = aggregateToMaxLevel(nodes, links, 2);
    // Should only have Root and Mid nodes
    const names = result.nodes.map((n) => n.name);
    expect(names).toContain("Root");
    expect(names).toContain("Mid");
    expect(names).not.toContain("Leaf1");
    expect(names).not.toContain("Leaf2");
    // Collapsed children should be tracked
    expect(result.collapsedMap.get("Mid")).toContain("Leaf1");
    expect(result.collapsedMap.get("Mid")).toContain("Leaf2");
  });

  it("preserves links between non-collapsed nodes", () => {
    const nodes: SankeyNode[] = [
      { name: "A" },
      { name: "B" },
      { name: "C" },
    ];
    const links: SankeyLink[] = [
      { source: "A", target: "B", value: 15 },
      { source: "B", target: "C", value: 10 },
    ];
    const result = aggregateToMaxLevel(nodes, links, 2);
    // A->B link should be preserved
    const abLink = result.links.find(
      (l) => l.source === "A" && l.target === "B"
    );
    expect(abLink).toBeDefined();
    expect(abLink?.value).toBe(15);
  });
});

describe("getNodeDetails", () => {
  it("calculates node value and percentage", () => {
    const nodes: SankeyNode[] = [
      { name: "Source" },
      { name: "Target" },
    ];
    const links: SankeyLink[] = [
      { source: "Source", target: "Target", value: 100 },
    ];
    const details = getNodeDetails("Source", nodes, links);
    expect(details.name).toBe("Source");
    expect(details.value).toBe(100);
    expect(details.percentage).toBe(100);
  });

  it("includes collapsed children when available", () => {
    const nodes: SankeyNode[] = [
      { name: "Parent" },
      { name: "Child1" },
      { name: "Child2" },
    ];
    const links: SankeyLink[] = [
      { source: "Parent", target: "Child1", value: 60 },
      { source: "Parent", target: "Child2", value: 40 },
    ];
    const collapsedMap = new Map([["Parent", ["Child1", "Child2"]]]);
    const details = getNodeDetails("Parent", nodes, links, collapsedMap);
    expect(details.children.length).toBe(2);
    // Should be sorted by value descending
    expect(details.children[0].name).toBe("Child1");
    expect(details.children[0].value).toBe(60);
    expect(details.children[1].name).toBe("Child2");
    expect(details.children[1].value).toBe(40);
  });
});
