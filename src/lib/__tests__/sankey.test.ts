import { beforeAll, describe, expect, it } from "vitest";

import { decodeFilter } from "@/lib/filters/encode";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import type { MetricFilter } from "@/lib/filters/types";
import {
  SANKEY_MODES,
  buildSankeyDataset,
  buildSankeyEvidenceUrl,
  computeSankeyMetrics,
  filterSankeyToTeam,
  getSankeyDefinition,
  limitRepoNodes,
  registerSankeyDemoData,
} from "@/lib/sankey";
import {
  sankeyExpenseLinks,
  sankeyExpenseNodes,
  sankeyHotspotLinks,
  sankeyHotspotNodes,
  sankeyInvestmentLinks,
  sankeyInvestmentNodes,
  sankeyStateTransitionSample,
} from "@/data/devHealthOpsSample";
import type { SankeyLink, SankeyNode } from "@/lib/types";

beforeAll(() => {
  registerSankeyDemoData({
    investmentNodes: sankeyInvestmentNodes,
    investmentLinks: sankeyInvestmentLinks,
    expenseNodes: sankeyExpenseNodes,
    expenseLinks: sankeyExpenseLinks,
    hotspotNodes: sankeyHotspotNodes,
    hotspotLinks: sankeyHotspotLinks,
    stateTransitions: sankeyStateTransitionSample,
  });
});
describe("SANKEY_MODES", () => {
  it("declares every required mode with label/description/unit", () => {
    const ids = SANKEY_MODES.map((m) => m.id).sort();
    expect(ids).toEqual(["expense", "hotspot", "investment", "state"]);
    SANKEY_MODES.forEach((mode) => {
      expect(mode.label.length).toBeGreaterThan(0);
      expect(mode.description.length).toBeGreaterThan(0);
      expect(mode.unit.length).toBeGreaterThan(0);
    });
  });
});

describe("getSankeyDefinition", () => {
  it("returns the matching definition for a known mode", () => {
    const def = getSankeyDefinition("investment");
    expect(def.id).toBe("investment");
    expect(def.label).toBe("Investment flow");
    expect(def.unit).toBe("items");
  });

  it("returns the first mode as a fallback for an unknown mode", () => {
    const def = getSankeyDefinition(
      "does-not-exist" as unknown as (typeof SANKEY_MODES)[number]["id"],
    );
    expect(def).toBe(SANKEY_MODES[0]);
  });

  it("returns the state mode with expected metadata", () => {
    const def = getSankeyDefinition("state");
    expect(def.id).toBe("state");
    expect(def.label).toBe("State flow");
  });
});

describe("buildSankeyDataset", () => {
  SANKEY_MODES.forEach((mode) => {
    it(`builds ${mode.id} with unique, non-empty nodes and links`, () => {
      const dataset = buildSankeyDataset(mode.id);
      expect(dataset.mode).toBe(mode.id);
      expect(dataset.label).toBe(mode.label);
      expect(dataset.description).toBe(mode.description);
      expect(dataset.unit).toBe(mode.unit);
      expect(dataset.nodes.length).toBeGreaterThan(0);
      expect(dataset.links.length).toBeGreaterThan(0);
      const names = dataset.nodes.map((node) => node.name);
      expect(new Set(names).size).toBe(names.length);
    });
  });

  it("includes expected state-flow node names", () => {
    const dataset = buildSankeyDataset("state");
    const names = dataset.nodes.map((node) => node.name);
    expect(names).toContain("Issue Backlog");
    expect(names).toContain("PR Draft");
    expect(names).toContain("Deployment Build");
  });

  it("tags state-flow nodes with group='state'", () => {
    const dataset = buildSankeyDataset("state");
    expect(dataset.nodes.every((n) => n.group === "state")).toBe(true);
  });

  it("all link endpoints refer to existing node names", () => {
    SANKEY_MODES.forEach((mode) => {
      const dataset = buildSankeyDataset(mode.id);
      const names = new Set(dataset.nodes.map((n) => n.name));
      dataset.links.forEach((link) => {
        expect(names.has(link.source)).toBe(true);
        expect(names.has(link.target)).toBe(true);
      });
    });
  });
});

