import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";

import { SankeyChart } from "./SankeyChart";
import type { SankeyLink, SankeyNode } from "@/lib/types";

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

const { chartSpy } = vi.hoisted(() => ({
  chartSpy: vi.fn(),
}));

vi.mock("./chartTheme", () => ({
  useChartTheme: () => chartTheme,
}));

vi.mock("./Chart", () => ({
  Chart: (props: unknown) => {
    chartSpy(props);
    return <div data-testid="sankey-chart" />;
  },
}));

const sampleNodes: SankeyNode[] = [{ name: "Backlog" }, { name: "In Progress" }, { name: "Done" }];

const sampleLinks: SankeyLink[] = [
  { source: "Backlog", target: "In Progress", value: 12 },
  { source: "In Progress", target: "Done", value: 9 },
];

describe("SankeyChart", () => {
  beforeEach(() => {
    chartSpy.mockClear();
  });

  it("renders without crashing", () => {
    render(<SankeyChart nodes={sampleNodes} links={sampleLinks} />);

    expect(screen.getByTestId("sankey-chart")).toBeInTheDocument();
    expect(chartSpy).toHaveBeenCalledTimes(1);
  });

  it("renders with sample data and accepts click callbacks", () => {
    const onItemClick = vi.fn();
    render(
      <SankeyChart
        nodes={sampleNodes}
        links={sampleLinks}
        className="flow-view"
        onItemClick={onItemClick}
      />,
    );

    const props = chartSpy.mock.calls[0][0] as {
      className: string;
      option: { series: Array<{ data: unknown[]; links: unknown[] }> };
      onEvents?: { click: (params: unknown) => void };
    };

    expect(props.className).toBe("flow-view");
    expect(props.option.series[0]?.data).toHaveLength(3);
    expect(props.option.series[0]?.links).toHaveLength(2);

    props.onEvents?.click({
      dataType: "edge",
      data: { source: "Backlog", target: "In Progress", value: 12 },
    });
    expect(onItemClick).toHaveBeenCalledWith({
      type: "link",
      name: "",
      source: "Backlog",
      target: "In Progress",
      value: 12,
    });
  });

  it("handles empty data and null click payload gracefully", () => {
    const onItemClick = vi.fn();
    render(<SankeyChart nodes={[]} links={[]} onItemClick={onItemClick} />);

    const props = chartSpy.mock.calls[0][0] as {
      option: { series: Array<{ data: unknown[]; links: unknown[] }> };
      onEvents?: { click: (params: unknown) => void };
    };

    expect(props.option.series[0]?.data).toHaveLength(0);
    expect(props.option.series[0]?.links).toHaveLength(0);
    expect(() => props.onEvents?.click(null)).not.toThrow();
    expect(onItemClick).not.toHaveBeenCalled();
  });
});
