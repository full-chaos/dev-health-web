import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@/test/utils";

import { orderTimeseriesPoints } from "./timeseriesData";
import { buildBaselineMarkLine, TimeseriesChart } from "./TimeseriesChart";

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
    useChartColors: () => [],
}));

vi.mock("./Chart", () => ({
    Chart: (props: unknown) => {
        chartSpy(props);
        return <div data-testid="timeseries-chart" />;
    },
}));

describe("orderTimeseriesPoints", () => {
    it("orders by the full ISO day, not the display label, across a year boundary", () => {
        // Deliberately out of order and spanning Dec→Jan; labels are compact "MM-DD".
        // Lexically "01-*" < "12-*", so sorting by the label would wrongly put January
        // first and corrupt the trend line (CHAOS-2079 regression).
        const input = [
            { day: "2027-01-02", value: 5, label: "01-02" },
            { day: "2026-12-30", value: 1, label: "12-30" },
            { day: "2027-01-01", value: 4, label: "01-01" },
            { day: "2026-12-31", value: 2, label: "12-31" },
        ];
        const { categories, values } = orderTimeseriesPoints(input);
        expect(categories).toEqual(["12-30", "12-31", "01-01", "01-02"]);
        expect(values).toEqual([1, 2, 4, 5]);
    });

    it("falls back to `day` for the label when none is provided (back-compat)", () => {
        const { categories } = orderTimeseriesPoints([
            { day: "2026-06-02", value: 1 },
            { day: "2026-06-01", value: 2 },
        ]);
        expect(categories).toEqual(["2026-06-01", "2026-06-02"]);
    });
});

describe("buildBaselineMarkLine", () => {
    const color = "#49454f";

    it("returns undefined when no baseline is provided", () => {
        expect(buildBaselineMarkLine(undefined, color)).toBeUndefined();
    });

    it("returns undefined for a non-finite baseline value", () => {
        expect(buildBaselineMarkLine({ value: Number.NaN }, color)).toBeUndefined();
    });

    it("builds a silent dashed markLine pinned to the baseline value", () => {
        const markLine = buildBaselineMarkLine({ value: 80, label: "Target baseline" }, color);
        expect(markLine).toMatchObject({
            silent: true,
            symbol: "none",
            lineStyle: { type: "dashed", color },
            data: [{ yAxis: 80 }],
        });
        expect(markLine?.label).toMatchObject({ show: true, formatter: "Target baseline" });
    });

    it("hides the label when none is given", () => {
        const markLine = buildBaselineMarkLine({ value: 80 }, color);
        expect(markLine?.label).toMatchObject({ show: false });
    });
});

describe("TimeseriesChart render path", () => {
    beforeEach(() => {
        chartSpy.mockClear();
    });

    type CapturedOption = {
        series: Array<{
            data: number[];
            markLine?: { data: Array<{ yAxis: number }> };
        }>;
    };

    const capturedOption = (): CapturedOption => {
        expect(chartSpy).toHaveBeenCalledTimes(1);
        return (chartSpy.mock.calls[0][0] as { option: CapturedOption }).option;
    };

    it("plots the baseline on the same 0–100 scale as percent series values (CHAOS-2163 gap class)", () => {
        // Coverage-page path: backend percent values arrive already on 0–100.
        // The 80% target must land inside the series range, not at 0.8.
        render(
            <TimeseriesChart
                data={[
                    { day: "2026-06-01", value: 72 },
                    { day: "2026-06-02", value: 85 },
                    { day: "2026-06-03", value: 91 },
                ]}
                valueFormat="percent"
                baseline={{ value: 80, label: "Target baseline" }}
            />,
        );

        const option = capturedOption();
        const series = option.series[0];
        // Series data passes through unscaled (0–100, not 0–1)…
        expect(series.data).toEqual([72, 85, 91]);
        // …and the baseline sits on the same scale, between min and max.
        const baselineY = series.markLine?.data[0]?.yAxis;
        expect(baselineY).toBe(80);
        expect(baselineY).toBeGreaterThan(Math.min(...series.data));
        expect(baselineY).toBeLessThan(Math.max(...series.data));
    });

    it("omits markLine entirely when no baseline is given", () => {
        render(
            <TimeseriesChart
                data={[
                    { day: "2026-06-01", value: 72 },
                    { day: "2026-06-02", value: 85 },
                ]}
            />,
        );

        const series = capturedOption().series[0];
        expect(series.markLine).toBeUndefined();
    });
});
