import { describe, expect, it } from "vitest";

import { adaptSankeyToChord, stripDimensionPrefix } from "../chordAdapter";

describe("stripDimensionPrefix", () => {
  it("removes the leading dimension prefix", () => {
    expect(stripDimensionPrefix("team:Engineering")).toBe("Engineering");
  });

  it("returns unprefixed values unchanged", () => {
    expect(stripDimensionPrefix("NoPrefix")).toBe("NoPrefix");
  });
});

describe("adaptSankeyToChord", () => {
  it("filters out mixed-dimension edges for the requested grouping", () => {
    const result = adaptSankeyToChord(
      {
        nodes: [
          { id: "team:Engineering", label: "team:Engineering", dimension: "TEAM", value: 10 },
          { id: "team:Platform", label: "team:Platform", dimension: "TEAM", value: 7 },
          { id: "repo:web", label: "repo:web", dimension: "REPO", value: 20 },
        ],
        edges: [
          { source: "team:Engineering", target: "team:Platform", value: 3 },
          { source: "team:Engineering", target: "repo:web", value: 8 },
        ],
      },
      "team"
    );

    expect(result).toEqual([
      {
        source: "Engineering",
        target: "Platform",
        value: 3,
        metadata: { team: "Engineering" },
      },
    ]);
  });

  it("preserves the original edge value", () => {
    const result = adaptSankeyToChord(
      {
        nodes: [
          { id: "repo:api", label: "repo:api", dimension: "repo", value: 12 },
          { id: "repo:web", label: "repo:web", dimension: "repo", value: 8 },
        ],
        edges: [{ source: "repo:api", target: "repo:web", value: 42 }],
      },
      "repo"
    );

    expect(result[0]?.value).toBe(42);
  });

  it("returns an empty array for empty input", () => {
    expect(adaptSankeyToChord({ nodes: [], edges: [] }, "work_type")).toEqual([]);
  });

  it("includes metadata under the grouping key", () => {
    const result = adaptSankeyToChord(
      {
        nodes: [
          { id: "work_type:Feature Delivery", label: "work_type:Feature Delivery", dimension: "WORK_TYPE", value: 5 },
          { id: "work_type:Risk / Security", label: "work_type:Risk / Security", dimension: "WORK_TYPE", value: 4 },
        ],
        edges: [{ source: "work_type:Feature Delivery", target: "work_type:Risk / Security", value: 2 }],
      },
      "work_type"
    );

    expect(result[0]?.metadata).toEqual({ workType: "Feature Delivery" });
  });

  it("matches dimensions case-insensitively", () => {
    const result = adaptSankeyToChord(
      {
        nodes: [
          { id: "team:Engineering", label: "team:Engineering", dimension: "TEAM", value: 5 },
          { id: "team:Platform", label: "team:Platform", dimension: "TEAM", value: 5 },
        ],
        edges: [{ source: "team:Engineering", target: "team:Platform", value: 1 }],
      },
      "team"
    );

    expect(result).toHaveLength(1);
  });
});
