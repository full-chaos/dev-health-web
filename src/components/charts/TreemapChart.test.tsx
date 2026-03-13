import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";

import { TreemapChart, type TreemapNode } from "./TreemapChart";

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

const chartColors = ["#2563eb", "#14b8a6", "#f97316"];

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
    return <div data-testid="treemap-chart" />;
  },
}));

const sampleData: TreemapNode = {
  name: "All Work",
  value: 100,
  children: [
    { name: "Feature Delivery", value: 60 },
    { name: "Quality", value: 40 },
  ],
};

describe("TreemapChart", () => {
  beforeEach(() => {
    chartSpy.mockClear();
  });

  it("renders without crashing", () => {
    render(<TreemapChart data={sampleData} />);

    expect(screen.getByTestId("treemap-chart")).toBeInTheDocument();
    expect(chartSpy).toHaveBeenCalledTimes(1);
  });

  it("renders with sample data and supports node click callbacks", () => {
    const onNodeClick = vi.fn();
    render(<TreemapChart data={sampleData} onNodeClick={onNodeClick} className="mix-tree" />);

    const props = chartSpy.mock.calls[0][0] as {
      className: string;
      option: { series: Array<{ data: unknown[] }> };
      onEvents: { click: (params: unknown) => void };
    };

    expect(props.className).toBe("mix-tree");
    expect(props.option.series[0]?.data).toHaveLength(2);

    props.onEvents.click({
      data: { name: "Feature Delivery", value: 60 },
      treePathInfo: [
        { name: "All Work", value: 100 },
        { name: "Feature Delivery", value: 60 },
      ],
    });

    expect(onNodeClick).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Feature Delivery",
        value: 60,
        path: ["All Work", "Feature Delivery"],
      })
    );
  });

  it("handles empty children and null click payload gracefully", () => {
    const onNodeClick = vi.fn();
    render(
      <TreemapChart
        data={{
          name: "All Work",
          value: 0,
          children: [],
        }}
        onNodeClick={onNodeClick}
      />
    );

    const props = chartSpy.mock.calls[0][0] as {
      option: { series: Array<{ data: unknown[] }> };
      onEvents: { click: (params: unknown) => void };
    };

    expect(props.option.series[0]?.data).toHaveLength(0);
    expect(() => props.onEvents.click(null)).not.toThrow();
    expect(onNodeClick).not.toHaveBeenCalled();
  });
});
