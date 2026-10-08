import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@/test/utils";

import {
    POINT_LABEL_SERIES_ID,
    QuadrantChart,
    buildQuadrantOption,
    quadrantGrid,
} from "./QuadrantChart";
import type { QuadrantResponse } from "@/lib/types";
import { chartEntityLabel } from "@/lib/labels/entityLabel";

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
        return <div data-testid="quadrant-chart" />;
    },
}));

const sampleData: QuadrantResponse = {
    axes: {
        x: { metric: "cycle_time", label: "Cycle Time", unit: "days" },
        y: { metric: "throughput", label: "Throughput", unit: "items" },
    },
    points: [
        {
            entity_id: "team-a",
            entity_label: "Team A",
            x: 4.2,
            y: 18,
            window_start: "2026-01-01",
            window_end: "2026-01-31",
            evidence_link: "/evidence/team-a",
        },
    ],
    annotations: [],
};

describe("QuadrantChart", () => {
    beforeEach(() => {
        chartSpy.mockClear();
    });

    it("renders without crashing", () => {
        render(<QuadrantChart data={sampleData} />);

        expect(screen.getByTestId("quadrant-chart")).toBeInTheDocument();
        expect(chartSpy).toHaveBeenCalledTimes(1);
    });

    it("renders with sample data and forwards props", () => {
        render(<QuadrantChart data={sampleData} className="chart-shell" height={420} />);

        const props = chartSpy.mock.calls[0][0] as {
            option: {
                xAxis: { name: string };
                series: Array<{ data: unknown[] }>;
            };
            className: string;
            style: { height: number; width: string };
            onEvents: { click: (params: unknown) => void };
        };

        expect(props.className).toBe("chart-shell");
        expect(props.style).toMatchObject({ height: 420, width: "100%" });
        expect(props.option.xAxis.name).toContain("Cycle Time (days)");
        expect(props.option.series[0]?.data).toHaveLength(1);
        expect(typeof props.onEvents.click).toBe("function");
    });

    it("draws a percent axis 0 to 100 in steps of 25 when every served value is in that range (display only)", () => {
        const percentData: QuadrantResponse = {
            axes: {
                x: { metric: "pipeline_success_rate", label: "Pipeline Success Rate", unit: "%" },
                y: { metric: "test_pass_rate", label: "Test Pass Rate", unit: "%" },
            },
            points: [
                { ...sampleData.points[0], entity_id: "r1", x: 100, y: 96.5 },
                { ...sampleData.points[0], entity_id: "r2", x: 62, y: 100 },
            ],
            annotations: [],
        };
        const option = buildQuadrantOption({ data: percentData, chartTheme, colors: chartColors });
        const axes = option as unknown as {
            xAxis: Record<string, unknown>;
            yAxis: Record<string, unknown>;
        };
        for (const axis of [axes.xAxis, axes.yAxis]) {
            expect(axis).toMatchObject({ min: 0, max: 100, interval: 25 });
        }
        // The served values are drawn as served.
        const series = option.series as Array<{ data?: Array<{ value?: number[] }> }>;
        const drawn = series.flatMap((s) =>
            (s.data ?? []).flatMap((d) => (Array.isArray(d?.value) ? [d.value.slice(0, 2)] : [])),
        );
        expect(drawn).toEqual(
            expect.arrayContaining([
                [100, 96.5],
                [62, 100],
            ]),
        );
    });

    it("keeps the automatic range on a percent axis with a value outside 0 to 100, and on other units", () => {
        const over: QuadrantResponse = {
            axes: {
                x: { metric: "growth", label: "Growth", unit: "%" },
                y: { metric: "throughput", label: "Throughput", unit: "items" },
            },
            points: [{ ...sampleData.points[0], x: 140, y: 80 }],
            annotations: [],
        };
        const negative: QuadrantResponse = {
            ...over,
            axes: { ...over.axes, y: { metric: "delta", label: "Change", unit: "%" } },
            points: [{ ...sampleData.points[0], x: 140, y: -12 }],
        };
        const below = buildQuadrantOption({
            data: negative,
            chartTheme,
            colors: chartColors,
        }) as unknown as {
            yAxis: { min?: number; max?: number };
        };
        expect(below.yAxis.max).toBeUndefined();
        expect(below.yAxis.min).toBeUndefined();
        const axes = buildQuadrantOption({
            data: over,
            chartTheme,
            colors: chartColors,
        }) as unknown as {
            xAxis: { max?: number };
            yAxis: { max?: number };
        };
        expect(axes.xAxis.max).toBeUndefined();
        expect(axes.yAxis.max).toBeUndefined();
        const plain = buildQuadrantOption({
            data: sampleData,
            chartTheme,
            colors: chartColors,
        }) as unknown as { xAxis: { max?: number }; yAxis: { max?: number } };
        expect(plain.xAxis.max).toBeUndefined();
        expect(plain.yAxis.max).toBeUndefined();
    });

    it("gives the plot room for a point label on the right and top edges (a label is never clipped)", () => {
        const edge: QuadrantResponse = {
            axes: {
                x: { metric: "pipeline_success_rate", label: "Pipeline Success Rate", unit: "%" },
                y: { metric: "test_pass_rate", label: "Test Pass Rate", unit: "%" },
            },
            points: [
                {
                    ...sampleData.points[0],
                    entity_id: "repo-edge",
                    entity_label: "full-chaos/cloudymccloudflare",
                    x: 100,
                    y: 100,
                },
            ],
            annotations: [],
        };
        const option = buildQuadrantOption({
            data: edge,
            chartTheme,
            colors: chartColors,
            scopeType: "repo",
        }) as unknown as { grid: { right: number; top: number; containLabel: boolean } };
        // The label as drawn (the shared chart label: the repository name without its owner).
        const label = chartEntityLabel("full-chaos/cloudymccloudflare");
        expect(label).toBe("cloudymccloudflare");
        // Half the label (it is centred on the dot) fits right of the plot; the label fits above it.
        expect(option.grid.right).toBeGreaterThanOrEqual(Math.ceil((label.length * 6.5) / 2));
        // A label line and its gap to the dot (22px) plus a margin: more than the 24px inset.
        expect(option.grid.top).toBeGreaterThanOrEqual(30);
        expect(option.grid.containLabel).toBe(true);
        // Without point labels the plot keeps its old insets.
        expect(quadrantGrid([])).toEqual({
            left: 48,
            right: 24,
            top: 24,
            bottom: 48,
            containLabel: true,
        });
    });

    it("draws team / repo point labels in a silent label series above every dot (no dot covers a label)", () => {
        const crowded: QuadrantResponse = {
            ...sampleData,
            points: [
                {
                    ...sampleData.points[0],
                    entity_id: "r1",
                    entity_label: "acme/api",
                    x: 82,
                    y: 97,
                },
                {
                    ...sampleData.points[0],
                    entity_id: "r2",
                    entity_label: "acme/web",
                    x: 83,
                    y: 95,
                },
            ],
        };
        const option = buildQuadrantOption({
            data: crowded,
            chartTheme,
            colors: chartColors,
            scopeType: "repo",
        });
        type Series = {
            id?: string;
            z?: number;
            silent?: boolean;
            label?: { show?: boolean; textBorderColor?: string; position?: string };
            labelLayout?: unknown;
            itemStyle?: { opacity?: number; color?: string };
            data?: Array<{ value?: number[] }>;
        };
        const series = option.series as Series[];
        const labels = series.find((s) => s.id === POINT_LABEL_SERIES_ID);
        expect(labels).toBeDefined();
        // Above every dot series, invisible dots, no mouse events.
        const dotZ = series.filter((s) => s !== labels).map((s) => s.z ?? 0);
        expect(labels?.z).toBeGreaterThan(Math.max(...dotZ));
        expect(labels?.silent).toBe(true);
        // Invisible dots by a transparent color: an item opacity of 0 would hide the labels too.
        expect(labels?.itemStyle).toEqual({ color: "transparent" });
        expect(labels?.label).toMatchObject({
            show: true,
            position: "top",
            textBorderColor: chartTheme.background,
        });
        expect(labels?.labelLayout).toEqual({ hideOverlap: true, moveOverlap: "shiftY" });
        // The same served points as the dots.
        expect(labels?.data?.map((d) => d.value)).toEqual([
            [82, 97],
            [83, 95],
        ]);
        // The dot series draws no labels of its own.
        expect(series[0].label?.show).not.toBe(true);
        // A person chart draws no point labels.
        const person = buildQuadrantOption({
            data: crowded,
            chartTheme,
            colors: chartColors,
            scopeType: "person",
        });
        expect((person.series as Series[]).some((s) => s.id === POINT_LABEL_SERIES_ID)).toBe(false);
        // An org chart draws no point labels either (only team / repo charts do).
        const org = buildQuadrantOption({
            data: crowded,
            chartTheme,
            colors: chartColors,
            scopeType: "org",
        });
        expect((org.series as Series[]).some((s) => s.id === POINT_LABEL_SERIES_ID)).toBe(false);
    });

    it("handles empty data and null click payload gracefully", () => {
        render(
            <QuadrantChart
                data={{
                    ...sampleData,
                    points: [],
                    annotations: [],
                }}
            />,
        );

        const props = chartSpy.mock.calls[0][0] as {
            option: { series: Array<{ data: unknown[] }> };
            onEvents: { click: (params: unknown) => void };
        };

        expect(props.option.series[0]?.data).toHaveLength(0);
        expect(() => props.onEvents.click(null)).not.toThrow();
    });

    it("degrades a raw UUID entity_label to Unresolved in the tooltip (A7)", () => {
        const UUID = "550e8400-e29b-41d4-a716-446655440000";
        const option = buildQuadrantOption({
            data: {
                axes: {
                    x: { metric: "x", label: "Cycle Time", unit: "days" },
                    y: { metric: "y", label: "Throughput", unit: "items" },
                },
                points: [
                    {
                        entity_id: UUID,
                        entity_label: UUID,
                        x: 1,
                        y: 2,
                        window_start: "",
                        window_end: "",
                        evidence_link: "",
                    },
                ],
                annotations: [],
            },
            chartTheme,
            colors: chartColors,
            scopeType: "repo",
        });

        const formatter = (option.tooltip as { formatter: (params: unknown) => string }).formatter;
        const html = formatter({
            componentType: "scatter",
            data: { point: { entity_id: UUID, entity_label: UUID, x: 1, y: 2 } },
        });

        expect(html).toContain("Unresolved");
        expect(html).not.toContain(UUID);
    });

    it("renders a readable entity_label unchanged in the tooltip", () => {
        const option = buildQuadrantOption({
            data: sampleData,
            chartTheme,
            colors: chartColors,
            scopeType: "team",
        });

        const formatter = (option.tooltip as { formatter: (params: unknown) => string }).formatter;
        const html = formatter({
            componentType: "scatter",
            data: { point: sampleData.points[0] },
        });

        expect(html).toContain("Team A");
    });

    it("shows repo point labels when rendered for repo scope", () => {
        const option = buildQuadrantOption({
            data: sampleData,
            chartTheme,
            colors: chartColors,
            scopeType: "repo",
        });

        // Drawn by the label series above the dots (CHAOS-8342 review: no dot covers a label).
        const series = option.series as Array<{ id?: string; label?: { show?: boolean } }>;
        expect(series.find((s) => s.id === POINT_LABEL_SERIES_ID)?.label?.show).toBe(true);
    });
});
