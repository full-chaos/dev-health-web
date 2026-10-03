"use client";

import type { CSSProperties } from "react";
import { useMemo } from "react";

import type { EChartsOption } from "echarts";
import { BarChart, LineChart } from "echarts/charts";

import { Chart } from "./Chart";
import { markerLabel } from "./ConfidenceBandChart";
import { useChartColors, useChartTheme } from "./chartTheme";
import { chanceByValue, servedRuns } from "@/lib/capacityChance";
import { echarts } from "@/lib/echartsInit";
import { formatNumber } from "@/lib/formatters";

echarts.use([BarChart, LineChart]);

export type SpreadBin = { value: number; count: number };
export type SpreadMarker = { name: string; value: number; date?: string };

type CompletionSpreadChartProps = {
    /** The API's bins, ascending by value, drawn as they are: raw run counts. */
    bins: SpreadBin[];
    /** "days" = days to finish the target items; "items" = items done by the target date. */
    unit: "days" | "items";
    /** The forecast's OWN percentiles, not recomputed from the bins. */
    markers: SpreadMarker[];
    /**
     * The served run total (CHAOS-8477). With it the tooltip says "N of TOTAL runs". Leave it out
     * (or pass null) when the API did not serve it: the web adds up no total of its own.
     */
    runs?: number | null;
    /**
     * Name of the chance axis ("Chance all 42 items are done"). When given, with a served run
     * total, the chart also draws the chance curve. Days mode only.
     */
    chanceAxisName?: string;
    /** The served P50 and P95 values, drawn as the "planning range" band behind the chance curve. */
    planningRange?: { from: number; to: number } | null;
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

const percent = (value: number) => `${formatNumber(value, { maximumFractionDigits: 1 })}%`;

/**
 * The spread of the Monte Carlo runs behind a capacity forecast (CHAOS-7977). Bars sit at the
 * outcomes the simulation produced (a value axis, so no outcome nobody produced is drawn as a
 * zero-height bar), and their height is the number of runs, as returned. The percentile markers
 * are the forecast's own p50 / p85 / p95.
 *
 * With a served run total (CHAOS-8477) the chart also draws the chance curve of the prototype:
 * the share of the runs that were done by each day, as a step line on its own axis, with the
 * planning range between the served P50 and P95 behind it. With no served total there is no
 * curve and no share: only the bars.
 */
export function CompletionSpreadChart({
    bins,
    unit,
    markers,
    runs,
    chanceAxisName,
    planningRange,
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

        const total = servedRuns(runs);
        const chance =
            total !== null && chanceAxisName !== undefined ? chanceByValue(bins, total) : null;
        const chanceAt = new Map(chance ?? []);
        const chanceText = (value: number) => {
            const share = chanceAt.get(value);
            return share === undefined
                ? ""
                : `<div style="margin-top: 4px;">${percent(share)} of the runs were done by day ${value}</div>`;
        };

        const runsAxis = {
            type: "value" as const,
            name: "Simulation runs",
            nameLocation: "middle" as const,
            nameGap: 35,
            nameTextStyle: { color: chartTheme.muted, fontSize: 11 },
            axisLine: { show: false },
            axisTick: { show: false },
            splitLine: {
                lineStyle: { color: chartTheme.grid, type: "solid" as const, width: 1 },
            },
            axisLabel: { color: chartTheme.muted, fontSize: 10 },
            min: 0,
        };
        const chanceAxis = {
            type: "value" as const,
            name: chanceAxisName,
            nameLocation: "middle" as const,
            nameGap: 40,
            nameTextStyle: { color: chartTheme.muted, fontSize: 11 },
            position: "right" as const,
            axisLine: { show: false },
            axisTick: { show: false },
            // One set of grid lines (the runs axis): two would not line up.
            splitLine: { show: false },
            axisLabel: { color: chartTheme.muted, fontSize: 10, formatter: "{value}%" },
            min: 0,
            max: 100,
        };

        return {
            tooltip: {
                trigger: "item",
                confine: true,
                backgroundColor: chartTheme.background,
                borderColor: chartTheme.stroke,
                textStyle: { color: chartTheme.text },
                formatter: (params: unknown) => {
                    const { data, seriesType } = params as {
                        data?: [number, number];
                        seriesType?: string;
                    };
                    if (!data) return "";
                    const [value, amount] = data;
                    const heading =
                        unit === "days" ? `Day ${value}` : `${value} ${unitNoun(unit, value)}`;
                    const head = `<div style="font-weight: 600;">${heading}</div>`;
                    if (seriesType === "line") return `${head}${chanceText(value)}`;
                    // The count as returned, of the served total. With no served total, none is shown.
                    const ended =
                        total === null
                            ? `${formatNumber(amount)} ${amount === 1 ? "run" : "runs"} ended here`
                            : `${formatNumber(amount)} of ${formatNumber(total)} ${total === 1 ? "run" : "runs"} ended here`;
                    return `${head}<div style="margin-top: 4px;">${ended}</div>${chanceText(value)}`;
                },
            },
            grid: {
                left: 48,
                right: chance ? 60 : 24,
                top: 24 + markers.length * LABEL_ROW,
                bottom: 40,
            },
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
            yAxis: chance ? [runsAxis, chanceAxis] : [runsAxis],
            series: [
                {
                    name: "Simulation runs",
                    type: "bar",
                    data: bins.map((bin): [number, number] => [bin.value, bin.count]),
                    barMinWidth: 3,
                    barMaxWidth: 28,
                    itemStyle: { color: tide, opacity: chance ? 0.35 : 0.55 },
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
                ...(chance
                    ? [
                          {
                              name: "Chance done",
                              type: "line" as const,
                              yAxisIndex: 1,
                              // A day nobody ended on keeps the chance of the day before.
                              step: "end" as const,
                              data: chance,
                              symbol: "circle",
                              symbolSize: 6,
                              lineStyle: { width: 2, color: tide },
                              itemStyle: { color: tide },
                              z: 3,
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
                                                    {
                                                        xAxis: planningRange.from,
                                                        name: "planning range",
                                                    },
                                                    { xAxis: planningRange.to },
                                                ],
                                            ] as [
                                                [
                                                    { xAxis: number; name: string },
                                                    { xAxis: number },
                                                ],
                                            ],
                                        },
                                    }
                                  : {}),
                          },
                      ]
                    : []),
            ],
        };
    }, [bins, chanceAxisName, chartTheme, markers, planningRange, runs, tide, unit]);

    return <Chart option={option} className={className} style={mergedStyle} />;
}
