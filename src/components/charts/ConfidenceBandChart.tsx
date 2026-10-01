"use client";

import type { CSSProperties } from "react";
import { useMemo } from "react";

import type { LineSeriesOption } from "echarts";
import { LineChart } from "echarts/charts";

import { Chart } from "./Chart";
import { useChartColors, useChartTheme } from "./chartTheme";
import { echarts } from "@/lib/echartsInit";

echarts.use([LineChart]);

type ConfidenceBandChartProps = {
    backlogSize: number;
    p50Days: number;
    p85Days: number;
    p95Days: number;
    /** Dates of the three percentile completions (ISO), shown on the markers. */
    p50Date?: string;
    p85Date?: string;
    p95Date?: string;
    throughputMean: number;
    mode?: "burndown" | "burnup";
    height?: number | string;
    width?: number | string;
    className?: string;
    style?: CSSProperties;
};

function generateProjection(
    backlog: number,
    throughput: number,
    days: number,
    mode: "burndown" | "burnup",
): number[] {
    const result: number[] = [];
    let remaining = backlog;

    for (let d = 0; d <= days; d++) {
        if (mode === "burndown") {
            result.push(Math.max(0, remaining));
        } else {
            result.push(Math.min(backlog, backlog - remaining));
        }
        remaining -= throughput;
    }

    return result;
}

const formatMarkerDate = (value: string | undefined): string | null => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

/** "P85 · Oct 1 · 3 days": percentile, completion date when known, days. */
export const markerLabel = (name: string, date: string | undefined, days: number): string =>
    [name, formatMarkerDate(date), `${days} ${days === 1 ? "day" : "days"}`]
        .filter(Boolean)
        .join(" · ");

/** Vertical room one marker label row needs, so the three labels never overlap. */
const LABEL_ROW = 14;

function generateDayLabels(days: number): string[] {
    const labels: string[] = [];
    for (let d = 0; d <= days; d++) {
        if (d === 0) {
            labels.push("Today");
        } else {
            labels.push(`Day ${d}`);
        }
    }
    return labels;
}

