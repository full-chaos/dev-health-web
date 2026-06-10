"use client";

import type { CSSProperties } from "react";

import { LineChart } from "echarts/charts";

import { Chart } from "./Chart";
import { formatChartValue, type ChartValueFormat } from "./chartValueFormat";
import { useChartTheme } from "./chartTheme";
import { orderTimeseriesPoints, type TimeseriesPoint } from "./timeseriesData";
import { echarts } from "@/lib/echartsInit";

echarts.use([LineChart]);

export type TimeseriesBaseline = {
    value: number;
    label?: string;
};

type TimeseriesChartProps = {
    data: TimeseriesPoint[];
    height?: number | string;
    width?: number | string;
    className?: string;
    style?: CSSProperties;
    valueFormat?: ChartValueFormat;
    baseline?: TimeseriesBaseline;
};

export function buildBaselineMarkLine(baseline: TimeseriesBaseline | undefined, color: string) {
    if (!baseline || !Number.isFinite(baseline.value)) {
        return undefined;
    }
    return {
        silent: true,
        symbol: "none",
        lineStyle: { type: "dashed" as const, color, width: 1 },
        label: {
            show: Boolean(baseline.label),
            formatter: baseline.label ?? "",
            position: "insideEndTop" as const,
            color,
        },
        data: [{ yAxis: baseline.value }],
    };
}

type NumericChartParam = {
    name?: string;
    value?: number | string;
    marker?: string;
};

export function TimeseriesChart({
    data,
    height = 280,
    width = "100%",
    className,
    style,
    valueFormat = "number",
    baseline,
}: TimeseriesChartProps) {
    const chartTheme = useChartTheme();
    const { categories, values } = orderTimeseriesPoints(data);
    const baselineMarkLine = buildBaselineMarkLine(baseline, chartTheme.muted);

    const mergedStyle: CSSProperties = {
        height,
        width,
        ...style,
    };

    const formatValue = (value: number | string | undefined): string => {
        const numeric = typeof value === "number" ? value : Number(value);
        return Number.isFinite(numeric) ? formatChartValue(numeric, valueFormat) : `${value ?? ""}`;
    };

    return (
        <Chart
            option={{
                tooltip: {
                    trigger: "axis",
                    confine: true,
                    backgroundColor: chartTheme.background,
                    borderColor: chartTheme.stroke,
                    textStyle: {
                        color: chartTheme.text,
                    },
                    formatter: (params: unknown): string => {
                        const list = Array.isArray(params) ? params : [params];
                        return list
                            .map((entry) => {
                                const item = entry as NumericChartParam;
                                const label = item.name ?? "Value";
                                return `${item.marker ?? ""}${label}: ${formatValue(item.value)}`;
                            })
                            .join("<br/>");
                    },
                },
                grid: { left: 24, right: 16, top: 32, bottom: 32, containLabel: true },
                xAxis: {
                    type: "category",
                    data: categories,
                    axisTick: { show: false },
                    axisLine: { lineStyle: { color: chartTheme.grid } },
                    axisLabel: { color: chartTheme.muted, formatter: formatValue },
                },
                yAxis: {
                    type: "value",
                    splitLine: { lineStyle: { color: chartTheme.grid } },
                    axisLabel: { color: chartTheme.muted },
                },
                series: [
                    {
                        type: "line",
                        data: values,
                        smooth: true,
                        symbol: "circle",
                        symbolSize: 6,
                        lineStyle: { width: 2 },
                        areaStyle: { opacity: 0.12 },
                        ...(baselineMarkLine ? { markLine: baselineMarkLine } : {}),
                    },
                ],
            }}
            className={className}
            style={mergedStyle}
            chartTheme={chartTheme}
        />
    );
}
