import { describe, it, expect } from "vitest";

import { buildFailurePatternsModel, isMissingKey, UNATTRIBUTED_LABEL } from "../failure-patterns";
import type { BreakdownResult } from "@/lib/graphql/schemas/analytics";

function breakdown(items: { key: string; value: number }[]): BreakdownResult {
  return { dimension: "TEAM", measure: "PIPELINE_FAILURE_RATE", items };
}

describe("isMissingKey", () => {
  it.each(["", "  ", "None", "none", "null", "undefined", "N/A", "na", "NaN"])(
    "treats %j as a missing key",
    (key) => {
      expect(isMissingKey(key)).toBe(true);
    },
  );

  it.each(["Platform", "team-1", "0", "Frontend"])("treats %j as a real key", (key) => {
    expect(isMissingKey(key)).toBe(false);
  });

  it("treats null/undefined as missing", () => {
    expect(isMissingKey(null)).toBe(true);
    expect(isMissingKey(undefined)).toBe(true);
  });
});

describe("buildFailurePatternsModel", () => {
  it("renders an empty state when the breakdown is undefined", () => {
    const model = buildFailurePatternsModel(undefined);
    expect(model.isEmpty).toBe(true);
    expect(model.hasUnattributed).toBe(false);
    expect(model.heatmap.cells).toEqual([]);
    expect(model.heatmap.axes.x).toEqual([]);
  });

  it("renders an empty state when the breakdown has no items", () => {
    const model = buildFailurePatternsModel(breakdown([]));
    expect(model.isEmpty).toBe(true);
    expect(model.hasUnattributed).toBe(false);
    expect(model.heatmap.cells).toEqual([]);
  });

  it("buckets a single null/None grouping key as an explicit Unattributed category (never silent None)", () => {
    // This is the exact regression: a single null key stringified to "None".
    const model = buildFailurePatternsModel(breakdown([{ key: "None", value: 25.07 }]));

    expect(model.isEmpty).toBe(false);
    expect(model.hasUnattributed).toBe(true);
    // No raw "None" leaks into the axis or cells.
    expect(model.heatmap.axes.x).toEqual([UNATTRIBUTED_LABEL]);
    expect(model.heatmap.axes.x).not.toContain("None");
    expect(model.heatmap.cells).toEqual([
      { x: UNATTRIBUTED_LABEL, y: "Failure Rate", value: 25.07 },
    ]);
  });

  it("keeps real categories in order and appends Unattributed last with its real value", () => {
    const model = buildFailurePatternsModel(
      breakdown([
        { key: "Platform", value: 18 },
        { key: "Frontend", value: 12 },
        { key: "", value: 5 },
      ]),
    );

    expect(model.isEmpty).toBe(false);
    expect(model.hasUnattributed).toBe(true);
    expect(model.heatmap.axes.x).toEqual(["Platform", "Frontend", UNATTRIBUTED_LABEL]);
    // Tooltip-facing cells carry the real category + value.
    expect(model.heatmap.cells).toEqual([
      { x: "Platform", y: "Failure Rate", value: 18 },
      { x: "Frontend", y: "Failure Rate", value: 12 },
      { x: UNATTRIBUTED_LABEL, y: "Failure Rate", value: 5 },
    ]);
  });

  it("collapses multiple missing-key variants into a single summed Unattributed bucket", () => {
    const model = buildFailurePatternsModel(
      breakdown([
        { key: "Platform", value: 10 },
        { key: "None", value: 3 },
        { key: "null", value: 2 },
        { key: "", value: 1 },
      ]),
    );

    expect(model.heatmap.axes.x).toEqual(["Platform", UNATTRIBUTED_LABEL]);
    const unattributed = model.heatmap.cells.find((c) => c.x === UNATTRIBUTED_LABEL);
    expect(unattributed?.value).toBe(6);
  });

  it("does not add an Unattributed bucket when every key is real", () => {
    const model = buildFailurePatternsModel(
      breakdown([
        { key: "Platform", value: 8 },
        { key: "Frontend", value: 4 },
      ]),
    );

    expect(model.isEmpty).toBe(false);
    expect(model.hasUnattributed).toBe(false);
    expect(model.heatmap.axes.x).toEqual(["Platform", "Frontend"]);
    expect(model.heatmap.cells).not.toContainEqual(
      expect.objectContaining({ x: UNATTRIBUTED_LABEL }),
    );
  });

  it("respects the unit passed for the legend", () => {
    const model = buildFailurePatternsModel(breakdown([{ key: "Platform", value: 8 }]), "%");
    expect(model.heatmap.legend.unit).toBe("%");
    expect(model.heatmap.legend.scale).toBe("linear");
  });
});
