import { describe, expect, it } from "vitest";

import type { QuadrantPoint, QuadrantResponse } from "@/lib/types";
import { buildQuadrantOption } from "@/components/charts/QuadrantChart";
import type { ChartTheme } from "@/components/charts/chartTheme";

const chartTheme: ChartTheme = {
  text: "#111111",
  grid: "#222222",
  muted: "#333333",
  background: "#ffffff",
  stroke: "#e7e0ec",
  accent1: "#3b82f6",
  accent2: "#8b5cf6",
};

const chartColors = ["#1e88e5", "#3949ab", "#8e24aa"];

const buildData = (points: QuadrantPoint[]): QuadrantResponse => ({
  axes: {
    x: { metric: "churn", label: "Churn", unit: "%" },
    y: { metric: "throughput", label: "Throughput", unit: "units" },
  },
  points,
  annotations: [],
});

type SeriesRecord = {
  type?: string;
  data?: unknown[];
  symbol?: string;
  symbolSize?: unknown;
  markLine?: unknown;
  encode?: unknown;
  dimensions?: unknown;
};

const getScatterSeries = (option: ReturnType<typeof buildQuadrantOption>) => {
  const series = Array.isArray(option.series)
    ? (option.series as SeriesRecord[])
    : [];
  return series.filter((item) => item.type === "scatter");
};

const getPointSeries = (option: ReturnType<typeof buildQuadrantOption>) => {
  const scatter = getScatterSeries(option);
  return scatter.filter((series) => {
    const data = Array.isArray(series.data) ? series.data : [];
    return data.some((item) => (item as { point?: QuadrantPoint }).point);
  });
};

const getSeriesPoints = (option: ReturnType<typeof buildQuadrantOption>) => {
  const scatter = getScatterSeries(option);
  return scatter.flatMap((series) => {
    const data = Array.isArray(series.data) ? series.data : [];
    return data
      .map((item) => (item as { point?: QuadrantPoint }).point)
      .filter((p): p is QuadrantPoint => !!p);
  });
};

describe("buildQuadrantOption", () => {
  it("renders dots only (no line or path series)", () => {
    const points: QuadrantPoint[] = [
      {
        entity_id: "alpha",
        entity_label: "Alpha",
        x: 1,
        y: 2,
        window_start: "2024-01-01",
        window_end: "2024-01-14",
        evidence_link: "/api/v1/explain?metric=throughput",
        trajectory: [
          { x: 1, y: 2, window: "2023-12-15" },
          { x: 1.5, y: 2.2, window: "2023-12-31" },
        ],
      },
    ];
    const option = buildQuadrantOption({
      data: buildData(points),
      chartTheme,
      colors: chartColors,
      scopeType: "org",
    });

    const series = Array.isArray(option.series)
      ? (option.series as SeriesRecord[])
      : [];
    expect(series.length).toBeGreaterThan(0);
    expect(series.every((item) => item.type === "scatter")).toBe(true);
    expect(series.some((item) => item.type === "line")).toBe(false);
    expect(series.some((item) => Boolean(item.markLine))).toBe(false);

    const scatter = getScatterSeries(option);
    scatter.forEach((item) => {
      expect(item.symbol).toBe("circle");
    });
  });

  it("maps each entity to exactly one point", () => {
    const points: QuadrantPoint[] = [
      {
        entity_id: "alpha",
        entity_label: "Alpha",
        x: 1,
        y: 2,
        window_start: "2024-01-01",
        window_end: "2024-01-14",
        evidence_link: "/api/v1/explain?metric=throughput",
      },
      {
        entity_id: "bravo",
        entity_label: "Bravo",
        x: 2,
        y: 3,
        window_start: "2024-01-01",
        window_end: "2024-01-14",
        evidence_link: "/api/v1/explain?metric=throughput",
      },
      {
        entity_id: "charlie",
        entity_label: "Charlie",
        x: 3,
        y: 4,
        window_start: "2024-01-01",
        window_end: "2024-01-14",
        evidence_link: "/api/v1/explain?metric=throughput",
      },
    ];
    const option = buildQuadrantOption({
      data: buildData(points),
      chartTheme,
      colors: chartColors,
      focusEntityIds: ["bravo"],
      scopeType: "org",
    });
    const seriesPoints = getSeriesPoints(option);
    const ids = seriesPoints.map((point) => point.entity_id);
    expect(ids).toHaveLength(points.length);
    expect(new Set(ids).size).toBe(points.length);
  });

  it("uses x/y values only for plotting (no temporal encoding)", () => {
    const points: QuadrantPoint[] = [
      {
        entity_id: "alpha",
        entity_label: "Alpha",
        x: 4.5,
        y: 6.75,
        window_start: "2024-02-01",
        window_end: "2024-02-14",
        evidence_link: "/api/v1/explain?metric=throughput",
      },
    ];
    const option = buildQuadrantOption({
      data: buildData(points),
      chartTheme,
      colors: chartColors,
      scopeType: "org",
    });

    const pointSeries = getPointSeries(option);
    pointSeries.forEach((series) => {
      expect(typeof series.symbolSize).not.toBe("function");
      const encoded = JSON.stringify({
        encode: series.encode,
        dimensions: series.dimensions,
      });
      expect(encoded).not.toMatch(/window/);

      const data = Array.isArray(series.data) ? series.data : [];
      data.forEach((item) => {
        const datum = item as { value?: unknown; point?: QuadrantPoint };
        expect(Array.isArray(datum.value)).toBe(true);
        expect(datum.value).toEqual([datum.point?.x, datum.point?.y]);
        const values = datum.value as number[];
        values.forEach((value) => {
          expect(typeof value).toBe("number");
        });
      });
    });
  });

  it("isolates person scope to a single identity", () => {
    const points: QuadrantPoint[] = [
      {
        entity_id: "alpha",
        entity_label: "Alpha",
        x: 1,
        y: 2,
        window_start: "2024-01-01",
        window_end: "2024-01-14",
        evidence_link: "/api/v1/explain?metric=throughput",
      },
      {
        entity_id: "bravo",
        entity_label: "Bravo",
        x: 2,
        y: 3,
        window_start: "2024-01-01",
        window_end: "2024-01-14",
        evidence_link: "/api/v1/explain?metric=throughput",
      },
      {
        entity_id: "charlie",
        entity_label: "Charlie",
        x: 3,
        y: 4,
        window_start: "2024-01-01",
        window_end: "2024-01-14",
        evidence_link: "/api/v1/explain?metric=throughput",
      },
    ];
    const option = buildQuadrantOption({
      data: buildData(points),
      chartTheme,
      colors: chartColors,
      focusEntityIds: ["bravo"],
      scopeType: "person",
    });
    const seriesPoints = getSeriesPoints(option);
    const ids = seriesPoints.map((point) => point.entity_id);
    expect(ids).toEqual(["bravo"]);
    const serialized = JSON.stringify(option);
    expect(serialized).not.toMatch(/Alpha|Charlie/);
  });
});
