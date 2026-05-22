import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";

import { HeatmapChart } from "./HeatmapChart";
import type { HeatmapResponse } from "@/lib/types";

const chartTheme = {
  text: "#111827",
  grid: "#e5e7eb",
  muted: "#6b7280",
  background: "#ffffff",
  stroke: "#d1d5db",
  accent1: "#2563eb",
  accent2: "#7c3aed",
  accent3: "#ef4444",
};

const chartColors = [
  "#2563eb",
  "#14b8a6",
  "#f97316",
  "#0ea5e9",
  "#8b5cf6",
  "#e2e8f0",
  "#16a34a",
  "#f59e0b",
  "#f97316",
];

const { chartSpy } = vi.hoisted(() => ({
  chartSpy: vi.fn(),
}));

vi.mock("./chartTheme", () => ({
  useChartTheme: () => chartTheme,
  useChartColors: () => chartColors,
}));

vi.mock("./Chart", () => ({
  Chart: (props: unknown) => {
    chartSpy(props);
    return <div data-testid="heatmap-chart" />;
  },
}));

const sampleData: HeatmapResponse = {
  axes: {
    x: ["Mon", "Tue"],
    y: ["Alice", "Bob"],
  },
  cells: [
    { x: "Mon", y: "Alice", value: 3 },
    { x: "Tue", y: "Bob", value: 7 },
  ],
  legend: {
    unit: "hours",
    scale: "linear",
  },
};

describe("HeatmapChart", () => {
  beforeEach(() => {
    chartSpy.mockClear();
  });

  it("renders without crashing", () => {
    render(<HeatmapChart data={sampleData} />);

    expect(screen.getByTestId("heatmap-chart")).toBeInTheDocument();
    expect(chartSpy).toHaveBeenCalledTimes(1);
  });

  it("renders with sample data and forwards props", () => {
    render(<HeatmapChart data={sampleData} className="grid-heatmap" width={640} />);

    const props = chartSpy.mock.calls[0][0] as {
      className: string;
      style: { width: number; height: number };
      option: {
        series: Array<{ data: unknown[] }>;
        visualMap: { min: number; max: number };
      };
      onEvents: { click: (params: unknown) => void };
    };

    expect(props.className).toBe("grid-heatmap");
    expect(props.style).toMatchObject({ width: 640, height: 320 });
    expect(props.option.series[0]?.data).toHaveLength(2);
    expect(props.option.visualMap).toMatchObject({ min: 3, max: 7 });
    expect(typeof props.onEvents.click).toBe("function");
  });

  it("handles empty data and null click payload gracefully", () => {
    render(
      <HeatmapChart
        data={{
          ...sampleData,
          cells: [],
          axes: { x: [], y: [] },
        }}
      />,
    );

    const props = chartSpy.mock.calls[0][0] as {
      option: {
        series: Array<{ data: unknown[] }>;
        visualMap: { min: number; max: number };
      };
      onEvents: { click: (params: unknown) => void };
    };

    expect(props.option.series[0]?.data).toHaveLength(0);
    expect(props.option.visualMap).toMatchObject({ min: 0, max: 1 });
    expect(() => props.onEvents.click(null)).not.toThrow();
  });
});
