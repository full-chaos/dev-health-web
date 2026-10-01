import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/utils";

import { HeatmapChart } from "./HeatmapChart";
import type { HeatmapResponse } from "@/lib/types";
import type { EChartsOption } from "echarts";
import { echarts } from "@/lib/echartsInit";
import { SVGRenderer } from "echarts/renderers";

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

vi.mock("./chartTheme", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./chartTheme")>();
    return {
        ...actual,
        useChartTheme: () => chartTheme,
        useChartColors: () => chartColors,
        useChartTokens: () => actual.fallbackTokens,
    };
});

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
        const { container } = render(
            <HeatmapChart data={sampleData} className="grid-heatmap" width={640} />,
        );

        const props = chartSpy.mock.calls[0][0] as {
            style: { width: number; height: number };
            option: {
                series: Array<{ data: Array<{ value: unknown[] }> }>;
            };
            onEvents: { click: (params: unknown) => void };
        };

        expect(container.firstElementChild).toHaveClass("grid-heatmap");
        expect(props.style).toMatchObject({ width: 640, height: 320 });
        // Only cells with data are drawn; a position with no data stays unfilled, not 0.
        const data = props.option.series[0]?.data ?? [];
        expect(data).toHaveLength(2);
        expect(screen.getByTestId("heatmap-scale-min")).toHaveTextContent("3");
        expect(screen.getByTestId("heatmap-scale-max")).toHaveTextContent("7 hours");
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
            };
            onEvents: { click: (params: unknown) => void };
        };

        expect(props.option.series[0]?.data).toHaveLength(0);
        expect(() => props.onEvents.click(null)).not.toThrow();
    });

    it("renders every cell in its ramp color through a real chart (heatmaps need a visualMap)", () => {
        render(<HeatmapChart data={sampleData} />);
        const props = chartSpy.mock.calls[0][0] as { option: EChartsOption };

        expect(props.option.visualMap).toMatchObject({ show: false });
        echarts.use([SVGRenderer]);
        const chart = echarts.init(null, null, {
            renderer: "svg",
            ssr: true,
            width: 400,
            height: 200,
        });
        chart.setOption(props.option);
        const svg = chart.renderToSVGString();
        chart.dispose();

        const series = props.option.series as Array<{
            data: Array<{ itemStyle: { color: string } }>;
        }>;
        for (const item of series[0].data) {
            expect(svg).toContain(item.itemStyle.color);
        }
    });
});
