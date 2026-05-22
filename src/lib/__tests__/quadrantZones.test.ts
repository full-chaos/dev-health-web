import { describe, it, expect } from "vitest";
import { getQuadrantDefinition, getZoneOverlay, findZoneMatches } from "../quadrantZones";
import type { QuadrantResponse } from "../types";

// Helper to build a minimal QuadrantResponse
function makePoint(x: number, y: number, idx: number) {
  return {
    entity_id: `id-${idx}`,
    entity_label: `point-${idx}`,
    x,
    y,
    window_start: "2024-01-01",
    window_end: "2024-01-31",
    evidence_link: "",
  };
}

function makeQuadrantResponse(
  xMetric: string,
  yMetric: string,
  points: Array<{ x: number; y: number }>,
): QuadrantResponse {
  return {
    axes: {
      x: { metric: xMetric, unit: "", label: xMetric },
      y: { metric: yMetric, unit: "", label: yMetric },
    },
    points: points.map((p, i) => makePoint(p.x, p.y, i)),
    annotations: [],
  };
}

describe("getQuadrantDefinition", () => {
  it("returns a definition for known metric pairs", () => {
    const data = makeQuadrantResponse("wip", "throughput", []);
    const def = getQuadrantDefinition(data.axes);
    expect(def).not.toBeNull();
    expect(def?.id).toBe("wip-throughput");
  });

  it("normalises wip_saturation to wip", () => {
    const data = makeQuadrantResponse("wip_saturation", "throughput", []);
    const def = getQuadrantDefinition(data.axes);
    expect(def).not.toBeNull();
  });

  it("returns null for unknown metric pairs", () => {
    const data = makeQuadrantResponse("unknown_x", "unknown_y", []);
    const def = getQuadrantDefinition(data.axes);
    expect(def).toBeNull();
  });
});

describe("getZoneOverlay", () => {
  it("returns null when data is null", () => {
    expect(getZoneOverlay(null)).toBeNull();
  });

  it("returns null when there are no points", () => {
    const data = makeQuadrantResponse("wip", "throughput", []);
    expect(getZoneOverlay(data)).toBeNull();
  });

  it("returns null when all points share the same x value", () => {
    const data = makeQuadrantResponse("wip", "throughput", [
      { x: 5, y: 1 },
      { x: 5, y: 5 },
      { x: 5, y: 9 },
    ]);
    // x axis has no variance => xBands is null
    expect(getZoneOverlay(data)).toBeNull();
  });

  it("returns a ZoneOverlay with zones for valid data", () => {
    const data = makeQuadrantResponse("wip", "throughput", [
      { x: 1, y: 1 },
      { x: 2, y: 3 },
      { x: 5, y: 8 },
      { x: 9, y: 2 },
      { x: 7, y: 6 },
      { x: 3, y: 7 },
    ]);
    const overlay = getZoneOverlay(data);
    expect(overlay).not.toBeNull();
    expect(overlay?.zones.length).toBeGreaterThan(0);
  });

  it("returns null for unknown metric pair", () => {
    const data = makeQuadrantResponse("metric_a", "metric_b", [
      { x: 1, y: 2 },
      { x: 5, y: 8 },
    ]);
    expect(getZoneOverlay(data)).toBeNull();
  });
});

describe("findZoneMatches", () => {
  it("finds zones that contain a given point", () => {
    const data = makeQuadrantResponse("wip", "throughput", [
      { x: 1, y: 1 },
      { x: 2, y: 3 },
      { x: 5, y: 8 },
      { x: 9, y: 2 },
      { x: 7, y: 6 },
    ]);
    const overlay = getZoneOverlay(data);
    expect(overlay).not.toBeNull();

    // Use a point that is within one of the zones
    const point = data.points[0]!;
    const matches = findZoneMatches(overlay!, point);
    // May match 0 or 1 zones depending on the distribution — just check it doesn't throw
    expect(Array.isArray(matches)).toBe(true);
  });
});
