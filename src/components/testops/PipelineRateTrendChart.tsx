"use client";

// Two independent line series on one chart: the success rate and the failure rate of completed
// pipeline runs (the approved "CI and test health" / "Pipeline trends" chart). `TimeseriesChart`
// draws one series and `StackedAreaChart` stacks, which would misstate two rates that have their
// own denominators, so this uses the `Chart` primitive directly, as the security trend chart does.
// Two series draw no area fill (concept rule: an area fill only for a single series).

import { useMemo } from "react";

import { Chart } from "@/components/charts/Chart";
import { useChartColors, useChartTheme } from "@/components/charts/chartTheme";
import {
    buildLegend,
    buildTooltip,
    lineMark,
    withPointSymbols,
} from "@/components/charts/chartConventions";
import { formatPercent } from "@/lib/formatters";
import type { PipelineRatePoint } from "@/lib/testops/rateTrend";

export const SUCCESS_RATE_SERIES = "Success rate";
export const FAILURE_RATE_SERIES = "Failure rate";

type PipelineRateTrendChartProps = {
    /** Served daily values, in day order. `null` is a gap, never 0. */
    points: PipelineRatePoint[];
    height?: number;
};

/** "2026-09-04" → "Sep 4" (axis label only; the tooltip keeps the full day). */
function formatDay(iso: string): string {
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type TooltipEntry = {
    seriesName?: string;
    marker?: string;
    dataIndex?: number;
    value?: number | string | null;
};

export function PipelineRateTrendChart({ points, height = 280 }: PipelineRateTrendChartProps) {
    const chartTheme = useChartTheme();
    const colors = useChartColors();
    const successColor = colors[0];
    const failureColor = colors[1];

    const option = useMemo(() => {
        const days = points.map((p) => p.day);
        const formatValue = (value: number | string | null | undefined): string => {
            // A null point is missing data (a gap), never Number(null) === 0.
            if (value === null || value === undefined || value === "") return "No data";
            const numeric = typeof value === "number" ? value : Number(value);
            return Number.isFinite(numeric) ? formatPercent(numeric) : `${value}`;
        };
        const line = (name: string, color: string, values: Array<number | null>) => ({
            name,
            type: "line" as const,
            smooth: true,
            symbol: "circle",
            // A dot only on the last and isolated points (per-point sizes; the series size is the legend glyph).
            showAllSymbol: true,
            symbolSize: 5,
            lineStyle: { ...lineMark, color },
            itemStyle: { color },
            data: withPointSymbols(values, chartTheme),
        });
        return {
            tooltip: buildTooltip(chartTheme, {
                crosshair: true,
                formatter: (params: unknown): string => {
                    const list = (Array.isArray(params) ? params : [params]) as TooltipEntry[];
                    const day = days[list[0]?.dataIndex ?? -1] ?? "";
                    const rows = list.map(
                        (entry) =>
                            `${entry.marker ?? ""}${entry.seriesName ?? ""}: ${formatValue(entry.value)}`,
                    );
                    return [day, ...rows].filter(Boolean).join("<br/>");
                },
            }),
            legend: buildLegend([SUCCESS_RATE_SERIES, FAILURE_RATE_SERIES], chartTheme),
            grid: { left: 24, right: 16, top: 24, bottom: 40, containLabel: true },
            xAxis: {
                type: "category" as const,
                boundaryGap: false,
                data: days.map(formatDay),
                axisTick: { show: false },
                axisLine: { lineStyle: { color: chartTheme.grid } },
                axisLabel: { color: chartTheme.muted },
            },
            yAxis: {
                type: "value" as const,
                splitLine: { lineStyle: { color: chartTheme.grid } },
                axisLabel: {
                    color: chartTheme.muted,
                    formatter: (value: number) => formatPercent(value),
                },
            },
            series: [
                line(
                    SUCCESS_RATE_SERIES,
                    successColor,
                    points.map((p) => p.success),
                ),
                line(
                    FAILURE_RATE_SERIES,
                    failureColor,
                    points.map((p) => p.failure),
                ),
            ],
        };
    }, [points, chartTheme, successColor, failureColor]);

    return <Chart option={option} style={{ height, width: "100%" }} chartTheme={chartTheme} />;
}
