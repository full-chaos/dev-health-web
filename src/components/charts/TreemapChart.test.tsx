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
        render(
            <TreemapChart data={sampleData} onNodeClickAction={onNodeClick} className="mix-tree" />,
        );

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
            }),
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
                onNodeClickAction={onNodeClick}
            />,
        );

        const props = chartSpy.mock.calls[0][0] as {
            option: { series: Array<{ data: unknown[] }> };
            onEvents: { click: (params: unknown) => void };
        };

        expect(props.option.series[0]?.data).toHaveLength(0);
        expect(() => props.onEvents.click(null)).not.toThrow();
        expect(onNodeClick).not.toHaveBeenCalled();
    });

    it("separates tiles with a 2px gap and no borders or text halo", () => {
        render(<TreemapChart data={sampleData} />);
        const props = chartSpy.mock.calls[0][0] as {
            option: {
                series: Array<{
                    itemStyle: { borderWidth: number; gapWidth: number };
                    label: { textBorderWidth: number };
                    levels: Array<{ itemStyle: { borderWidth: number; gapWidth: number } }>;
                }>;
            };
        };
        const series = props.option.series[0];
        expect(series.itemStyle).toMatchObject({ borderWidth: 0, gapWidth: 2 });
        expect(series.label.textBorderWidth).toBe(0);
        series.levels.forEach((level) =>
            expect(level.itemStyle).toMatchObject({ borderWidth: 0, gapWidth: 2 }),
        );
    });

    it("colors only the top level on the generic palette; deeper tiles inherit", () => {
        render(
            <TreemapChart
                data={{
                    name: "All",
                    value: 10,
                    children: [{ name: "A", value: 10, children: [{ name: "a1", value: 10 }] }],
                }}
            />,
        );
        const props = chartSpy.mock.calls[0][0] as {
            option: { series: Array<{ data: Array<TreemapNode> }> };
        };
        const top = props.option.series[0].data[0];
        expect(top.itemStyle?.color).toBe("#2563eb");
        expect(top.children?.[0].itemStyle?.color).toBeUndefined();
        expect(top.children?.[0].itemStyle?.opacity).toBeUndefined();
    });

    it("keeps caller colors and evidence-quality opacity untouched", () => {
        render(
            <TreemapChart
                useInputColors
                data={{
                    name: "All",
                    value: 10,
                    children: [
                        { name: "A", value: 10, itemStyle: { color: "#e8650a", opacity: 0.4 } },
                    ],
                }}
            />,
        );
        const props = chartSpy.mock.calls[0][0] as {
            option: { series: Array<{ data: Array<TreemapNode> }> };
        };
        expect(props.option.series[0].data[0].itemStyle).toEqual({
            color: "#e8650a",
            opacity: 0.4,
        });
    });

    it("never hides a label for contrast: low-contrast tiles get a halo instead", () => {
        render(
            <TreemapChart
                useInputColors
                data={{
                    name: "All",
                    value: 10,
                    children: [{ name: "A", value: 10, itemStyle: { color: "#7a7a7a" } }],
                }}
            />,
        );
        const props = chartSpy.mock.calls[0][0] as {
            option: {
                series: Array<{
                    data: Array<{
                        label: { show?: boolean; color?: string; textBorderWidth?: number };
                    }>;
                }>;
            };
        };
        const label = props.option.series[0].data[0].label;
        expect(label.show).toBe(true);
        expect(label.textBorderWidth).toBe(2);
    });

    it("uses the fixed white / near-black ink pair, not the theme text color", () => {
        render(
            <TreemapChart
                useInputColors
                data={{
                    name: "All",
                    value: 10,
                    children: [{ name: "A", value: 10, itemStyle: { color: "#da2100" } }],
                }}
            />,
        );
        const props = chartSpy.mock.calls[0][0] as {
            option: { series: Array<{ data: Array<{ label: { color?: string } }> }> };
        };
        expect(props.option.series[0].data[0].label.color).toBe("#ffffff");
    });
});
