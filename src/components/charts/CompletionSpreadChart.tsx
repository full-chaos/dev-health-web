"use client";

import type { CSSProperties } from "react";
import { useMemo } from "react";

import type { EChartsOption } from "echarts";
import { BarChart } from "echarts/charts";

import { Chart } from "./Chart";
import { markerLabel } from "./ConfidenceBandChart";
import { useChartColors, useChartTheme } from "./chartTheme";
import { echarts } from "@/lib/echartsInit";

echarts.use([BarChart]);

export type SpreadBin = { value: number; count: number };
export type SpreadMarker = { name: string; value: number; date?: string };

type CompletionSpreadChartProps = {
    /** The API's bins, ascending by value, drawn as they are: raw run counts. */
    bins: SpreadBin[];
    /** "days" = days to finish the target items; "items" = items done by the target date. */
    unit: "days" | "items";
    /** The forecast's OWN percentiles, not recomputed from the bins. */
    markers: SpreadMarker[];
    height?: number | string;
    className?: string;
    style?: CSSProperties;
};

const LABEL_ROW = 14;

const unitNoun = (unit: "days" | "items", value: number) =>
    unit === "days" ? (value === 1 ? "day" : "days") : value === 1 ? "item" : "items";

/** "P85 · Oct 1 · 3 days" for days; "P85 · 35 items" for items. */
const labelFor = (unit: "days" | "items", marker: SpreadMarker) =>
    unit === "days"
        ? markerLabel(marker.name, marker.date, marker.value)
        : `${marker.name} · ${marker.value} ${unitNoun(unit, marker.value)}`;

/**
 * The spread of the Monte Carlo runs behind a capacity forecast (CHAOS-7977). Bars sit at the
 * outcomes the simulation produced (a value axis, so no outcome nobody produced is drawn as a
 * zero-height bar), and their height is the number of runs, as returned. The percentile markers
 * are the forecast's own p50 / p85 / p95.
 */
export function CompletionSpreadChart({
    bins,
    unit,
    markers,
    height = 220,
    className,
    style,
}: CompletionSpreadChartProps) {
    const chartTheme = useChartTheme();
    const tide = useChartColors()[0] ?? chartTheme.accent1;
    const mergedStyle: CSSProperties = { height, width: "100%", ...style };

    const option = useMemo((): EChartsOption => {
        const edge = [...bins.map((bin) => bin.value), ...markers.map((marker) => marker.value)];
        const lowest = Math.min(...edge);
        const highest = Math.max(...edge);
        // A little room either side, so the first and last bar and a marker at the edge are not clipped.
        const pad = Math.max(1, Math.round((highest - lowest) * 0.05));

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
                    const [value, count] = data;
                    const heading =
                        unit === "days" ? `Day ${value}` : `${value} ${unitNoun(unit, value)}`;
                    // The count as returned. The API serves no run total, so none is shown.
                    return `<div style="font-weight: 600;">${heading}</div><div style="margin-top: 4px;">${count} ${count === 1 ? "run" : "runs"} ended here</div>`;
                },
            },
            grid: { left: 48, right: 24, top: 24 + markers.length * LABEL_ROW, bottom: 40 },
            xAxis: {
                type: "value",
                min: lowest - pad,
                max: highest + pad,
                name: unit === "days" ? "Days to finish" : "Items completed",
                nameLocation: "middle",
                nameGap: 26,
                nameTextStyle: { color: chartTheme.muted, fontSize: 11 },
                axisLine: { lineStyle: { color: chartTheme.grid } },
                axisLabel: { color: chartTheme.muted, fontSize: 10 },
                splitLine: { show: false },
            },
            yAxis: {
                type: "value",
                name: "Simulation runs",
                nameLocation: "middle",
                nameGap: 35,
                nameTextStyle: { color: chartTheme.muted, fontSize: 11 },
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: { lineStyle: { color: chartTheme.grid, type: "solid", width: 1 } },
                axisLabel: { color: chartTheme.muted, fontSize: 10 },
                min: 0,
            },
            series: [
                {
                    name: "Simulation runs",
                    type: "bar",
                    data: bins.map((bin): [number, number] => [bin.value, bin.count]),
                    barMinWidth: 3,
                    barMaxWidth: 28,
                    itemStyle: { color: tide, opacity: 0.55 },
                    markLine: {
                        silent: true,
                        symbol: ["none", "none"],
                        data: markers.map((marker, index) => ({
                            xAxis: marker.value,
                            lineStyle: {
                                type: "dashed" as const,
                                color: tide,
                                width: marker.name === "P85" ? 2 : 1,
                            },
                            label: {
                                show: true,
                                formatter: labelFor(unit, marker),
                                position: "end" as const,
                                // one row per percentile, so the labels never collide
                                offset: [0, -index * LABEL_ROW] as [number, number],
                                color: chartTheme.text,
                                fontSize: 11,
                                fontWeight: marker.name === "P85" ? 700 : 500,
                            },
                        })),
                    },
                },
            ],
        };
    }, [bins, chartTheme, markers, tide, unit]);

    return <Chart option={option} className={className} style={mergedStyle} />;
}
