"use client";

import type { CSSProperties } from "react";
import { useMemo } from "react";

import type { EChartsOption } from "echarts";
import { LineChart } from "echarts/charts";

import { Chart } from "./Chart";
import { useChartColors, useChartTheme } from "./chartTheme";
import { echarts } from "@/lib/echartsInit";

echarts.use([LineChart]);

/** One served point of the chance curve: a day and the share of the runs done by that day (0 to 1). */
export type RangePoint = { day: number; share: number };
/** One percentile of the forecast: its served day and its ready label. */
export type RangeMarker = { name: string; day: number; label: string };

type CompletionRangeChartProps = {
    /** The served points, ascending by day, drawn as they are. The chart adds no point. */
    points: RangePoint[];
    /** The forecast's OWN percentile days. A marker stays at its day, also where no point is. */
    markers: RangeMarker[];
    /** The served P50 and P95 days: the "planning range" band behind the curve. */
    planningRange?: { from: number; to: number } | null;
    /** Name of the chance axis ("Chance all 42 items are done"). */
    chanceAxisName: string;
    /** The text of a day on the axis and in the tooltip (its date). */
    dayLabel: (day: number) => string;
    /** The tooltip lines under the day's heading, for one served point. */
    tooltipLines: (point: RangePoint) => string[];
    height?: number | string;
    className?: string;
    style?: CSSProperties;
};

const LABEL_ROW = 14;
/** A marker past this share of the day axis has its label end at its line (not centred on it). */
const RIGHT_LABEL_FROM = 0.85;

/**
 * The "Completion range" curve of a capacity forecast (CHAOS-8477): the chance that the work is
 * done by each day, as the API serves it. One point per served bin of the Monte Carlo
 * distribution, at the served day and the served cumulative share. Between two served days the
 * line is a step: a day nobody finished on keeps the share of the day before. The markers are the
 * forecast's own P50 / P85 / P95 days and the band is the span from P50 to P95.
 */
export function CompletionRangeChart({
    points,
    markers,
    planningRange,
    chanceAxisName,
    dayLabel,
    tooltipLines,
    height = 320,
    className,
    style,
}: CompletionRangeChartProps) {
    const chartTheme = useChartTheme();
    const tide = useChartColors()[0] ?? chartTheme.accent1;
    const mergedStyle: CSSProperties = { height, width: "100%", ...style };

    const option = useMemo((): EChartsOption => {
        const lastDay = Math.max(
            ...points.map((point) => point.day),
            ...markers.map((marker) => marker.day),
        );
        // A little room after the last day, so a marker at the edge and its label are not clipped.
        const pad = Math.max(1, Math.round(lastDay * 0.05));
        const byDay = new Map(points.map((point) => [point.day, point]));

        return {
            tooltip: {
                trigger: "item",
                confine: true,
                backgroundColor: chartTheme.background,
                borderColor: chartTheme.stroke,
                textStyle: { color: chartTheme.text },
                formatter: (params: unknown) => {
                    const data = (params as { data?: [number, number] }).data;
                    if (!data) return "";
                    const point = byDay.get(data[0]) ?? { day: data[0], share: data[1] };
                    const lines = tooltipLines(point)
                        .map((line) => `<div style="margin-top: 4px;">${line}</div>`)
                        .join("");
                    return `<div style="font-weight: 600;">${dayLabel(point.day)}</div>${lines}`;
                },
            },
            // room above the plot for the staggered marker labels (one row per percentile)
            grid: { left: 56, right: 24, top: 24 + markers.length * LABEL_ROW, bottom: 32 },
            xAxis: {
                type: "value",
                // Day 0 is the day the forecast was computed.
                min: 0,
                max: lastDay + pad,
                minInterval: 1,
                axisLine: { lineStyle: { color: chartTheme.grid } },
                axisLabel: {
                    color: chartTheme.muted,
                    fontSize: 10,
                    formatter: (value: number) => dayLabel(value),
                },
                splitLine: { show: false },
            },
            yAxis: {
                type: "value",
                name: chanceAxisName,
                nameLocation: "middle",
                nameGap: 42,
                nameTextStyle: { color: chartTheme.muted, fontSize: 11 },
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: { lineStyle: { color: chartTheme.grid, type: "solid", width: 1 } },
                axisLabel: {
                    color: chartTheme.muted,
                    fontSize: 10,
                    formatter: (value: number) => `${Math.round(value * 100)}%`,
                },
                min: 0,
                max: 1,
            },
            series: [
                {
                    name: "Chance done",
                    type: "line",
                    // The served points as they are; a step between them, never a slope.
                    step: "end",
                    data: points.map((point): [number, number] => [point.day, point.share]),
                    symbol: "circle",
                    symbolSize: 7,
                    lineStyle: { width: 2, color: tide },
                    itemStyle: { color: tide },
                    areaStyle: { color: tide, opacity: 0.1 },
                    markLine: {
                        silent: true,
                        symbol: ["none", "none"],
                        data: markers.map((marker, index) => ({
                            xAxis: marker.day,
                            // the recommended P85 is the heavier line
                            lineStyle: {
                                type: "dashed" as const,
                                color: tide,
                                width: marker.name === "P85" ? 2 : 1,
                            },
                            label: {
                                show: true,
                                formatter: marker.label,
                                position: "end" as const,
                                // Near the right end of the axis a centred label would be cut at
                                // the edge of the chart: it ends at its line.
                                ...(marker.day > (lastDay + pad) * RIGHT_LABEL_FROM
                                    ? { align: "right" as const }
                                    : {}),
                                // one row per percentile, so the labels never collide
                                offset: [0, -index * LABEL_ROW] as [number, number],
                                color: chartTheme.text,
                                fontSize: 11,
                                fontWeight: marker.name === "P85" ? 700 : 500,
                            },
                        })),
                    },
                    ...(planningRange
                        ? {
                              markArea: {
                                  silent: true,
                                  itemStyle: { color: tide, opacity: 0.07 },
                                  label: {
                                      show: true,
                                      position: "insideTopLeft" as const,
                                      color: chartTheme.muted,
                                      fontSize: 10,
                                  },
                                  data: [
                                      [
                                          { xAxis: planningRange.from, name: "planning range" },
                                          { xAxis: planningRange.to },
                                      ],
                                  ] as [[{ xAxis: number; name: string }, { xAxis: number }]],
                              },
                          }
                        : {}),
                },
            ],
        };
    }, [chanceAxisName, chartTheme, dayLabel, markers, planningRange, points, tide, tooltipLines]);

    return <Chart option={option} className={className} style={mergedStyle} />;
}
