import { describe, expect, it } from "vitest";

import {
  applyChordDirection,
  buildChordDataset,
  buildChordMatrix,
  computeChordSummary,
  limitChordNodesTopN,
  normalizeChordRecords,
} from "@/lib/chord";
import type { ChordRecord } from "@/lib/types";

const edge = (source: string, target: string, value: number): ChordRecord => ({
  source,
  target,
  value,
});

describe("normalizeChordRecords", () => {
  it("sums duplicate (source, target) pairs and preserves first-seen metadata", () => {
    const result = normalizeChordRecords([
      { source: "A", target: "B", value: 3, metadata: { team: "alpha" } },
      { source: "A", target: "B", value: 7, metadata: { team: "beta" } },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      source: "A",
      target: "B",
      value: 10,
      metadata: { team: "alpha" },
    });
  });

  it("drops self-links by default but retains them when includeSelfLinks is true", () => {
    const records: ChordRecord[] = [edge("A", "A", 5), edge("A", "B", 2)];
    expect(normalizeChordRecords(records)).toEqual([edge("A", "B", 2)]);
    const keep = normalizeChordRecords(records, { includeSelfLinks: true });
    expect(keep).toHaveLength(2);
    expect(keep).toContainEqual(edge("A", "A", 5));
  });

  it("drops edges with value <= 0", () => {
    const result = normalizeChordRecords([
      edge("A", "B", 0),
      edge("A", "C", -1),
      edge("A", "D", 1),
    ]);
    expect(result).toEqual([edge("A", "D", 1)]);
  });

  it("does not mutate the input array", () => {
    const records: ChordRecord[] = [edge("A", "B", 1), edge("A", "B", 2)];
    const snapshot = JSON.parse(JSON.stringify(records));
    normalizeChordRecords(records);
    expect(records).toEqual(snapshot);
  });
});

describe("buildChordMatrix", () => {
  it("returns empty nodes + matrix on empty input", () => {
    expect(buildChordMatrix([])).toEqual({ nodes: [], matrix: [] });
  });

  it("sorts nodes by (row_sum + col_sum) desc and builds an N×N matrix", () => {
    const records = [
      edge("A", "B", 5),
      edge("B", "A", 1),
      edge("C", "A", 2),
    ];
    const { nodes, matrix } = buildChordMatrix(records);
    expect(nodes.map((n) => n.id)).toEqual(["A", "B", "C"]);
    expect(matrix).toEqual([
      [0, 5, 0],
      [1, 0, 0],
      [2, 0, 0],
    ]);
  });

  it("applies stable lexicographic tie-break on equal magnitudes", () => {
    const records = [edge("z-team", "a-team", 4), edge("a-team", "z-team", 4)];
    const { nodes } = buildChordMatrix(records);
    expect(nodes.map((n) => n.id)).toEqual(["a-team", "z-team"]);
  });
});

describe("limitChordNodesTopN", () => {
  it("returns inputs unchanged (with otherShare: 0) when N <= topN", () => {
    const records = [edge("A", "B", 5), edge("C", "D", 3), edge("E", "A", 2)];
    const { nodes, matrix } = buildChordMatrix(records);
    const limited = limitChordNodesTopN(nodes, matrix, 8);
    expect(limited.otherShare).toBe(0);
    expect(limited.nodes).toEqual(nodes);
    expect(limited.matrix).toEqual(matrix);
    expect(limited.nodes.some((n) => n.isOther)).toBe(false);
  });

  it("aggregates overflow into a single Other bucket appended at the end", () => {
    const records: ChordRecord[] = [];
    for (let i = 0; i < 10; i++) {
      records.push(edge(`hub-${i}`, `sink-${i}`, 10 - i));
    }
    const { nodes, matrix } = buildChordMatrix(records);
    const limited = limitChordNodesTopN(nodes, matrix, 5, { otherLabel: "Other" });
    expect(limited.nodes.length).toBe(5);
    expect(limited.nodes[limited.nodes.length - 1]).toMatchObject({
      id: "__other__",
      label: "Other",
      isOther: true,
    });
    expect(limited.otherShare).toBeGreaterThan(0);
    expect(limited.otherShare).toBeLessThan(1);
  });

  it("honors a custom otherLabel", () => {
    const records = [
      edge("A", "B", 1),
      edge("C", "D", 1),
      edge("E", "F", 1),
    ];
    const { nodes, matrix } = buildChordMatrix(records);
    const limited = limitChordNodesTopN(nodes, matrix, 3, { otherLabel: "Rest" });
    expect(limited.nodes[limited.nodes.length - 1].label).toBe("Rest");
  });
});

describe("applyChordDirection", () => {
  const matrix = [
    [0, 3, 1],
    [2, 0, 4],
    [0, 5, 0],
  ];

  it("bilateral symmetrizes with i↔j sum", () => {
    expect(applyChordDirection(matrix, "bilateral")).toEqual([
      [0, 5, 1],
      [5, 0, 9],
      [1, 9, 0],
    ]);
  });

  it("in takes the transpose", () => {
    expect(applyChordDirection(matrix, "in")).toEqual([
      [0, 2, 0],
      [3, 0, 5],
      [1, 4, 0],
    ]);
  });

  it("out returns the matrix unchanged (but as a fresh copy)", () => {
    const out = applyChordDirection(matrix, "out");
    expect(out).toEqual(matrix);
    expect(out).not.toBe(matrix);
  });

  it("net clamps m[i][j] - m[j][i] at zero", () => {
    expect(applyChordDirection(matrix, "net")).toEqual([
      [0, 1, 1],
      [0, 0, 0],
      [0, 1, 0],
    ]);
  });
});

