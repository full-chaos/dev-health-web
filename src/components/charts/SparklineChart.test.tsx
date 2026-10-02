import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@/test/utils";

import type { EChartsOption } from "echarts";
import { SVGRenderer } from "echarts/renderers";
import { echarts } from "@/lib/echartsInit";

import {
    SparklineChart,
    TILE_SPARK,
    tileSparkRange,
    formatSparklineTooltipDate,
    formatSparklineTooltipValue,
} from "./SparklineChart";

const { chartSpy } = vi.hoisted(() => ({ chartSpy: vi.fn() }));

vi.mock("./chartTheme", () => ({
    useChartTheme: () => ({
        text: "#111",
        grid: "#eee",
        muted: "#666",
        background: "#fff",
        stroke: "#ddd",
        accent1: "#00f",
        accent2: "#70f",
        accent3: "#f00",
    }),
    useChartColors: () => ["#0b8fb0", "#c98500"],
    useChartTokens: () => ({ negative: "#ff8266" }),
}));

vi.mock("./Chart", () => ({
    Chart: (props: unknown) => {
        chartSpy(props);
        return <div data-testid="sparkline-chart" />;
    },
}));

describe("formatSparklineTooltipDate", () => {
    it("formats an ISO datetime string as a short date (not the raw ISO)", () => {
        // Raw input mirrors what Pydantic serialises: YYYY-MM-DDT00:00:00
        const result = formatSparklineTooltipDate("2026-06-04T00:00:00");
        // Must NOT echo back the raw ISO string
        expect(result).not.toBe("2026-06-04T00:00:00");
        // Must contain the day number
        expect(result).toMatch(/4/);
        // Must contain a month abbreviation
        expect(result).toMatch(/Jun/i);
    });

    it("formats a plain ISO date string (no time component)", () => {
        const result = formatSparklineTooltipDate("2026-01-15");
        expect(result).not.toBe("2026-01-15");
        expect(result).toMatch(/15/);
        expect(result).toMatch(/Jan/i);
    });

    it("returns the raw string unchanged for non-date input", () => {
        expect(formatSparklineTooltipDate("not-a-date")).toBe("not-a-date");
        expect(formatSparklineTooltipDate("Week 42")).toBe("Week 42");
        expect(formatSparklineTooltipDate("Sprint 3")).toBe("Sprint 3");
    });

    it("handles numeric categories by converting to string", () => {
        // Numeric index categories (e.g. 1, 2, 3) should return the raw stringified number
        // because integers are not valid dates
        expect(formatSparklineTooltipDate(1)).toBe("1");
        expect(formatSparklineTooltipDate(42)).toBe("42");
    });
});

describe("formatSparklineTooltipValue", () => {
    it("rounds numeric tooltip values instead of exposing floating-point precision", () => {
        expect(formatSparklineTooltipValue(0.6889888599537036)).toBe("0.7");
        expect(formatSparklineTooltipValue(11993.3875352)).toBe("11,993.4");
    });

    it("preserves non-numeric tooltip values", () => {
        expect(formatSparklineTooltipValue("No data")).toBe("No data");
        expect(formatSparklineTooltipValue(undefined)).toBe("");
    });
});

describe("formatSparklineTooltipValue with a null (missing) value", () => {
    it("says there is no data instead of printing nothing or 0", () => {
        expect(formatSparklineTooltipValue(null as unknown as undefined)).toBe("No data");
    });
    it("still formats a produced 0", () => {
        expect(formatSparklineTooltipValue(0)).toBe("0");
    });
});

describe("SparklineChart tooltip with a null (missing) point", () => {
    beforeEach(() => chartSpy.mockClear());

    const tooltip = () =>
        (chartSpy.mock.calls.at(-1)?.[0] as { option: Record<string, unknown> }).option as {
            series: Array<{ data: Array<number | null> }>;
            tooltip: { formatter: (p: unknown) => string };
        };

    it("passes the null through as a gap and says 'No data' when ECharts hands undefined to the tooltip", () => {
        render(<SparklineChart data={[3, null, 5]} categories={["a", "b", "c"]} />);
        const option = tooltip();
        expect(option.series[0].data).toEqual([3, null, 5]);
        expect(option.tooltip.formatter([{ axisValue: "b", value: undefined }])).toContain(
            "No data",
        );
        expect(option.tooltip.formatter([{ axisValue: "b", value: null }])).toContain("No data");
    });

    it("still formats a produced 0", () => {
        render(<SparklineChart data={[0, 1]} categories={["a", "b"]} />);
        expect(tooltip().tooltip.formatter([{ axisValue: "a", value: 0 }])).toMatch(/:\s*0$/);
    });
});

