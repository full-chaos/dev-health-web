"use client";

import type { CSSProperties } from "react";
// Type-only import from full echarts package (erased at runtime — no bundle impact).
import type { BarSeriesOption } from "echarts";
import { BarChart } from "echarts/charts";

import { Chart } from "./Chart";
import { formatChartValue, type ChartValueFormat } from "./chartValueFormat";
import { useChartTheme } from "./chartTheme";
import { buildLegend, buildTooltip } from "./chartConventions";
import { echarts } from "@/lib/echartsInit";

echarts.use([BarChart]);

type VerticalBarChartProps = {
    categories: string[];
    series: Array<{ name: string; data: number[] }>;
    height?: number | string;
    width?: number | string;
    className?: string;
    style?: CSSProperties;
    valueFormat?: ChartValueFormat;
    /**
     * Show the legend. Default: only for two or more series. Pass `true` where the legend is the
     * only place the measure is named; leave it off where a title, heading or axis name already says it.
     */
    showLegend?: boolean;
};

type NumericChartParam = {
    name?: string;
    seriesName?: string;
    value?: number | string;
    marker?: string;
};

export function VerticalBarChart({
    categories,
    series,
    height = 260,
    width = "100%",
    className,
    style,
    valueFormat = "number",
    showLegend,
}: VerticalBarChartProps) {
    const chartTheme = useChartTheme();

    const formatValue = (value: number | string | undefined): string => {
        const numeric = typeof value === "number" ? value : Number(value);
        return Number.isFinite(numeric) ? formatChartValue(numeric, valueFormat) : `${value ?? ""}`;
    };

    const barSeries: BarSeriesOption[] = series.map((item) => ({
        name: item.name,
        type: "bar",
        data: item.data,
        barMaxWidth: 24,
        label: {
            show: true,
            position: "top",
            color: chartTheme.muted,
            formatter: (params: unknown) => {
                const value = (params as NumericChartParam | undefined)?.value;
                return formatValue(value);
            },
        },
    }));

    const legend = buildLegend(
        series.map((item) => item.name),
        chartTheme,
        showLegend,
    );

    const mergedStyle: CSSProperties = {
        height,
        width,
        ...style,
    };

    return (
        <Chart
            option={{
                tooltip: buildTooltip(chartTheme, {
                    formatter: (params: unknown): string => {
                        const list = Array.isArray(params) ? params : [params];
                        return list
                            .map((entry) => {
                                const item = entry as NumericChartParam;
                                const label = item.seriesName ?? item.name ?? "Value";
                                return `${item.marker ?? ""}${label}: ${formatValue(item.value)}`;
                            })
                            .join("<br/>");
                    },
                }),
                legend,
                grid: {
                    left: 24,
                    right: 16,
                    top: 32,
                    bottom: legend ? 52 : 32,
                    containLabel: true,
                },
                xAxis: {
                    type: "category",
                    data: categories,
                    axisTick: { show: false },
                    axisLine: { lineStyle: { color: chartTheme.grid } },
                    axisLabel: { color: chartTheme.muted },
                },
                yAxis: {
                    type: "value",
                    splitLine: { lineStyle: { color: chartTheme.grid } },
                    axisLabel: { color: chartTheme.muted, formatter: formatValue },
                },
                series: barSeries,
            }}
            className={className}
            style={mergedStyle}
            chartTheme={chartTheme}
        />
    );
}
