import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@/test/utils";

import { StackedAreaChart } from "./StackedAreaChart";

const chartTheme = {
    text: "#111111",
    grid: "#222222",
    muted: "#333333",
    background: "#ffffff",
    stroke: "#444444",
    accent1: "#555555",
    accent2: "#666666",
    accent3: "#777777",
};

const { chartSpy } = vi.hoisted(() => ({ chartSpy: vi.fn() }));

vi.mock("./chartTheme", () => ({
    useChartTheme: () => chartTheme,
    useChartColors: () => ["#0087a9", "#c88600", "#a30a06", "#00a2b8", "#f06a00"],
}));
vi.mock("./Chart", () => ({
    Chart: (props: unknown) => {
        chartSpy(props);
        return <div data-testid="chart" />;
    },
}));

const data = [
    { date: "2026-06-01", values: { Planned: 6, Unplanned: 4 } },
    { date: "2026-06-02", values: { Planned: 5, Unplanned: 5 } },
];
const series = [{ name: "Planned" }, { name: "Unplanned" }];

type Opt = {
    tooltip: {
        trigger: string;
        confine: boolean;
        backgroundColor: string;
        borderColor: string;
        textStyle: { color: string };
        axisPointer: {
            type: string;
            crossStyle: Record<string, unknown>;
            label: { backgroundColor: string };
        };
        formatter: (p: unknown) => string;
    };
    legend: { data: string[]; bottom: number; itemWidth: number; itemHeight: number };
    yAxis: { splitLine: { lineStyle: { color: string; type?: string } } };
    series: Array<{
        name: string;
        stack: string;
        smooth: boolean;
        showSymbol: boolean;
        lineStyle: { width: number };
        areaStyle: { opacity: number; color: unknown };
        emphasis: { focus: string };
        data: number[];
    }>;
};
const last = () =>
    chartSpy.mock.calls.at(-1)?.[0] as {
        option: Opt;
        onEvents: { click: (p: unknown) => void };
    };

describe("StackedAreaChart conventions", () => {
    beforeEach(() => chartSpy.mockClear());

    it("keeps today's tooltip values and the cross pointer, themed muted 1px solid", () => {
        render(<StackedAreaChart data={data} series={series} unit="items" />);
        const { tooltip } = last().option;
        expect(tooltip).toMatchObject({
            trigger: "axis",
            confine: true,
            backgroundColor: chartTheme.background,
            borderColor: chartTheme.stroke,
            textStyle: { color: chartTheme.text },
        });
        expect(tooltip.axisPointer).toEqual({
            type: "cross",
            crossStyle: { color: chartTheme.muted, width: 1, type: "solid" },
            label: { backgroundColor: chartTheme.muted },
        });
    });

    it("writes the percent in muted ink, keeps the swatch rows and the total", () => {
        render(<StackedAreaChart data={data} series={series} unit="items" />);
        const html = last().option.tooltip.formatter([
            {
                axisValue: "2026-06-01",
                dataIndex: 0,
                seriesName: "Planned",
                value: 6,
                color: "#0087a9",
            },
            {
                axisValue: "2026-06-01",
                dataIndex: 0,
                seriesName: "Unplanned",
                value: 4,
                color: "#c88600",
            },
        ]);
        expect(html).toContain("Total: 10 items");
        expect(html).toContain("background: #0087a9");
        expect(html).toContain(`color: ${chartTheme.muted}">(60`);
        expect(html).not.toContain(chartTheme.accent2);
    });

    it("draws a solid grid, keeps the legend and the area identity", () => {
        render(<StackedAreaChart data={data} series={series} unit="items" />);
        const { option } = last();
        expect(option.yAxis.splitLine.lineStyle).toEqual({ color: chartTheme.grid });
        expect(option.legend).toMatchObject({
            data: ["Planned", "Unplanned"],
            bottom: 0,
            itemWidth: 12,
            itemHeight: 8,
        });
        for (const s of option.series) {
            expect(s).toMatchObject({
                stack: "total",
                smooth: true,
                showSymbol: false,
                lineStyle: { width: 0 },
                emphasis: { focus: "series" },
            });
            expect(s.areaStyle.opacity).toBe(0.9);
            expect(s.areaStyle.color).toMatchObject({ type: "linear" });
        }
        expect(option.series[0].data).toEqual([6, 5]);
    });

    it("keeps the click payload", () => {
        const onSeriesClickAction = vi.fn();
        render(
            <StackedAreaChart
                data={data}
                series={series}
                unit="items"
                onSeriesClickAction={onSeriesClickAction}
            />,
        );
        last().onEvents.click({
            seriesName: "Planned",
            dataIndex: 1,
            name: "2026-06-02",
            value: 5,
        });
        expect(onSeriesClickAction).toHaveBeenCalledWith({
            seriesName: "Planned",
            date: "2026-06-02",
            value: 5,
            percent: 50,
        });
    });
});
