import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@/test/utils";

import { ConfidenceBandChart, markerLabel } from "./ConfidenceBandChart";

const chartTheme = {
    text: "#111111",
    grid: "#222222",
    muted: "#333333",
    background: "#ffffff",
    stroke: "#444444",
    accent1: "#aa0001",
    accent2: "#aa0002",
    accent3: "#aa0003",
};
const palette = ["#0b8fb0", "#c98500"];

const { chartSpy } = vi.hoisted(() => ({ chartSpy: vi.fn() }));
vi.mock("./chartTheme", () => ({
    useChartTheme: () => chartTheme,
    useChartColors: () => palette,
}));
vi.mock("./Chart", () => ({
    Chart: (props: unknown) => {
        chartSpy(props);
        return <div data-testid="chart" />;
    },
}));

type Mark = {
    xAxis: string;
    lineStyle: { width: number; color: string };
    label: { formatter: string; offset: [number, number] };
};
type Series = {
    name: string;
    markLine?: { data: Mark[] };
    markPoint?: { data: Array<{ coord: [string, number] }> };
    areaStyle: { color: string };
    lineStyle: { color?: string };
};
type Option = {
    markLine?: unknown;
    series: Series[];
    yAxis: { splitLine: { lineStyle: { type: string } } };
};
const option = () => (chartSpy.mock.calls.at(-1)![0] as { option: Option }).option;
const marked = () => option().series.filter((s) => s.markLine);

const dates = {
    p50Date: "2026-10-01T12:00:00Z",
    p85Date: "2026-10-03T12:00:00Z",
    p95Date: "2026-10-05T12:00:00Z",
};

describe("ConfidenceBandChart percentile markers", () => {
    beforeEach(() => chartSpy.mockClear());

    it("draws the markers INSIDE a series: ECharts ignores a top-level markLine", () => {
        render(
            <ConfidenceBandChart
                backlogSize={20}
                p50Days={2}
                p85Days={4}
                p95Days={6}
                throughputMean={4}
                {...dates}
            />,
        );
        expect(option().markLine).toBeUndefined();
        expect(marked()).toHaveLength(1);
    });

    it("one dashed line per percentile at its day, labelled percentile, date and days", () => {
        render(
            <ConfidenceBandChart
                backlogSize={20}
                p50Days={2}
                p85Days={4}
                p95Days={6}
                throughputMean={4}
                {...dates}
            />,
        );
        const lines = marked()[0].markLine!.data;
        expect(lines.map((l) => l.xAxis)).toEqual(["Day 2", "Day 4", "Day 6"]);
        expect(lines.map((l) => l.label.formatter)).toEqual([
            "P50 · Oct 1 · 2 days",
            "P85 · Oct 3 · 4 days",
            "P95 · Oct 5 · 6 days",
        ]);
    });

    it("the recommended P85 is the heavier line, and labels stagger one row each", () => {
        render(
            <ConfidenceBandChart
                backlogSize={20}
                p50Days={2}
                p85Days={4}
                p95Days={6}
                throughputMean={4}
            />,
        );
        const lines = marked()[0].markLine!.data;
        expect(lines.map((l) => l.lineStyle.width)).toEqual([1, 2, 1]);
        expect(new Set(lines.map((l) => l.label.offset[1])).size).toBe(3);
    });

    it("a dot sits on the burn line at each percentile day", () => {
        render(
            <ConfidenceBandChart
                backlogSize={20}
                p50Days={2}
                p85Days={4}
                p95Days={6}
                throughputMean={4}
            />,
        );
        // burn: 20, 16, 12, 8, 4, 0, 0
        const coords = marked()[0].markPoint!.data.map((d) => d.coord);
        expect(coords).toEqual([
            ["Day 2", 12],
            ["Day 4", 4],
            ["Day 6", 0],
        ]);
    });

    it("a low-variance forecast draws one marker", () => {
        render(
            <ConfidenceBandChart
                backlogSize={5}
                p50Days={3}
                p85Days={3}
                p95Days={3}
                throughputMean={2}
                p50Date="2026-10-02T12:00:00Z"
            />,
        );
        expect(option().series).toHaveLength(1);
        expect(marked()[0].markLine!.data).toHaveLength(1);
        expect(marked()[0].markLine!.data[0].label.formatter).toBe("Low variance · Oct 2 · 3 days");
    });

    it("a missing date is left out of the label, not invented", () => {
        expect(markerLabel("P50", undefined, 1)).toBe("P50 · 1 day");
        expect(markerLabel("P50", "not a date", 2)).toBe("P50 · 2 days");
    });

    it("colors come from the series token (one hue), never the accent colors; grid is a solid hairline", () => {
        render(
            <ConfidenceBandChart
                backlogSize={20}
                p50Days={2}
                p85Days={4}
                p95Days={6}
                throughputMean={4}
            />,
        );
        for (const series of option().series) {
            expect(series.areaStyle.color).toBe(palette[0]);
        }
        const json = JSON.stringify(option());
        for (const accent of [chartTheme.accent1, chartTheme.accent2, chartTheme.accent3]) {
            expect(json).not.toContain(accent);
        }
        expect(option().yAxis.splitLine.lineStyle.type).toBe("solid");
    });
});