describe("buildSankeyEvidenceUrl", () => {
  const filters: MetricFilter = defaultMetricFilter;

  it("returns a path that starts with /explore and encodes the metric", () => {
    const url = buildSankeyEvidenceUrl({ mode: "investment", filters });
    expect(url.startsWith("/explore?")).toBe(true);
    const query = new URLSearchParams(url.slice("/explore?".length));
    expect(query.get("metric")).toBe("throughput");
    expect(query.get("api")).toBe("/api/v1/drilldown/issues");
    expect(query.has("f")).toBe(true);
  });

  it("uses the PR drilldown API when label contains 'pr'", () => {
    const url = buildSankeyEvidenceUrl({
      mode: "investment",
      filters,
      label: "PR authors",
    });
    const query = new URLSearchParams(url.slice("/explore?".length));
    expect(query.get("api")).toBe("/api/v1/drilldown/prs");
  });

  it("uses the issues drilldown API when label contains 'issue'", () => {
    const url = buildSankeyEvidenceUrl({
      mode: "hotspot",
      filters,
      label: "issue tickets",
    });
    const query = new URLSearchParams(url.slice("/explore?".length));
    expect(query.get("api")).toBe("/api/v1/drilldown/issues");
  });

  it("falls back to the default API per mode when label does not match PR/issue", () => {
    const hotspotUrl = buildSankeyEvidenceUrl({
      mode: "hotspot",
      filters,
      label: "some other label",
    });
    const hq = new URLSearchParams(hotspotUrl.slice("/explore?".length));
    expect(hq.get("api")).toBe("/api/v1/drilldown/prs");

    const expenseUrl = buildSankeyEvidenceUrl({
      mode: "expense",
      filters,
    });
    const eq = new URLSearchParams(expenseUrl.slice("/explore?".length));
    expect(eq.get("api")).toBe("/api/v1/drilldown/issues");
  });

  it("includes category and breakdown when label and linkLabel are provided", () => {
    const url = buildSankeyEvidenceUrl({
      mode: "state",
      filters,
      label: "Review",
      linkLabel: "Approved",
    });
    const q = new URLSearchParams(url.slice("/explore?".length));
    expect(q.get("category")).toBe("Review");
    expect(q.get("breakdown")).toBe("Approved");
  });

  it("omits category when label is null or undefined", () => {
    const urlUndef = buildSankeyEvidenceUrl({ mode: "state", filters });
    const urlNull = buildSankeyEvidenceUrl({
      mode: "state",
      filters,
      label: null,
      linkLabel: null,
    });
    expect(new URLSearchParams(urlUndef.slice("/explore?".length)).has("category")).toBe(false);
    expect(new URLSearchParams(urlNull.slice("/explore?".length)).has("category")).toBe(false);
    expect(new URLSearchParams(urlNull.slice("/explore?".length)).has("breakdown")).toBe(false);
  });

  it("applies a window to filters when window_start and window_end are provided", () => {
    const url = buildSankeyEvidenceUrl({
      mode: "investment",
      filters,
      window_start: "2024-01-01",
      window_end: "2024-01-08",
    });
    const q = new URLSearchParams(url.slice("/explore?".length));
    const decoded = decodeFilter(q.get("f"));
    expect(decoded.time.start_date).toBe("2024-01-01");
    expect(decoded.time.end_date).toBe("2024-01-08");
    expect(decoded.time.range_days).toBe(7);
  });

  it("leaves filters untouched when no window is provided", () => {
    const url = buildSankeyEvidenceUrl({ mode: "investment", filters });
    const q = new URLSearchParams(url.slice("/explore?".length));
    const decoded = decodeFilter(q.get("f"));
    expect(decoded.time.start_date).toBeUndefined();
    expect(decoded.time.end_date).toBeUndefined();
    expect(decoded.time.range_days).toBe(defaultMetricFilter.time.range_days);
  });

  it("uses the correct default metric per mode", () => {
    const cases: Array<{
      mode: Parameters<typeof buildSankeyEvidenceUrl>[0]["mode"];
      metric: string;
    }> = [
      { mode: "investment", metric: "throughput" },
      { mode: "expense", metric: "churn" },
      { mode: "state", metric: "cycle_time" },
      { mode: "hotspot", metric: "churn" },
    ];
    cases.forEach(({ mode, metric }) => {
      const url = buildSankeyEvidenceUrl({ mode, filters });
      const q = new URLSearchParams(url.slice("/explore?".length));
      expect(q.get("metric")).toBe(metric);
    });
  });
});

