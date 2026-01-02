"use client";

import type { CSSProperties } from "react";
import { useCallback, useMemo } from "react";

import { Chart } from "./Chart";
import { useChartColors, useChartTheme } from "./chartTheme";
import { calcPercent, createAreaGradient } from "@/lib/chartUtils";

export type StackedAreaDataPoint = {
    date: string;
    values: Record<string, number>;
};

export type StackedAreaSeries = {
    name: string;
    color?: string;
    gradientStart?: string;
    gradientEnd?: string;
};

type StackedAreaChartProps = {
    data: StackedAreaDataPoint[];
    series: StackedAreaSeries[];
    unit?: string;
    height?: number | string;
    width?: number | string;
    className?: string;
    style?: CSSProperties;
    onSeriesClick?: (params: {
        seriesName: string;
        date: string;
        value: number;
        percent: number;
    }) => void;
};

/**
 * ECharts Stacked Area chart with gradient fills.
 * Used for Investment Expense to show breakdown over time.
 */
export function StackedAreaChart({
    data,
    series,
    unit = "items",
    height = 400,
    width = "100%",
    className,
    style,
    onSeriesClick,
}: StackedAreaChartProps) {
    const chartTheme = useChartTheme();
    const chartColors = useChartColors();
    const mergedStyle: CSSProperties = { height, width, ...style };

    // Extract dates for x-axis
    const dates = useMemo(() => data.map((d) => d.date), [data]);

    // Calculate totals for each date for percentage calculation
    const dateTotals = useMemo(() => {
        return data.map((d) => {
            return series.reduce((sum, s) => sum + (d.values[s.name] ?? 0), 0);
        });
    }, [data, series]);

    // Build ECharts series with gradients
    const chartSeries = useMemo(() => {
        return series.map((s, idx) => {
            const baseColor = s.color || chartColors[idx % chartColors.length];

            // Helper to convert hex to rgba
            const hexToRgba = (hex: string, alpha: number) => {
                const normalized = hex.replace("#", "");
                if (normalized.length !== 6) return hex;
                const value = Number.parseInt(normalized, 16);
                const r = (value >> 16) & 0xff;
                const g = (value >> 8) & 0xff;
                const b = value & 0xff;
                return `rgba(${r}, ${g}, ${b}, ${alpha})`;
            };

            // Determine gradient colors
            let gradientFill;
            if (s.gradientStart && s.gradientEnd) {
                // Use provided gradient colors
                gradientFill = createAreaGradient({ start: s.gradientStart, end: s.gradientEnd });
            } else if (baseColor.startsWith("#")) {
                // Convert hex to rgba gradient
                gradientFill = createAreaGradient({
                    start: hexToRgba(baseColor, 0.8),
                    end: hexToRgba(baseColor, 0.1),
                });
            } else {
                // Assume rgb/rgba format and use string replacement
                gradientFill = createAreaGradient({
                    start: baseColor.replace(")", ", 0.8)").replace("rgb", "rgba"),
                    end: baseColor.replace(")", ", 0.1)").replace("rgb", "rgba"),
                });
            }

            return {
                name: s.name,
                type: "line" as const,
                stack: "total",
                smooth: true,
                lineStyle: {
                    width: 0,
                },
                showSymbol: false,
                areaStyle: {
                    opacity: 0.9,
                    color: gradientFill,
                },
                emphasis: {
                    focus: "series" as const,
                },
                data: data.map((d) => d.values[s.name] ?? 0),
            };
        });
    }, [series, data, chartColors]);

    const handleClick = useCallback(
        (params: unknown) => {
            if (!onSeriesClick || !params || typeof params !== "object") return;
            const entry = params as {
                seriesName?: string;
                dataIndex?: number;
                value?: number;
            };
            if (!entry.seriesName || typeof entry.dataIndex !== "number") return;

            const dateTotal = dateTotals[entry.dataIndex] ?? 0;
            const value = entry.value ?? 0;
            const percent = calcPercent(value, dateTotal);

            onSeriesClick({
                seriesName: entry.seriesName,
                date: dates[entry.dataIndex] ?? "",
                value,
                percent,
            });
        },
        [onSeriesClick, dates, dateTotals]
    );

    const option = useMemo(
        () => ({
            tooltip: {
                trigger: "axis" as const,
                axisPointer: {
                    type: "cross" as const,
                    label: {
                        backgroundColor: chartTheme.muted,
                    },
                },
                confine: true,
                formatter: (params: unknown) => {
                    if (!Array.isArray(params) || params.length === 0) return "";

                    const firstEntry = params[0] as { axisValue?: string; dataIndex?: number };
                    const date = firstEntry.axisValue ?? "";
                    const dataIndex = firstEntry.dataIndex ?? 0;
                    const dateTotal = dateTotals[dataIndex] ?? 0;

                    const lines = params.map((p: unknown) => {
                        const entry = p as {
                            seriesName?: string;
                            value?: number;
                            color?: string;
                        };
                        const value = entry.value ?? 0;
                        const pct = calcPercent(value, dateTotal);
                        return `
              <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                <span style="display: inline-block; width: 10px; height: 10px; border-radius: 2px; background: ${entry.color}"></span>
                <span>${entry.seriesName}: <strong>${value.toLocaleString()}</strong> ${unit}</span>
                <span style="color: ${chartTheme.accent2}">(${pct.toFixed(1)}%)</span>
              </div>
            `;
                    });

                    return `
            <div style="font-weight: 600; margin-bottom: 8px;">${date}</div>
            <div style="font-size: 11px; color: ${chartTheme.muted}; margin-bottom: 4px;">Total: ${dateTotal.toLocaleString()} ${unit}</div>
            ${lines.join("")}
          `;
                },
            },
            legend: {
                data: series.map((s) => s.name),
                bottom: 0,
                left: "center",
                textStyle: { color: chartTheme.muted },
                itemWidth: 12,
                itemHeight: 8,
            },
            grid: {
                left: 48,
                right: 24,
                top: 24,
                bottom: 64,
            },
            xAxis: {
                type: "category" as const,
                boundaryGap: false,
                data: dates,
                axisLine: { lineStyle: { color: chartTheme.grid } },
                axisLabel: { color: chartTheme.muted, fontSize: 10 },
            },
            yAxis: {
                type: "value" as const,
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: { lineStyle: { color: chartTheme.grid, type: "dashed" as const } },
                axisLabel: { color: chartTheme.muted, fontSize: 10 },
            },
            series: chartSeries,
        }),
        [dates, dateTotals, series, chartSeries, unit, chartTheme]
    );

    return (
        <Chart
            option={option}
            className={className}
            style={mergedStyle}
            onEvents={{ click: handleClick }}
            chartTheme={chartTheme}
            chartColors={chartColors}
        />
    );
}
