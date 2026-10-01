import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@/test/utils";

import { HorizontalBarChart } from "./HorizontalBarChart";
import { SparklineChart } from "./SparklineChart";
import { TimeseriesChart } from "./TimeseriesChart";
import { VerticalBarChart } from "./VerticalBarChart";

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
    useChartColors: () => [],
}));

vi.mock("./Chart", () => ({
    Chart: (props: unknown) => {
        chartSpy(props);
        return <div data-testid="chart" />;
    },
}));

type Option = {
    tooltip: {
        axisPointer?: { lineStyle: Record<string, unknown> };
        formatter: (p: unknown) => string;
    };
    legend?: { data: string[] };
    grid: { bottom: number };
    series: Array<{
        symbolSize?: (v: unknown, p: { dataIndex: number }) => number;
        lineStyle?: Record<string, unknown>;
        itemStyle?: Record<string, unknown>;
    }>;
};
const option = () => (chartSpy.mock.calls.at(-1)?.[0] as { option: Option }).option;
const sizes = (n: number) =>
    Array.from({ length: n }, (_, dataIndex) =>
        option().series[0].symbolSize!(undefined, { dataIndex }),
    );

describe("time series conventions", () => {
    beforeEach(() => chartSpy.mockClear());

    it("draws a dot on the last point and on an isolated point, none elsewhere", () => {
        render(
            <TimeseriesChart
                data={[
                    { day: "2026-06-01", value: null },
                    { day: "2026-06-02", value: 5 },
                    { day: "2026-06-03", value: null },
                    { day: "2026-06-04", value: 7 },
                    { day: "2026-06-05", value: 8 },
                ]}
            />,
        );
        expect(sizes(5)).toEqual([0, 8, 0, 0, 8]);
        expect(option().series[0].lineStyle).toMatchObject({
            width: 2,
            cap: "round",
            join: "round",
        });
        expect(option().series[0].itemStyle).toMatchObject({ borderColor: chartTheme.background });
        expect(option().tooltip.axisPointer?.lineStyle).toEqual({
            color: chartTheme.muted,
            width: 1,
            type: "solid",
        });
    });

    it("still reads every point through the tooltip", () => {
        render(
            <TimeseriesChart
                data={[
                    { day: "2026-06-01", value: 3 },
                    { day: "2026-06-02", value: 4 },
                ]}
            />,
        );
        expect(option().tooltip.formatter([{ name: "06-01", value: 3 }])).toContain("06-01: 3");
    });
});

describe("sparkline conventions", () => {
    beforeEach(() => chartSpy.mockClear());

    it("draws a dot on the last point and on an isolated point, none elsewhere", () => {
        render(
            <SparklineChart data={[null, 5, null, 7, 8]} categories={["a", "b", "c", "d", "e"]} />,
        );
        expect(sizes(5)).toEqual([0, 8, 0, 0, 8]);
        expect(option().tooltip.axisPointer?.lineStyle).toMatchObject({ color: chartTheme.muted });
    });

    it("draws a one-point sparkline as a dot", () => {
        render(<SparklineChart data={[4]} categories={["a"]} />);
        expect(sizes(1)).toEqual([8]);
    });
});

describe("bar conventions", () => {
    beforeEach(() => chartSpy.mockClear());

    it("hides the legend for one series and tightens the bottom margin", () => {
        render(
            <VerticalBarChart categories={["a"]} series={[{ name: "Items/week", data: [1] }]} />,
        );
        expect(option().legend).toBeUndefined();
        expect(option().grid.bottom).toBe(32);
    });

    it("shows the legend for two series", () => {
        render(
            <VerticalBarChart
                categories={["a"]}
                series={[
                    { name: "Planned", data: [1] },
                    { name: "Actual", data: [2] },
                ]}
            />,
        );
        expect(option().legend?.data).toEqual(["Planned", "Actual"]);
        expect(option().grid.bottom).toBe(52);
    });

    it("keeps a one-series legend when the caller asks for it", () => {
        render(
            <VerticalBarChart
                categories={["a"]}
                series={[{ name: "Only", data: [1] }]}
                showLegend
            />,
        );
        expect(option().legend?.data).toEqual(["Only"]);
    });

    it("gives the horizontal bar the same tooltip and leaves the pointer alone", () => {
        render(<HorizontalBarChart categories={["a"]} values={[3]} categoryTitles={["Full A"]} />);
        expect(option().tooltip.axisPointer).toBeUndefined();
        expect(option().tooltip.formatter([{ name: "a", value: 3, dataIndex: 0 }])).toContain(
            "Full A",
        );
    });
});
