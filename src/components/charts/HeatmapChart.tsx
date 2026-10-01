"use client";

import type { CSSProperties } from "react";

// Type-only import from full echarts package (erased at runtime — no bundle impact).
import type { TooltipComponentFormatterCallbackParams } from "echarts";
import { HeatmapChart as EChartsHeatmapChart } from "echarts/charts";

import type { HeatmapResponse } from "@/lib/types";

import { Chart } from "./Chart";
import { HeatmapScaleLegend } from "./HeatmapScaleLegend";
import { useChartColors, useChartTheme, useChartTokens } from "./chartTheme";
import { rampColor, rampPosition } from "@/lib/heatmapRamp";
import { echarts } from "@/lib/echartsInit";
import { formatNumber } from "@/lib/formatters";

echarts.use([EChartsHeatmapChart]);

type HeatmapChartProps = {
    data: HeatmapResponse;
    height?: number | string;
    width?: number | string;
    className?: string;
    style?: CSSProperties;
    onCellSelectAction?: (cell: { x: string; y: string; value: number }) => void;
};

export function HeatmapChart({
    data,
    height = 320,
    width = "100%",
    className,
    style,
    onCellSelectAction,
}: HeatmapChartProps) {
    const chartTheme = useChartTheme();
    const chartColors = useChartColors();
    const { seq } = useChartTokens();
    const mergedStyle: CSSProperties = { height, width, ...style };

    const rawValues = data.cells.map((cell) => cell.value);
    const minValue = rawValues.length ? Math.min(...rawValues) : 0;
    const maxValue = rawValues.length ? Math.max(...rawValues) : 0;
    const scale = data.legend.scale;

    // Cells with data get a step of the one-hue ramp. A position with no data is left
    // unfilled (the card surface, shown as "No data" in the legend), never the lightest
    // step: missing is not zero.
    const seriesData = data.cells.map((cell) => ({
        value: [cell.x, cell.y, cell.value, cell.value],
        itemStyle: { color: rampColor(rampPosition(cell.value, minValue, maxValue, scale), seq) },
    }));

    const getValueArray = (params: unknown) => {
        const entry = Array.isArray(params) ? params[0] : params;
        if (!entry || typeof entry !== "object") {
            return null;
        }
        const candidate = entry as { value?: unknown };
        return Array.isArray(candidate.value) ? candidate.value : null;
    };

    const handleClick = (params: unknown) => {
        if (!onCellSelectAction) {
            return;
        }
        const values = getValueArray(params);
        if (!values) {
            return;
        }
        const rawValue = typeof values[3] === "number" ? values[3] : values[2];
        const xLabel = String(values[0]);
        const yLabel = String(values[1]);
        if (typeof rawValue === "number") {
            onCellSelectAction({ x: xLabel, y: yLabel, value: rawValue });
        }
    };

    return (
        <div className={className}>
            <Chart
                option={{
                    tooltip: {
                        confine: true,
                        backgroundColor: chartTheme.background,
                        borderColor: chartTheme.stroke,
                        textStyle: {
                            color: chartTheme.text,
                        },
                        formatter: (params: TooltipComponentFormatterCallbackParams) => {
                            const values = getValueArray(params);
                            if (!values) {
                                return "No data for this cell";
                            }
                            const raw = values[3] ?? values[2];
                            const xLabel = values[0];
                            const yLabel = values[1];
                            if (raw === "-") {
                                return [`<strong>${yLabel}</strong> · ${xLabel}`, "No data"].join(
                                    "<br/>",
                                );
                            }
                            const formatted =
                                typeof raw === "number"
                                    ? formatNumber(raw, { maximumFractionDigits: 2 })
                                    : raw;
                            return [
                                `<strong>${yLabel}</strong> · ${xLabel}`,
                                `${formatted} ${data.legend.unit}`,
                            ].join("<br/>");
                        },
                    },
                    grid: { left: 32, right: 32, top: 24, bottom: 24, containLabel: true },
                    xAxis: {
                        type: "category",
                        data: data.axes.x,
                        axisTick: { show: false },
                        axisLine: { lineStyle: { color: chartTheme.grid } },
                        axisLabel: { color: chartTheme.muted, interval: 0 },
                    },
                    yAxis: {
                        type: "category",
                        data: data.axes.y,
                        axisTick: { show: false },
                        axisLine: { lineStyle: { color: chartTheme.grid } },
                        axisLabel: { color: chartTheme.muted },
                    },
                    // ECharts requires a visualMap for a heatmap. It is hidden: each cell's color is
                    // set per item from the theme ramp, and the legend is HeatmapScaleLegend.
                    visualMap: {
                        show: false,
                        min: minValue,
                        max: maxValue,
                        inRange: { color: [...seq] },
                    },
                    series: [
                        {
                            type: "heatmap",
                            data: seriesData,
                            emphasis: {
                                itemStyle: { shadowBlur: 8, shadowColor: chartTheme.muted },
                            },
                            itemStyle: { borderColor: chartTheme.grid, borderWidth: 1 },
                        },
                    ],
                }}
                style={mergedStyle}
                onEvents={{ click: handleClick }}
                chartTheme={chartTheme}
                chartColors={chartColors}
            />
            <HeatmapScaleLegend
                min={minValue}
                max={maxValue}
                unit={data.legend.unit}
                scale={scale}
                className="mt-2 px-8"
            />
        </div>
    );
}
