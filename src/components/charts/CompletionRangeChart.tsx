"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { EChartsOption } from "echarts";
import { LineChart } from "echarts/charts";

import { Chart } from "./Chart";
import { useChartColors, useChartTheme } from "./chartTheme";
import { labelRows, labelWidth } from "./completionRangeLabelRows";
import { echarts } from "@/lib/echartsInit";

echarts.use([LineChart]);

/** One served point of the chance curve: a day and the share of the runs done by that day (0 to 1). */
export type RangePoint = { day: number; share: number };
/**
 * One percentile of the forecast: its served day and its ready label. `label` is the first line
 * ("P50 · Sep 14"); `detail` is the second line under it ("Optimistic · 4 days").
 */
export type RangeMarker = { name: string; day: number; label: string; detail?: string };

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

/** The height of one text line of a marker label. */
const LABEL_LINE = 14;
/** A marker past this share of the day axis has its label end at its line (not centred on it). */
const RIGHT_LABEL_FROM = 0.85;
/** The room of the plot inside the chart, left and right. */
const GRID_LEFT = 56;
const GRID_RIGHT = 24;

/**
 * The "Completion range" curve of a capacity forecast (CHAOS-8477): the chance that the work is
 * done by each day, as the API serves it. One point per served bin of the Monte Carlo
 * distribution, at the served day and the served cumulative share. Between two served days the
 * line is a step: a day nobody finished on keeps the share of the day before. The markers are the
 * forecast's own P50 / P85 / P95 days and the band is the span from P50 to P95.
 *
 * The marker labels sit above the plot (CHAOS-8614). Labels with room share one row, as the
 * prototype draws them; labels that would touch (two percentiles on one day, or on near days) go
 * to different rows. The rows come from the measured width of the chart. Until the width is
 * known each label has its own row, so the labels never print on top of each other.
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

    // The width of the chart, for the label rows. Null until it is measured.
    const frameRef = useRef<HTMLDivElement | null>(null);
    const [width, setWidth] = useState<number | null>(null);
    useEffect(() => {
        const frame = frameRef.current;
        if (!frame || typeof ResizeObserver === "undefined") return;
        // The observer reports the size once when it starts, then on each change.
        const observer = new ResizeObserver((entries) => {
            const measured = entries[0]?.contentRect.width;
            if (typeof measured === "number" && measured > 0) setWidth(Math.round(measured));
        });
        observer.observe(frame);
        return () => observer.disconnect();
    }, []);

    // The end of the day axis: the last day, and a little room after it, so a marker at the edge
    // and its label are not clipped.
    const axisMax = useMemo(() => {
        const lastDay = Math.max(
            ...points.map((point) => point.day),
            ...markers.map((marker) => marker.day),
        );
        return lastDay + Math.max(1, Math.round(lastDay * 0.05));
    }, [markers, points]);

    // The row of each marker label, as one text: the chart is drawn again only when a label
    // changes its row, not on each pixel of a resize.
    const rowsKey = useMemo(() => {
        if (width === null) {
            // Not measured: one row per percentile, so the labels never collide.
            return markers.map((_marker, index) => index).join(",");
        }
        const plotWidth = width - GRID_LEFT - GRID_RIGHT;
        return labelRows(
            markers.map((marker) => ({
                x: GRID_LEFT + (marker.day / axisMax) * plotWidth,
                width: labelWidth([marker.label, marker.detail ?? ""]),
                align: marker.day > axisMax * RIGHT_LABEL_FROM ? "right" : "center",
            })),
        ).join(",");
    }, [axisMax, markers, width]);

    const option = useMemo((): EChartsOption => {
        const byDay = new Map(points.map((point) => [point.day, point]));
        const rows = rowsKey === "" ? [] : rowsKey.split(",").map(Number);
        // One row holds every line of a label ("P50 · Sep 14" over "Optimistic · 4 days").
        const rowHeight = (markers.some((marker) => marker.detail) ? 2 : 1) * LABEL_LINE;
        const rowCount = rows.length === 0 ? 0 : Math.max(...rows) + 1;

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
            // room above the plot for the rows of marker labels
            grid: {
                left: GRID_LEFT,
                right: GRID_RIGHT,
                top: 24 + rowCount * rowHeight,
                bottom: 32,
            },
            xAxis: {
                type: "value",
                // Day 0 is the day the forecast was computed.
                min: 0,
                max: axisMax,
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
                                // Two lines as the prototype: the percentile and its date, then
                                // the role word and the days.
                                formatter: marker.detail
                                    ? `{head|${marker.label}}\n{detail|${marker.detail}}`
                                    : `{head|${marker.label}}`,
                                position: "end" as const,
                                // Near the right end of the axis a centred label would be cut at
                                // the edge of the chart: it ends at its line.
                                ...(marker.day > axisMax * RIGHT_LABEL_FROM
                                    ? { align: "right" as const }
                                    : {}),
                                // the label's row above the plot, so the labels never collide
                                offset: [0, 0 - (rows[index] ?? index) * rowHeight] as [
                                    number,
                                    number,
                                ],
                                rich: {
                                    head: {
                                        color: chartTheme.text,
                                        fontSize: 11,
                                        lineHeight: LABEL_LINE,
                                        // the recommended P85 is the heavier label
                                        fontWeight: marker.name === "P85" ? 700 : 600,
                                    },
                                    detail: {
                                        color: chartTheme.muted,
                                        fontSize: 11,
                                        lineHeight: LABEL_LINE,
                                        fontWeight: 400,
                                    },
                                },
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
    }, [
        axisMax,
        chanceAxisName,
        chartTheme,
        dayLabel,
        markers,
        planningRange,
        points,
        rowsKey,
        tide,
        tooltipLines,
    ]);

    return (
        <div ref={frameRef}>
            <Chart option={option} className={className} style={mergedStyle} />
        </div>
    );
}
