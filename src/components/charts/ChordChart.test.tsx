import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";

import { ChordChart } from "./ChordChart";
import type { ChordDataset } from "@/lib/types";

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
    return <div data-testid="chord-chart" />;
  },
}));

const sampleDataset: ChordDataset = {
  grouping: "team",
  nodes: [
    { id: "team-a", label: "Team A", isOther: false },
    { id: "team-b", label: "Team B", isOther: false },
    { id: "team-c", label: "Team C", isOther: false },
    { id: "team-d", label: "Team D", isOther: false },
    { id: "other", label: "Other", isOther: true },
  ],
  matrix: [
    [0, 5, 2, 0, 1],
    [5, 0, 3, 1, 0],
    [2, 3, 0, 4, 0],
    [0, 1, 4, 0, 2],
    [1, 0, 0, 2, 0],
  ],
  totalFlow: 36,
  summary: {
    topImporters: [],
    topExporters: [],
    strongestBilateral: [],
    otherShare: 0,
  },
};

describe("ChordChart", () => {
  beforeEach(() => {
    chartSpy.mockClear();
  });

  it("renders without crashing for a 5-node dataset", () => {
    render(<ChordChart dataset={sampleDataset} />);

    expect(screen.getByTestId("chord-chart")).toBeInTheDocument();
    expect(chartSpy).toHaveBeenCalledTimes(1);
  });

  it("renders empty state for empty dataset", () => {
    render(
      <ChordChart
        dataset={{
          grouping: "team",
          nodes: [],
          matrix: [],
          totalFlow: 0,
          summary: {
            topImporters: [],
            topExporters: [],
            strongestBilateral: [],
            otherShare: 0,
          },
        }}
      />,
    );

    expect(screen.queryByTestId("chord-chart")).not.toBeInTheDocument();
    expect(screen.getByText(/No flows match the current filters/i)).toBeInTheDocument();
    expect(screen.getByText(/No flows match the current filters/i)).toHaveAttribute(
      "data-chord-empty",
      "true",
    );
  });

  it("renders single-node state for 1-node dataset", () => {
    render(
      <ChordChart
        dataset={{
          grouping: "team",
          nodes: [{ id: "team-a", label: "Team A", isOther: false }],
          matrix: [[1]],
          totalFlow: 1,
          summary: {
            topImporters: [],
            topExporters: [],
            strongestBilateral: [],
            otherShare: 0,
          },
        }}
      />,
    );

    expect(screen.queryByTestId("chord-chart")).not.toBeInTheDocument();
    expect(screen.getByText(/Only one entity found/i)).toBeInTheDocument();
    expect(screen.getByText(/Only one entity found/i)).toHaveAttribute("data-chord-single", "true");
  });

  it("onItemClick fires on link click", () => {
    const onItemClick = vi.fn();
    render(<ChordChart dataset={sampleDataset} onItemClickAction={onItemClick} />);

    const props = chartSpy.mock.calls[0][0] as {
      onEvents?: { click: (params: unknown) => void };
    };

    props.onEvents?.click({
      dataType: "edge",
      data: { source: "Team A", target: "Team B", value: 5 },
    });

    expect(onItemClick).toHaveBeenCalledWith({
      type: "link",
      name: "",
      source: "Team A",
      target: "Team B",
      value: 5,
    });
  });

  it("onItemClick fires on node click", () => {
    const onItemClick = vi.fn();
    render(<ChordChart dataset={sampleDataset} onItemClickAction={onItemClick} />);

    const props = chartSpy.mock.calls[0][0] as {
      onEvents?: { click: (params: unknown) => void };
    };

    props.onEvents?.click({
      dataType: "node",
      data: { name: "Team A", value: 8 },
    });

    expect(onItemClick).toHaveBeenCalledWith({
      type: "node",
      name: "Team A",
      source: undefined,
      target: undefined,
      value: 8,
    });
  });

  it("isOther node styled with muted color", () => {
    render(<ChordChart dataset={sampleDataset} />);

    const props = chartSpy.mock.calls[0][0] as {
      option: {
        series: Array<{
          data: Array<{ name: string; itemStyle?: { color: string } }>;
        }>;
      };
    };

    const otherNode = props.option.series[0]?.data.find((d) => d.name === "Other");
    expect(otherNode).toBeDefined();
    expect(otherNode?.itemStyle?.color).toBe(chartTheme.muted);
  });
});
