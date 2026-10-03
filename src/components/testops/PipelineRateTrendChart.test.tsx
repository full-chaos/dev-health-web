import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@/test/utils";

import {
    FAILURE_RATE_SERIES,
    PipelineRateTrendChart,
    SUCCESS_RATE_SERIES,
} from "./PipelineRateTrendChart";

const chartTheme = {
    text: "#111111",
    grid: "#222222",
    muted: "#333333",
    background: "#abcdef",
    stroke: "#444444",
    accent1: "#555555",
    accent2: "#666666",
    accent3: "#777777",
};
const palette = ["#c1", "#c2", "#c3", "#c4", "#c5"];

const { chartSpy } = vi.hoisted(() => ({ chartSpy: vi.fn() }));

vi.mock("@/components/charts/chartTheme", () => ({
    useChartTheme: () => chartTheme,
    useChartColors: () => palette,
}));
vi.mock("@/components/charts/Chart", () => ({
    Chart: (props: unknown) => {
        chartSpy(props);
        return <div data-testid="chart" />;
    },
}));

type Point = { value: number | null; symbolSize: number };
type Series = {
    name: string;
    type: string;
    data: Point[];
    lineStyle: Record<string, unknown>;
    itemStyle: { color: string; borderWidth?: number };
    areaStyle?: unknown;
    stack?: unknown;
    showAllSymbol?: boolean;
    symbolSize?: number;
};
type Opt = {
    tooltip: {
        trigger?: string;
        confine?: boolean;
        axisPointer?: { lineStyle: unknown };
        formatter: (p: unknown) => string;
    };
    legend?: { data: string[] };
    xAxis: { data: string[] };
    yAxis: { axisLabel: { formatter: (v: number) => string } };
    series: Series[];
};
const option = () => (chartSpy.mock.calls.at(-1)?.[0] as { option: Opt }).option;

const points = [
    { day: "2026-09-01", success: 91, failure: 3 },
    { day: "2026-09-02", success: null, failure: 11 },
    { day: "2026-09-03", success: 80, failure: 0 },
];

describe("PipelineRateTrendChart", () => {
    beforeEach(() => chartSpy.mockClear());

    it("draws two independent line series, success then failure, with the served values", () => {
        render(<PipelineRateTrendChart points={points} />);
        const o = option();
        expect(o.series.map((s) => s.name)).toEqual([SUCCESS_RATE_SERIES, FAILURE_RATE_SERIES]);
        expect(o.series.map((s) => s.type)).toEqual(["line", "line"]);
        // A gap stays null (never 0); a served 0 stays 0.
        expect(o.series[0].data.map((p) => p.value)).toEqual([91, null, 80]);
        expect(o.series[1].data.map((p) => p.value)).toEqual([3, 11, 0]);
        // Two rates with their own denominators: not stacked, and no area fill.
        expect(o.series.every((s) => s.stack === undefined && s.areaStyle === undefined)).toBe(
            true,
        );
        expect(o.legend?.data).toEqual(["Success rate", "Failure rate"]);
    });

    it("gives each series its own palette color and the shared line mark", () => {
        render(<PipelineRateTrendChart points={points} />);
        const o = option();
        expect(o.series[0].lineStyle).toMatchObject({
            width: 2,
            cap: "round",
            join: "round",
            color: palette[0],
        });
        expect(o.series[1].lineStyle).toMatchObject({ color: palette[1] });
        expect(o.series[0].itemStyle.color).toBe(palette[0]);
        expect(o.series[1].itemStyle.color).toBe(palette[1]);
    });

    it("follows the chart conventions: shared tooltip with a crosshair, a dot on the last and isolated points only", () => {
        render(<PipelineRateTrendChart points={points} />);
        const o = option();
        expect(o.tooltip).toMatchObject({ trigger: "axis", confine: true });
        expect(o.tooltip.axisPointer?.lineStyle).toEqual({
            color: chartTheme.muted,
            width: 1,
            type: "solid",
        });
        // Success: 91 and 80 are each isolated by the gap between them; failure: only the last.
        expect(o.series[0].data.map((p) => p.symbolSize)).toEqual([8, 0, 8]);
        expect(o.series[1].data.map((p) => p.symbolSize)).toEqual([0, 0, 8]);
        expect(o.series[0].showAllSymbol).toBe(true);
        expect(o.series[0].symbolSize).toBe(5);
        expect(o.series[0].itemStyle.borderWidth).toBeUndefined();
    });

    it("labels the axis with short days and the values as percent", () => {
        render(<PipelineRateTrendChart points={points} />);
        const o = option();
        expect(o.xAxis.data).toEqual(["Sep 1", "Sep 2", "Sep 3"]);
        expect(o.yAxis.axisLabel.formatter(75)).toBe("75%");
    });

    it("tooltip names the full day, formats percent, and reads a gap as 'No data' (not 0%)", () => {
        render(<PipelineRateTrendChart points={points} />);
        const text = option().tooltip.formatter([
            { seriesName: SUCCESS_RATE_SERIES, marker: "", dataIndex: 1, value: undefined },
            { seriesName: FAILURE_RATE_SERIES, marker: "", dataIndex: 1, value: 11 },
        ]);
        expect(text).toBe("2026-09-02<br/>Success rate: No data<br/>Failure rate: 11%");
        const zero = option().tooltip.formatter([
            { seriesName: FAILURE_RATE_SERIES, marker: "", dataIndex: 2, value: 0 },
        ]);
        expect(zero).toBe("2026-09-03<br/>Failure rate: 0%");
    });
});
