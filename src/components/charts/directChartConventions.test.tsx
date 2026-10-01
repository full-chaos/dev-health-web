import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@/test/utils";

import { AIReviewAmplificationTrend } from "../ai/AIReviewAmplificationTrend";
import { SeverityStackedBar } from "../security/SeverityStackedBar";
import { TrendChart } from "../security/TrendChart";
import { DonutChart } from "./DonutChart";
import { NestedPieChart2D } from "./NestedPieChart2D";
import { ThroughputHistogram } from "./ThroughputHistogram";

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
const tokens = {
    positive: "#10a010",
    caution: "#a0a010",
    negative: "#a01010",
    info: "#1010a0",
    accentHighlight: "#b05010",
    themeFeature: "#e8650a",
    themeQuality: "#02a2bc",
    themeRisk: "#c98500",
    themeMaintenance: "#da2100",
    themeOperational: "#0b8fb0",
    zones: ["#1", "#2", "#3", "#4"],
    seq: ["#0", "#1", "#2", "#3", "#4", "#5"],
};

const { chartSpy } = vi.hoisted(() => ({ chartSpy: vi.fn() }));

vi.mock("./chartTheme", () => ({
    useChartTheme: () => chartTheme,
    useChartColors: () => ["#1", "#2", "#3", "#4", "#5"],
    useChartTokens: () => tokens,
}));
vi.mock("./Chart", () => ({
    Chart: (props: unknown) => {
        chartSpy(props);
        return <div data-testid="chart" />;
    },
}));

type Opt = {
    tooltip: {
        trigger?: string;
        confine?: boolean;
        backgroundColor?: string;
        borderColor?: string;
        textStyle?: { color?: string; fontSize?: number };
        axisPointer?: { lineStyle: { color: string; width: number; type: string } };
        formatter?: (p: unknown) => string;
    };
    legend?: { data: string[] };
    yAxis?: { splitLine?: { lineStyle?: { type?: string } } };
    series: Array<{
        symbolSize?: (v: unknown, p: { dataIndex: number }) => number;
        showAllSymbol?: boolean;
        lineStyle?: Record<string, unknown>;
    }>;
};
const option = () => (chartSpy.mock.calls.at(-1)?.[0] as { option: Opt }).option;
const sizes = (series: number, n: number) =>
    Array.from({ length: n }, (_, dataIndex) =>
        option().series[series].symbolSize!(undefined, { dataIndex }),
    );
const todaysTooltip = (trigger: "axis" | "item") => ({
    trigger,
    confine: true,
    backgroundColor: chartTheme.background,
    borderColor: chartTheme.stroke,
    textStyle: { color: chartTheme.text },
});

describe("security trend chart conventions", () => {
    beforeEach(() => chartSpy.mockClear());

    it("uses the shared tooltip and crosshair, a dot only on the last point, and a solid grid", () => {
        render(
            <TrendChart
                points={[
                    { day: "2026-06-01", opened: 3, fixed: 1 },
                    { day: "2026-06-02", opened: 5, fixed: 2 },
                    { day: "2026-06-03", opened: 4, fixed: 2 },
                ]}
            />,
        );
        const o = option();
        expect(o.tooltip).toMatchObject(todaysTooltip("axis"));
        expect(o.tooltip.axisPointer?.lineStyle).toEqual({
            color: chartTheme.muted,
            width: 1,
            type: "solid",
        });
        expect(sizes(0, 3)).toEqual([0, 0, 8]);
        expect(sizes(1, 3)).toEqual([0, 0, 8]);
        expect(o.series[0].showAllSymbol).toBe(true);
        expect(o.series[0].lineStyle).toMatchObject({ width: 2, cap: "round", join: "round" });
        expect(o.yAxis?.splitLine?.lineStyle?.type).toBeUndefined();
        expect(o.legend?.data).toEqual(["Opened", "Fixed"]);
    });
});

describe("severity bar and pie tooltips", () => {
    beforeEach(() => chartSpy.mockClear());

    it("severity bar keeps today's tooltip values", () => {
        render(<SeverityStackedBar buckets={[{ severity: "high", count: 2 }]} />);
        expect(option().tooltip).toEqual(todaysTooltip("axis"));
    });

    it("donut and nested pie keep today's item tooltip, and the pie keeps its formatter", () => {
        render(<DonutChart data={[{ name: "A", value: 1 }]} />);
        expect(option().tooltip).toEqual(todaysTooltip("item"));
        render(
            <NestedPieChart2D
                categories={[{ key: "a", name: "A", value: 2 }]}
                subtypes={[{ name: "a1", value: 2, parentKey: "a" }]}
            />,
        );
        expect(option().tooltip).toMatchObject(todaysTooltip("item"));
        expect(
            option().tooltip.formatter?.({ seriesName: "S", name: "N", percent: 50, value: 2 }),
        ).toContain("S");
    });
});

describe("throughput histogram conventions", () => {
    beforeEach(() => chartSpy.mockClear());

    it("keeps its unconfined 11px tooltip, and draws a solid grid", () => {
        render(<ThroughputHistogram throughputMean={10} throughputStddev={3} />);
        const o = option();
        expect(o.tooltip).toMatchObject({
            trigger: "axis",
            backgroundColor: chartTheme.background,
            borderColor: chartTheme.stroke,
            textStyle: { color: chartTheme.text, fontSize: 11 },
        });
        expect(o.tooltip.confine).toBe(false);
        expect(o.tooltip.axisPointer).toBeUndefined();
        expect(o.yAxis?.splitLine?.lineStyle?.type).toBeUndefined();
    });
});

describe("AI review amplification trend conventions", () => {
    beforeEach(() => chartSpy.mockClear());

    it("draws a dot on an isolated point and on the last point; gaps stay gaps", () => {
        const rows = [
            { bucket: "AI_ASSISTED", day: "2026-06-02", reviewAmplification: 1.2 },
            { bucket: "AI_ASSISTED", day: "2026-06-04", reviewAmplification: 1.4 },
            { bucket: "AI_ASSISTED", day: "2026-06-05", reviewAmplification: 1.5 },
            { bucket: "AI_ASSISTED", day: "2026-06-01", reviewAmplification: null },
            { bucket: "AI_ASSISTED", day: "2026-06-03", reviewAmplification: null },
        ];
        render(<AIReviewAmplificationTrend daily={rows as never} />);
        const o = option();
        // days: 06-01 gap, 06-02 isolated, 06-03 gap, 06-04 and 06-05 connected (last).
        expect(sizes(0, 5)).toEqual([0, 8, 0, 0, 8]);
        expect(o.series[0].showAllSymbol).toBe(true);
        expect(o.tooltip.axisPointer?.lineStyle.color).toBe(chartTheme.muted);
        expect(o.yAxis?.splitLine?.lineStyle?.type).toBeUndefined();
        // One bucket: the legend is the only place the bucket is named, so it stays.
        expect(o.legend?.data).toEqual(["Ai Assisted"]);
    });
});
