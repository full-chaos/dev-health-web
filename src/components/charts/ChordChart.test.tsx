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
        expect(screen.getByText(/Only one entity found/i)).toHaveAttribute(
            "data-chord-single",
            "true",
        );
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

        const otherNode = props.option.series[0]?.data.find((d) => d.name === "other");
        expect(otherNode).toBeDefined();
        expect(otherNode?.itemStyle?.color).toBe(chartTheme.muted);
    });

    describe("identity is the node id; the label is display only", () => {
        const collision: ChordDataset = {
            grouping: "team",
            nodes: [
                { id: "TEAM:", label: "Unassigned team" },
                { id: "TEAM:Unassigned team", label: "Unassigned team" },
                { id: "TEAM:core", label: "core" },
            ],
            matrix: [
                [0, 4, 1],
                [4, 0, 2],
                [1, 2, 0],
            ],
            totalFlow: 7,
            summary: { topImporters: [], topExporters: [], strongestBilateral: [], otherShare: 0 },
        };

        type Option = {
            series: Array<{
                data: Array<{ name: string; value: number }>;
                edges: Array<{ source: string; target: string; value: number }>;
                label: { formatter: (p: { name?: string }) => string };
            }>;
            tooltip: { formatter: (p: unknown) => string };
        };
        const optionOf = (dataset: ChordDataset): Option => {
            chartSpy.mockClear();
            render(<ChordChart dataset={dataset} />);
            return (chartSpy.mock.calls[0][0] as { option: Option }).option;
        };

        it("builds two distinct series nodes and keeps the exchange between same-label nodes", () => {
            const series = optionOf(collision).series[0];
            expect(series.data.map((d) => d.name)).toEqual([
                "TEAM:",
                "TEAM:Unassigned team",
                "TEAM:core",
            ]);
            expect(series.edges).toContainEqual({
                source: "TEAM:",
                target: "TEAM:Unassigned team",
                value: 4,
            });
            expect(series.data.map((d) => d.value)).toEqual([10, 12, 6]);
        });

        it("shows the label for each node in the label formatter and the tooltip", () => {
            const option = optionOf(collision);
            const { formatter } = option.series[0].label;
            expect(formatter({ name: "TEAM:" })).toBe("Unassigned team");
            expect(formatter({ name: "TEAM:core" })).toBe("core");
            const tip = option.tooltip.formatter({
                dataType: "node",
                data: { name: "TEAM:core", value: 6 },
            });
            expect(tip).toContain(">core<");
            expect(tip).not.toContain("TEAM:core");
            const edgeTip = option.tooltip.formatter({
                dataType: "edge",
                data: { source: "TEAM:", target: "TEAM:core", value: 1 },
            });
            expect(edgeTip).toContain("Unassigned team &rarr; core");
        });

        it("plain dataset (id = label): series equals the label-keyed shape", () => {
            const series = optionOf({
                ...sampleDataset,
                nodes: sampleDataset.nodes.map((n) => ({ ...n, id: n.label })),
            }).series[0];
            expect(series.data.map((d) => d.name)).toEqual([
                "Team A",
                "Team B",
                "Team C",
                "Team D",
                "Other",
            ]);
            expect(series.edges[0]).toEqual({ source: "Team A", target: "Team B", value: 5 });
            expect(series.label.formatter({ name: "Team A" })).toBe("Team A");
        });
    });
});