describe("computeChordSummary", () => {
  it("places a pure importer in topImporters (net > 0) and excludes it from topExporters", () => {
    const records = [
      edge("A", "C", 50),
      edge("B", "C", 50),
      edge("C", "A", 10),
    ];
    const { nodes, matrix } = buildChordMatrix(records);
    const summary = computeChordSummary(nodes, matrix);
    const importerIds = summary.topImporters.map((e) => e.id);
    const exporterIds = summary.topExporters.map((e) => e.id);
    expect(importerIds).toContain("C");
    const c = summary.topImporters.find((e) => e.id === "C");
    expect(c?.net).toBe(90);
    expect(exporterIds).not.toContain("C");
  });

  it("ranks strongest bilateral pairs by (m[i][j] + m[j][i]) desc, excluding self-pairs", () => {
    const records = [
      edge("A", "B", 5),
      edge("B", "A", 5),
      edge("A", "C", 1),
    ];
    const { nodes, matrix } = buildChordMatrix(records);
    const summary = computeChordSummary(nodes, matrix);
    expect(summary.strongestBilateral[0]).toMatchObject({
      bilateralValue: 10,
    });
    const first = summary.strongestBilateral[0];
    expect([first.a, first.b].sort()).toEqual(["A", "B"]);
  });

  it("returns empty arrays and otherShare=0 for an empty input", () => {
    expect(computeChordSummary([], [])).toEqual({
      topImporters: [],
      topExporters: [],
      strongestBilateral: [],
      otherShare: 0,
    });
  });
});

describe("buildChordDataset", () => {
  it("produces an empty dataset for empty input", () => {
    const dataset = buildChordDataset([], { grouping: "team" });
    expect(dataset.nodes).toEqual([]);
    expect(dataset.matrix).toEqual([]);
    expect(dataset.totalFlow).toBe(0);
    expect(dataset.summary.topImporters).toEqual([]);
    expect(dataset.summary.topExporters).toEqual([]);
    expect(dataset.summary.strongestBilateral).toEqual([]);
    expect(dataset.summary.otherShare).toBe(0);
    expect(dataset.grouping).toBe("team");
  });

  it("aggregates overflow into an Other bucket with a fractional otherShare", () => {
    const records: ChordRecord[] = [];
    for (let i = 0; i < 10; i++) {
      records.push(edge(`src-${i}`, `tgt-${i}`, 100 - i));
    }
    const dataset = buildChordDataset(records, {
      grouping: "repo",
      topN: 5,
    });
    expect(dataset.nodes.length).toBe(5);
    const otherCount = dataset.nodes.filter((n) => n.isOther).length;
    expect(otherCount).toBe(1);
    expect(dataset.summary.otherShare).toBeGreaterThan(0);
    expect(dataset.summary.otherShare).toBeLessThan(1);
  });

  it("reports otherShare=0 and emits no isOther node when N <= topN", () => {
    const records = [
      edge("A", "B", 10),
      edge("C", "D", 5),
      edge("E", "F", 3),
    ];
    const dataset = buildChordDataset(records, {
      grouping: "team",
      topN: 8,
    });
    expect(dataset.summary.otherShare).toBe(0);
    expect(dataset.nodes.some((n) => n.isOther)).toBe(false);
  });

  it("retains self-links when includeSelfLinks is true", () => {
    const dataset = buildChordDataset([edge("A", "A", 5), edge("A", "B", 3)], {
      grouping: "team",
      includeSelfLinks: true,
      direction: "out",
    });
    const idxA = dataset.nodes.findIndex((n) => n.id === "A");
    expect(idxA).toBeGreaterThanOrEqual(0);
    expect(dataset.matrix[idxA][idxA]).toBe(5);
  });

  it("drops self-links by default", () => {
    const dataset = buildChordDataset([edge("A", "A", 5), edge("A", "B", 3)], {
      grouping: "team",
      direction: "out",
    });
    const idxA = dataset.nodes.findIndex((n) => n.id === "A");
    expect(idxA).toBeGreaterThanOrEqual(0);
    expect(dataset.matrix[idxA][idxA]).toBe(0);
  });

  it("produces different node arrays when records differ by grouping dimension", () => {
    const teamRecords = [
      { source: "team-alpha", target: "team-beta", value: 4, metadata: { team: "alpha" } },
      { source: "team-beta", target: "team-alpha", value: 2, metadata: { team: "beta" } },
    ];
    const repoRecords = [
      { source: "repo-core", target: "repo-web", value: 6, metadata: { repo: "core" } },
      { source: "repo-web", target: "repo-core", value: 1, metadata: { repo: "web" } },
    ];
    const teamDs = buildChordDataset(teamRecords, { grouping: "team" });
    const repoDs = buildChordDataset(repoRecords, { grouping: "repo" });
    expect(teamDs.nodes.map((n) => n.id).sort()).not.toEqual(
      repoDs.nodes.map((n) => n.id).sort(),
    );
    expect(teamDs.grouping).toBe("team");
    expect(repoDs.grouping).toBe("repo");
  });

  it("halves totalFlow for bilateral direction to avoid double counting", () => {
    const records = [edge("A", "B", 4), edge("B", "A", 6)];
    const outDs = buildChordDataset(records, { grouping: "team", direction: "out" });
    const bilateralDs = buildChordDataset(records, {
      grouping: "team",
      direction: "bilateral",
    });
    expect(outDs.totalFlow).toBe(10);
    expect(bilateralDs.totalFlow).toBe(10);
  });
});