describe("computeSankeyMetrics", () => {
  it("returns zero totals for empty input", () => {
    const result = computeSankeyMetrics([], []);
    expect(result.incomingTotals.size).toBe(0);
    expect(result.outgoingTotals.size).toBe(0);
    expect(result.nodeValueByName.size).toBe(0);
    expect(result.totalFlow).toBe(0);
  });

  it("computes incoming, outgoing, and nodeValueByName for a simple chain A → B → C", () => {
    const nodes: SankeyNode[] = [{ name: "A" }, { name: "B" }, { name: "C" }];
    const links: SankeyLink[] = [
      { source: "A", target: "B", value: 10 },
      { source: "B", target: "C", value: 10 },
    ];
    const { incomingTotals, outgoingTotals, nodeValueByName, totalFlow } = computeSankeyMetrics(
      nodes,
      links,
    );

    expect(incomingTotals.get("A")).toBeUndefined();
    expect(incomingTotals.get("B")).toBe(10);
    expect(incomingTotals.get("C")).toBe(10);
    expect(outgoingTotals.get("A")).toBe(10);
    expect(outgoingTotals.get("B")).toBe(10);
    expect(outgoingTotals.get("C")).toBeUndefined();
    expect(nodeValueByName.get("A")).toBe(10);
    expect(nodeValueByName.get("B")).toBe(10);
    expect(nodeValueByName.get("C")).toBe(10);

    expect(totalFlow).toBe(10);
  });

  it("computes totals for a branching structure", () => {
    const nodes: SankeyNode[] = [{ name: "Root" }, { name: "Left" }, { name: "Right" }];
    const links: SankeyLink[] = [
      { source: "Root", target: "Left", value: 3 },
      { source: "Root", target: "Right", value: 7 },
    ];
    const result = computeSankeyMetrics(nodes, links);
    expect(result.outgoingTotals.get("Root")).toBe(10);
    expect(result.incomingTotals.get("Left")).toBe(3);
    expect(result.incomingTotals.get("Right")).toBe(7);
    expect(result.nodeValueByName.get("Root")).toBe(10);
    expect(result.totalFlow).toBe(10);
  });

  it("sums parallel edges between the same pair", () => {
    const nodes: SankeyNode[] = [{ name: "A" }, { name: "B" }];
    const links: SankeyLink[] = [
      { source: "A", target: "B", value: 2 },
      { source: "A", target: "B", value: 5 },
    ];
    const { incomingTotals, outgoingTotals, totalFlow } = computeSankeyMetrics(nodes, links);
    expect(outgoingTotals.get("A")).toBe(7);
    expect(incomingTotals.get("B")).toBe(7);
    expect(totalFlow).toBe(7);
  });

  it("falls back to summing all link values when no root node exists", () => {
    const nodes: SankeyNode[] = [{ name: "A" }, { name: "B" }];
    const links: SankeyLink[] = [
      { source: "A", target: "B", value: 4 },
      { source: "B", target: "A", value: 1 },
    ];
    const { totalFlow } = computeSankeyMetrics(nodes, links);
    expect(totalFlow).toBe(5);
  });
});