export function ConfidenceBandChart({
    backlogSize,
    p50Days,
    p85Days,
    p95Days,
    p50Date,
    p85Date,
    p95Date,
    throughputMean,
    mode = "burndown",
    height = 320,
    width = "100%",
    className,
    style,
}: ConfidenceBandChartProps) {
    const chartTheme = useChartTheme();
    // One hue, ordinal by percentile (strength), in the first series token.
    const tide = useChartColors()[0] ?? chartTheme.accent1;
    const mergedStyle: CSSProperties = { height, width, ...style };

    const maxDays = Math.max(p95Days, 1);
    const lowVariance = p50Days === p85Days && p85Days === p95Days;
    const dayLabels = useMemo(() => generateDayLabels(maxDays), [maxDays]);

    const projection = useMemo(
        () => generateProjection(backlogSize, throughputMean, maxDays, mode),
        [backlogSize, throughputMean, maxDays, mode],
    );

    const p50Band = useMemo(() => {
        return dayLabels.map((_, i) => {
            if (i <= p50Days) return projection[i];
            return mode === "burndown" ? 0 : backlogSize;
        });
    }, [dayLabels, p50Days, projection, mode, backlogSize]);

    const p85Band = useMemo(() => {
        return dayLabels.map((_, i) => {
            if (i <= p85Days) return projection[i];
            return mode === "burndown" ? 0 : backlogSize;
        });
    }, [dayLabels, p85Days, projection, mode, backlogSize]);

    const p95Band = useMemo(() => {
        return dayLabels.map((_, i) => {
            if (i <= p95Days) return projection[i];
            return mode === "burndown" ? 0 : backlogSize;
        });
    }, [dayLabels, p95Days, projection, mode, backlogSize]);

    // The percentile markers: dashed vertical lines with a label (percentile, date, days) and a
    // dot on the burn line. They belong INSIDE a series: ECharts ignores a top-level markLine.
    const marks = useMemo((): Pick<LineSeriesOption, "markLine" | "markPoint"> => {
        const points = lowVariance
            ? [{ name: "Low variance", day: p50Days, date: p50Date }]
            : [
                  { name: "P50", day: p50Days, date: p50Date },
                  { name: "P85", day: p85Days, date: p85Date },
                  { name: "P95", day: p95Days, date: p95Date },
              ];
        return {
            markLine: {
                silent: true,
                symbol: ["none", "none"] as ["none", "none"],
                data: points.map((point, index) => ({
                    xAxis: dayLabels[Math.min(point.day, dayLabels.length - 1)],
                    // the recommended P85 is the heavier line
                    lineStyle: {
                        type: "dashed" as const,
                        color: tide,
                        width: point.name === "P85" ? 2 : 1,
                    },
                    label: {
                        show: true,
                        formatter: markerLabel(point.name, point.date, point.day),
                        position: "end" as const,
                        // a label near the right edge is right-aligned so it is never clipped
                        align: (point.day >= maxDays * 0.85 ? "right" : "center") as
                            "right" | "center",
                        // one row per percentile, so the three labels never collide
                        offset: [0, -index * LABEL_ROW] as [number, number],
                        color: chartTheme.text,
                        fontSize: 11,
                        fontWeight: point.name === "P85" ? 700 : 500,
                    },
                })),
            },
            markPoint: {
                silent: true,
                symbol: "circle",
                symbolSize: 9,
                itemStyle: { color: tide, borderColor: chartTheme.background, borderWidth: 2 },
                label: { show: false },
                data: points.map((point) => ({
                    name: point.name,
                    coord: [
                        dayLabels[Math.min(point.day, dayLabels.length - 1)],
                        projection[Math.min(point.day, projection.length - 1)] ?? 0,
                    ],
                })),
            },
        };
    }, [
        chartTheme.background,
        chartTheme.text,
        dayLabels,
        lowVariance,
        maxDays,
        p50Date,
        p50Days,
        p85Date,
        p85Days,
        p95Date,
        p95Days,
        projection,
        tide,
    ]);

    const option = useMemo(
        () => ({
            tooltip: {
                trigger: "axis" as const,
                confine: true,
                backgroundColor: chartTheme.background,
                borderColor: chartTheme.stroke,
                textStyle: { color: chartTheme.text },
                formatter: (params: unknown) => {
                    if (!Array.isArray(params) || params.length === 0) return "";
                    const first = params[0] as { axisValue?: string; dataIndex?: number };
                    const day = first.axisValue ?? "";
                    const dayIndex = first.dataIndex ?? 0;
                    const remaining = projection[dayIndex] ?? 0;

                    let completionInfo = "";
                    if (lowVariance && dayIndex === p50Days) {
                        completionInfo = `<div style="color: ${tide}; margin-top: 4px;">Low variance completion point</div>`;
                    } else if (dayIndex === p50Days) {
                        completionInfo = `<div style="color: ${tide}; margin-top: 4px;">P50 completion point</div>`;
                    } else if (dayIndex === p85Days) {
                        completionInfo = `<div style="color: ${tide}; margin-top: 4px;">P85 completion point (recommended)</div>`;
                    } else if (dayIndex === p95Days) {
                        completionInfo = `<div style="color: ${tide}; margin-top: 4px;">P95 completion point (conservative)</div>`;
                    }

                    return `
            <div style="font-weight: 600;">${day}</div>
            <div style="margin-top: 4px;">
              ${mode === "burndown" ? "Remaining" : "Completed"}: <strong>${Math.round(remaining)}</strong> items
            </div>
            ${completionInfo}
          `;
                },
            },
            legend: {
                data: lowVariance
                    ? ["Low variance forecast"]
                    : ["P50 (Optimistic)", "P85 (Target)", "P95 (Conservative)"],
                bottom: 0,
                left: "center",
                textStyle: { color: chartTheme.muted, fontSize: 11 },
                itemWidth: 12,
                itemHeight: 8,
            },
            // room above the plot for the staggered marker labels (one row per percentile)
            grid: {
                left: 48,
                right: 24,
                top: 24 + (lowVariance ? 0 : 2) * LABEL_ROW,
                bottom: 48,
            },
            xAxis: {
                type: "category" as const,
                data: dayLabels,
                boundaryGap: false,
                axisLine: { lineStyle: { color: chartTheme.grid } },
                axisLabel: {
                    color: chartTheme.muted,
                    fontSize: 10,
                    interval: Math.floor(maxDays / 6),
                },
            },
            yAxis: {
                type: "value" as const,
                name: mode === "burndown" ? "Items Remaining" : "Items Completed",
                nameLocation: "middle" as const,
                nameGap: 35,
                nameTextStyle: { color: chartTheme.muted, fontSize: 11 },
                axisLine: { show: false },
                axisTick: { show: false },
                // hairline, solid
                splitLine: {
                    lineStyle: { color: chartTheme.grid, type: "solid" as const, width: 1 },
                },
                axisLabel: { color: chartTheme.muted, fontSize: 10 },
                min: 0,
                max: backlogSize,
            },
            series: lowVariance
                ? [
                      {
                          name: "Low variance forecast",
                          type: "line" as const,
                          data: p50Band,
                          smooth: true,
                          lineStyle: { width: 2, color: tide },
                          showSymbol: false,
                          itemStyle: { color: tide },
                          areaStyle: {
                              opacity: 0.3,
                              color: tide,
                          },
                          ...marks,
                          z: 3,
                      },
                  ]
                : [
                      {
                          name: "P95 (Conservative)",
                          type: "line" as const,
                          data: p95Band,
                          smooth: true,
                          lineStyle: { width: 0 },
                          showSymbol: false,
                          itemStyle: { color: tide },
                          areaStyle: {
                              opacity: 0.15,
                              color: tide,
                          },
                          z: 1,
                      },
                      {
                          name: "P85 (Target)",
                          type: "line" as const,
                          data: p85Band,
                          smooth: true,
                          lineStyle: { width: 0 },
                          showSymbol: false,
                          itemStyle: { color: tide },
                          areaStyle: {
                              opacity: 0.25,
                              color: tide,
                          },
                          z: 2,
                      },
                      {
                          name: "P50 (Optimistic)",
                          type: "line" as const,
                          data: p50Band,
                          smooth: true,
                          lineStyle: { width: 2, color: tide },
                          showSymbol: false,
                          itemStyle: { color: tide },
                          areaStyle: {
                              opacity: 0.35,
                              color: tide,
                          },
                          ...marks,
                          z: 3,
                      },
                  ],
        }),
        [
            chartTheme,
            marks,
            tide,
            dayLabels,
            maxDays,
            mode,
            backlogSize,
            projection,
            p50Band,
            p85Band,
            p95Band,
            p50Days,
            p85Days,
            p95Days,
            lowVariance,
        ],
    );

    return (
        <Chart option={option} className={className} style={mergedStyle} chartTheme={chartTheme} />
    );
}
