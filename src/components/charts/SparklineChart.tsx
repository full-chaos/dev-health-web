"use client";

import type { CSSProperties } from "react";

import { LineChart } from "echarts/charts";

import { Chart } from "./Chart";
import { useChartColors, useChartTheme, useChartTokens } from "./chartTheme";
import { buildTooltip, dotRing, lineMark, pointSymbolSize } from "./chartConventions";
import { echarts } from "@/lib/echartsInit";
import { formatNumber } from "@/lib/formatters";

echarts.use([LineChart]);

type SparklineChartProps = {
    /** null entries are gaps (no data), never plotted as 0. */
    data: Array<number | null>;
    categories?: Array<string | number>;
    height?: number | string;
    width?: number | string;
    className?: string;
    style?: CSSProperties;
    /**
     * `tile`: the trend mark of a metric tile, as the approved prototype draws it: a thin
     * de-emphasised line with straight segments over a faint area, and a small unringed end dot
     * that carries the tone. Default: the standalone sparkline (smoothed, ringed end dot).
     */
    variant?: "default" | "tile";
    /**
     * `tile` variant only: the tone of the dots (end dot and isolated points). `default` is the
     * first series color; `bad` (the tile's delta is a regression) is the negative status color.
     * The line and the area stay in the muted ink in both.
     */
    tone?: "default" | "bad";
};

/** `tile` variant marks. The prototype draws them in a 100x36 box shown at 87x31. */
export const TILE_SPARK = {
    lineWidth: 1.5,
    areaOpacity: 0.14,
    dotSize: 5,
    grid: { left: 3, right: 5, top: 4, bottom: 4 },
} as const;

type SparklineTooltipParam = {
    axisValue?: string | number;
    value?: number | string | null;
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

export function formatSparklineTooltipValue(value: number | string | null | undefined): string {
    if (value === null) return "No data";
    if (typeof value === "number") return formatNumber(value);
    return value ?? "";
}

export function SparklineChart({
    data,
    categories,
    height = 120,
    width = "100%",
    className,
    style,
    variant = "default",
    tone = "default",
}: SparklineChartProps) {
    const chartTheme = useChartTheme();
    const chartColors = useChartColors();
    const chartTokens = useChartTokens();
    const isTile = variant === "tile";
    const tileDotColor =
        (tone === "bad" ? chartTokens.negative : chartColors[0]) ?? chartTheme.muted;
    const dotSize = pointSymbolSize(data);
    const xCategories = categories ?? data.map((_, index) => index + 1);

    const mergedStyle: CSSProperties = {
        height,
        width,
        ...style,
    };

    return (
        <Chart
            option={{
                tooltip: buildTooltip(chartTheme, {
                    crosshair: true,
                    formatter: (params: unknown): string => {
                        const list = Array.isArray(params) ? params : [params];
                        const first = list[0] as SparklineTooltipParam | undefined;
                        const axisValue = first?.axisValue ?? "";
                        const label = formatSparklineTooltipDate(axisValue);
                        // ECharts hands a raw-null data point to the formatter as `undefined`.
                        const value = formatSparklineTooltipValue(first?.value ?? null);
                        return `${first?.marker ?? ""}${label}: ${value}`;
                    },
                }),
                grid: isTile ? TILE_SPARK.grid : { left: 8, right: 8, top: 10, bottom: 10 },
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
                        smooth: !isTile,
                        symbol: "circle",
                        // A dot only on the last point and on isolated points (see chartConventions).
                        // ECharts' default `showAllSymbol: "auto"` hides symbols between label ticks on a dense
                        // category axis, which can hide the end dot; `pointSymbolSize` already limits the dots.
                        showAllSymbol: true,
                        symbolSize: isTile
                            ? (value: unknown, params: { dataIndex: number }) =>
                                  dotSize(value, params) > 0 ? TILE_SPARK.dotSize : 0
                            : dotSize,
                        // The line and the area stay in the muted ink; only the dots take the tone.
                        lineStyle: isTile
                            ? { ...lineMark, width: TILE_SPARK.lineWidth, color: chartTheme.muted }
                            : lineMark,
                        areaStyle: isTile
                            ? { opacity: TILE_SPARK.areaOpacity, color: chartTheme.muted }
                            : { opacity: 0.15 },
                        emphasis: { scale: true },
                        itemStyle: isTile
                            ? { color: tileDotColor }
                            : { color: chartTheme.muted, ...dotRing(chartTheme) },
                    },
                ],
            }}
            className={className}
            style={mergedStyle}
            chartTheme={chartTheme}
        />
    );
}