describe("limitRepoNodes", () => {
  const buildFlow = () => ({
    nodes: [
      { name: "cat:Initiative", group: "category" } as SankeyNode,
      { name: "repo:alpha", group: "repo" } as SankeyNode,
      { name: "repo:beta", group: "repo" } as SankeyNode,
      { name: "repo:gamma", group: "repo" } as SankeyNode,
      { name: "repo:delta", group: "repo" } as SankeyNode,
    ],
    links: [
      { source: "cat:Initiative", target: "repo:alpha", value: 50 } as SankeyLink,
      { source: "cat:Initiative", target: "repo:beta", value: 30 } as SankeyLink,
      { source: "cat:Initiative", target: "repo:gamma", value: 15 } as SankeyLink,
      { source: "cat:Initiative", target: "repo:delta", value: 5 } as SankeyLink,
    ],
  });

  it("returns the flow unchanged when repo count is at or below topN", () => {
    const flow = buildFlow();
    const unchanged = limitRepoNodes(flow, 10);
    expect(unchanged).toBe(flow);
    const atThreshold = limitRepoNodes(flow, 4);
    expect(atThreshold).toBe(flow);
  });

  it("keeps the top N repos by value and aggregates the rest under 'Other repos'", () => {
    const flow = buildFlow();
    const limited = limitRepoNodes(flow, 2);
    const names = limited.nodes.map((n) => n.name);
    expect(names).toContain("repo:alpha");
    expect(names).toContain("repo:beta");
    expect(names).not.toContain("repo:gamma");
    expect(names).not.toContain("repo:delta");
    expect(names).toContain("repo:Other repos");

    const otherLink = limited.links.find((l) => l.target === "repo:Other repos");
    expect(otherLink?.value).toBe(20);
  });

  it("keeps non-repo nodes untouched", () => {
    const flow = buildFlow();
    const limited = limitRepoNodes(flow, 1);
    expect(limited.nodes.find((n) => n.name === "cat:Initiative")).toBeDefined();
  });

  it("uses a custom otherReposLabel when provided", () => {
    const flow = buildFlow();
    const limited = limitRepoNodes(flow, 2, "More repos");
    const names = limited.nodes.map((n) => n.name);
    expect(names).toContain("repo:More repos");
    expect(names).not.toContain("repo:Other repos");
  });

  it("orders repos by total value descending, ties broken alphabetically", () => {
    const flow = {
      nodes: [
        { name: "cat:x", group: "category" } as SankeyNode,
        { name: "repo:b", group: "repo" } as SankeyNode,
        { name: "repo:a", group: "repo" } as SankeyNode,
        { name: "repo:c", group: "repo" } as SankeyNode,
      ],
      links: [
        { source: "cat:x", target: "repo:a", value: 10 } as SankeyLink,
        { source: "cat:x", target: "repo:b", value: 10 } as SankeyLink,
        { source: "cat:x", target: "repo:c", value: 1 } as SankeyLink,
      ],
    };
    const limited = limitRepoNodes(flow, 2);
    const repoNames = limited.nodes
      .filter((n) => n.group === "repo" && n.name !== "repo:Other repos")
      .map((n) => n.name);
    expect(repoNames).toEqual(["repo:a", "repo:b"]);
  });

  it("drops links whose endpoints no longer exist after limiting", () => {
    const flow = buildFlow();
    const limited = limitRepoNodes(flow, 2);
    const nodeNames = new Set(limited.nodes.map((n) => n.name));
    limited.links.forEach((link) => {
      expect(nodeNames.has(link.source)).toBe(true);
      expect(nodeNames.has(link.target)).toBe(true);
    });
  });

  it("deduplicates node names in the resulting nodes array", () => {
    const flow = buildFlow();
    const limited = limitRepoNodes(flow, 2);
    const names = limited.nodes.map((n) => n.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("filterSankeyToTeam", () => {
  const flow = {
    nodes: [
      { name: "team:platform", group: "team" } as SankeyNode,
      { name: "team:data", group: "team" } as SankeyNode,
      { name: "repo:platform-api", group: "repo" } as SankeyNode,
      { name: "repo:data-pipeline", group: "repo" } as SankeyNode,
      { name: "cat:work", group: "category" } as SankeyNode,
    ],
    links: [
      { source: "team:platform", target: "repo:platform-api", value: 5 } as SankeyLink,
      { source: "team:data", target: "repo:data-pipeline", value: 3 } as SankeyLink,
      { source: "repo:platform-api", target: "cat:work", value: 5 } as SankeyLink,
      { source: "repo:data-pipeline", target: "cat:work", value: 3 } as SankeyLink,
    ],
  };

  it("returns null when given a null flow", () => {
    expect(filterSankeyToTeam(null, "platform")).toBeNull();
  });

  it("returns the flow unchanged when teamName is null", () => {
    const result = filterSankeyToTeam(flow, null);
    expect(result).toBe(flow);
  });

  it("returns the flow unchanged when no matching team node is found", () => {
    const result = filterSankeyToTeam(flow, "does-not-exist");
    expect(result).toBe(flow);
  });

  it("filters to nodes and links reachable from the team (prefixed name)", () => {
    const result = filterSankeyToTeam(flow, "platform");
    expect(result).not.toBeNull();
    const names = result!.nodes.map((n) => n.name).sort();
    expect(names).toEqual(["cat:work", "repo:platform-api", "team:platform"].sort());
    result!.links.forEach((link) => {
      expect(names).toContain(link.source);
      expect(names).toContain(link.target);
    });
  });

  it("accepts a team name that matches a node without the 'team:' prefix", () => {
    const unprefixedFlow = {
      nodes: [
        { name: "alpha", group: "team" } as SankeyNode,
        { name: "repo:one", group: "repo" } as SankeyNode,
      ],
      links: [{ source: "alpha", target: "repo:one", value: 1 } as SankeyLink],
    };
    const result = filterSankeyToTeam(unprefixedFlow, "alpha");
    expect(result).not.toBeNull();
    expect(result!.nodes.map((n) => n.name).sort()).toEqual(["alpha", "repo:one"]);
  });

  it("excludes nodes that are unreachable from the chosen team", () => {
    const result = filterSankeyToTeam(flow, "platform");
    const names = result!.nodes.map((n) => n.name);
    expect(names).not.toContain("team:data");
    expect(names).not.toContain("repo:data-pipeline");
  });

  it("follows transitive edges (BFS) to include multi-hop neighbors", () => {
    const layered = {
      nodes: [
        { name: "team:x", group: "team" } as SankeyNode,
        { name: "mid", group: "category" } as SankeyNode,
        { name: "leaf", group: "repo" } as SankeyNode,
      ],
      links: [
        { source: "team:x", target: "mid", value: 2 } as SankeyLink,
        { source: "mid", target: "leaf", value: 2 } as SankeyLink,
      ],
    };
    const result = filterSankeyToTeam(layered, "x");
    expect(result!.nodes.map((n) => n.name).sort()).toEqual(["leaf", "mid", "team:x"]);
  });
});
