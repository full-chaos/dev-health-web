"use client";

// Chart primitive choice: uses the Chart (ECharts) primitive directly with two
// "line" series — one for opened alerts (red-ish) and one for fixed (emerald-ish).
// The project has TimeseriesChart and StackedAreaChart but neither supports two
// independent (non-stacked) series out of the box. Using Chart directly keeps
// the implementation thin and avoids stacking, which would misrepresent the data.

import { useMemo } from "react";

import { Chart } from "@/components/charts/Chart";
import { useChartTheme, useChartTokens } from "@/components/charts/chartTheme";
import {
    buildTooltip,
    dotRing,
    lineMark,
    withPointSymbols,
} from "@/components/charts/chartConventions";

import { SkeletonLine } from "@/components/ui/Skeleton";
import type { TrendPointData } from "./types";

type TrendChartProps = {
    points: TrendPointData[];
    loading?: boolean;
};

/** Format "2024-03-07" → "Mar 7" */
function formatDay(iso: string): string {
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function TrendChart({ points, loading }: TrendChartProps) {
    const chartTheme = useChartTheme();
    const tokens = useChartTokens();
    const OPENED_COLOR = tokens.negative;
    const FIXED_COLOR = tokens.positive;

    const sorted = useMemo(() => [...points].sort((a, b) => a.day.localeCompare(b.day)), [points]);

    const option = useMemo(
        () => ({
            tooltip: buildTooltip(chartTheme, { crosshair: true }),
            legend: {
                data: ["Opened", "Fixed"],
                bottom: 0,
                left: "center",
                textStyle: { color: chartTheme.muted },
                itemWidth: 12,
                itemHeight: 8,
            },
            grid: { left: 48, right: 24, top: 24, bottom: 48, containLabel: true },
            xAxis: {
                type: "category" as const,
                boundaryGap: false,
                data: sorted.map((p) => formatDay(p.day)),
                axisTick: { show: false },
                axisLine: { lineStyle: { color: chartTheme.grid } },
                axisLabel: { color: chartTheme.muted, fontSize: 10 },
            },
            yAxis: {
                type: "value" as const,
                minInterval: 1,
                splitLine: { lineStyle: { color: chartTheme.grid } },
                axisLabel: { color: chartTheme.muted, fontSize: 10 },
            },
            series: [
                {
                    name: "Opened",
                    type: "line" as const,
                    smooth: true,
                    symbol: "circle",
                    // A dot only on the last and isolated points (per-point sizes; the series size is the legend glyph).
                    showAllSymbol: true,
                    symbolSize: 5,
                    lineStyle: { ...lineMark, color: OPENED_COLOR },
                    itemStyle: { color: OPENED_COLOR, ...dotRing(chartTheme) },
                    areaStyle: { opacity: 0.1, color: OPENED_COLOR },
                    data: withPointSymbols(sorted.map((p) => p.opened)),
                },
                {
                    name: "Fixed",
                    type: "line" as const,
                    smooth: true,
                    symbol: "circle",
                    // A dot only on the last and isolated points (per-point sizes; the series size is the legend glyph).
                    showAllSymbol: true,
                    symbolSize: 5,
                    lineStyle: { ...lineMark, color: FIXED_COLOR },
                    itemStyle: { color: FIXED_COLOR, ...dotRing(chartTheme) },
                    areaStyle: { opacity: 0.1, color: FIXED_COLOR },
                    data: withPointSymbols(sorted.map((p) => p.fixed)),
                },
            ],
        }),
        [sorted, chartTheme, OPENED_COLOR, FIXED_COLOR],
    );

    if (loading) {
        return <SkeletonLine height="h-64" />;
    }

    return <Chart option={option} style={{ height: 280, width: "100%" }} chartTheme={chartTheme} />;
}