describe("SparklineChart tile variant (the trend mark of a metric tile)", () => {
    beforeEach(() => chartSpy.mockClear());

    type Series = {
        smooth: boolean;
        data: Array<number | null>;
        symbolSize: (v: unknown, p: { dataIndex: number }) => number;
        lineStyle: { width: number; color?: string; cap: string; join: string };
        areaStyle: { opacity: number; color?: string };
        itemStyle: { color: string; borderColor?: string; borderWidth?: number };
    };
    const option = () =>
        (
            chartSpy.mock.calls.at(-1)?.[0] as {
                option: { grid: unknown; series: Series[]; yAxis: Record<string, unknown> };
            }
        ).option;
    const sizes = (n: number) =>
        Array.from({ length: n }, (_, i) => option().series[0].symbolSize(null, { dataIndex: i }));

    it("draws a thin muted line with straight segments over a faint muted area", () => {
        render(<SparklineChart variant="tile" data={[1, 3, 2]} categories={["a", "b", "c"]} />);
        const series = option().series[0];
        expect(series.smooth).toBe(false);
        expect(series.lineStyle).toEqual({
            width: 1.5,
            cap: "round",
            join: "round",
            color: "#666",
        });
        expect(series.areaStyle).toEqual({ opacity: 0.14, color: "#666" });
        expect(option().grid).toEqual(TILE_SPARK.grid);
    });

    it("puts a small unringed dot on the last point only, in the first series color", () => {
        render(<SparklineChart variant="tile" data={[1, 3, 2]} categories={["a", "b", "c"]} />);
        expect(sizes(3)).toEqual([0, 0, 5]);
        expect(option().series[0].itemStyle).toEqual({ color: "#0b8fb0" });
    });

    it("tone 'bad' colors the dot with the negative status color; the line stays muted", () => {
        render(
            <SparklineChart
                variant="tile"
                tone="bad"
                data={[1, 3, 2]}
                categories={["a", "b", "c"]}
            />,
        );
        expect(option().series[0].itemStyle).toEqual({ color: "#ff8266" });
        expect(option().series[0].lineStyle.color).toBe("#666");
    });

    it("keeps a gap as a gap and dots an isolated point", () => {
        render(
            <SparklineChart
                variant="tile"
                data={[null, 5, null, 7, 8]}
                categories={["a", "b", "c", "d", "e"]}
            />,
        );
        expect(option().series[0].data).toEqual([null, 5, null, 7, 8]);
        expect(sizes(5)).toEqual([0, 5, 0, 0, 5]);
    });

    it("the default variant is unchanged: smoothed, 2px line, ringed 8px muted dot, and tone is ignored", () => {
        render(<SparklineChart tone="bad" data={[1, 3, 2]} categories={["a", "b", "c"]} />);
        const series = option().series[0];
        expect(series.smooth).toBe(true);
        expect(series.lineStyle).toEqual({ width: 2, cap: "round", join: "round" });
        expect(series.areaStyle).toEqual({ opacity: 0.15 });
        expect(series.itemStyle).toEqual({ color: "#666", borderColor: "#fff", borderWidth: 2 });
        expect(sizes(3)).toEqual([0, 0, 8]);
        expect(option().grid).toEqual({ left: 8, right: 8, top: 10, bottom: 10 });
    });

    it("scales the tile from the lowest to the highest served point (shape, not magnitude)", () => {
        render(<SparklineChart variant="tile" data={[86, 88, 85]} categories={["a", "b", "c"]} />);
        expect(option().yAxis).toMatchObject({ type: "value", min: 85, max: 88 });
    });

    it("draws a flat series as a line through the middle", () => {
        render(<SparklineChart variant="tile" data={[60, 60, 60]} categories={["a", "b", "c"]} />);
        expect(option().yAxis).toMatchObject({ min: 59, max: 61 });
    });

    it("leaves gaps out of the range, and a single point is only the dot", () => {
        render(
            <SparklineChart
                variant="tile"
                data={[null, 5, null, 7]}
                categories={["a", "b", "c", "d"]}
            />,
        );
        expect(option().yAxis).toMatchObject({ min: 5, max: 7 });
        chartSpy.mockClear();
        render(<SparklineChart variant="tile" data={[4]} categories={["a"]} />);
        expect(option().yAxis).toMatchObject({ min: 3, max: 5 });
        expect(sizes(1)).toEqual([5]);
    });

    it("the default variant keeps its axis: no min and no max (it includes 0)", () => {
        render(<SparklineChart data={[86, 88, 85]} categories={["a", "b", "c"]} />);
        expect(option().yAxis).not.toHaveProperty("min");
        expect(option().yAxis).not.toHaveProperty("max");
    });

    it("drawn for real at 87x31, the tile line reaches the top and the bottom of its plot", () => {
        render(<SparklineChart variant="tile" data={[86, 88, 85]} categories={["a", "b", "c"]} />);
        echarts.use([SVGRenderer]);
        const chart = echarts.init(null, null, {
            renderer: "svg",
            ssr: true,
            width: 87,
            height: 31,
        });
        chart.setOption(chartSpy.mock.calls.at(-1)?.[0].option as EChartsOption);
        const svg = chart.renderToSVGString();
        chart.dispose();
        // The line is the unfilled path in the muted ink; read its y values.
        const line = [
            ...svg.matchAll(/<path d="([^"]+)"[^>]*fill="none"[^>]*stroke="#666"/g),
        ][0]?.[1];
        expect(line).toBeTruthy();
        const ys = [...(line ?? "").matchAll(/[ML]\s*[-\d.]+[ ,]([-\d.]+)/g)].map((m) =>
            Number(m[1]),
        );
        expect(ys).toHaveLength(3);
        // Plot box: top 4, bottom 31 - 4 = 27. 88 is at the top, 85 at the bottom.
        expect(Math.min(...ys)).toBeCloseTo(4, 0);
        expect(Math.max(...ys)).toBeCloseTo(27, 0);
    });
});

describe("tileSparkRange", () => {
    it("is null with no served point", () => {
        expect(tileSparkRange([])).toBeNull();
        expect(tileSparkRange([null, null])).toBeNull();
        expect(tileSparkRange([Number.NaN])).toBeNull();
    });

    it("is min..max of the served points; a flat series gets one unit each side", () => {
        expect(tileSparkRange([3, null, 9, 4])).toEqual({ min: 3, max: 9 });
        expect(tileSparkRange([0, 0])).toEqual({ min: -1, max: 1 });
        expect(tileSparkRange([-2, 5])).toEqual({ min: -2, max: 5 });
    });
});
