"use client";

import type { CSSProperties } from "react";

import { LineChart } from "echarts/charts";

import { Chart } from "./Chart";
import { useChartTheme } from "./chartTheme";
import { echarts } from "@/lib/echartsInit";

echarts.use([LineChart]);

type SparklineChartProps = {
    data: number[];
    categories?: Array<string | number>;
    height?: number | string;
    width?: number | string;
    className?: string;
    style?: CSSProperties;
};

type SparklineTooltipParam = {
    axisValue?: string | number;
    value?: number | string;
    marker?: string;
};

const SHORT_DATE_FORMAT: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
};

/**
 * Matches ISO 8601 date strings: `YYYY-MM-DD` optionally followed by a time
 * component (`T…`). Capturing groups: [1]=year, [2]=month, [3]=day.
 */
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(T[\d:Z.+-]*)?$/;

/**
 * Formats an axis value for the sparkline tooltip.
 * If the value matches an ISO date string (YYYY-MM-DD…), returns a short
 * human-readable date (e.g. "Jun 4"). The date components are parsed locally
 * to avoid UTC-midnight timezone shifting.
 * Falls back to the raw string so non-date sparklines are unaffected.
 */
export function formatSparklineTooltipDate(axisValue: string | number): string {
    const str = String(axisValue);
    const match = ISO_DATE_RE.exec(str);
    if (match) {
        // Use local Date constructor (year, month-1, day) to avoid UTC-to-local
        // timezone shifting that `new Date("YYYY-MM-DD")` causes.
        const year = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        const day = parseInt(match[3], 10);
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) {
            return date.toLocaleDateString(undefined, SHORT_DATE_FORMAT);
        }
    }
    return str;
}

export function SparklineChart({
    data,
    categories,
    height = 120,
    width = "100%",
    className,
    style,
}: SparklineChartProps) {
    const chartTheme = useChartTheme();
    const xCategories = categories ?? data.map((_, index) => index + 1);

    const mergedStyle: CSSProperties = {
        height,
        width,
        ...style,
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
                    axisPointer: { type: "line" },
                    formatter: (params: unknown): string => {
                        const list = Array.isArray(params) ? params : [params];
                        const first = list[0] as SparklineTooltipParam | undefined;
                        const axisValue = first?.axisValue ?? "";
                        const label = formatSparklineTooltipDate(axisValue);
                        const value = first?.value !== undefined ? first.value : "";
                        return `${first?.marker ?? ""}${label}: ${value}`;
                    },
                },
                grid: { left: 8, right: 8, top: 10, bottom: 10 },
                xAxis: {
                    type: "category",
                    data: xCategories,
                    boundaryGap: false,
                    axisLabel: { show: false },
                    axisLine: { show: false },
                    axisTick: { show: false },
                },
                yAxis: {
                    type: "value",
                    axisLabel: { show: false },
                    splitLine: { show: false },
                },
                series: [
                    {
                        type: "line",
                        data,
                        smooth: true,
                        symbol: "circle",
                        symbolSize: 6,
                        lineStyle: { width: 2 },
                        areaStyle: { opacity: 0.15 },
                        emphasis: { scale: true },
                        itemStyle: { color: chartTheme.muted },
                    },
                ],
            }}
            className={className}
            style={mergedStyle}
            chartTheme={chartTheme}
        />
    );
}
