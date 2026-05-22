"use client";

// Chart primitive choice: uses the Chart (ECharts) primitive directly with two
// "line" series — one for opened alerts (red-ish) and one for fixed (emerald-ish).
// The project has TimeseriesChart and StackedAreaChart but neither supports two
// independent (non-stacked) series out of the box. Using Chart directly keeps
// the implementation thin and avoids stacking, which would misrepresent the data.

import { useMemo } from "react";

import { Chart } from "@/components/charts/Chart";
import { useChartTheme } from "@/components/charts/chartTheme";
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

const OPENED_COLOR = "#ef4444"; // red-500
const FIXED_COLOR = "#10b981"; // emerald-500

export function TrendChart({ points, loading }: TrendChartProps) {
  const chartTheme = useChartTheme();

  const sorted = useMemo(() => [...points].sort((a, b) => a.day.localeCompare(b.day)), [points]);

  const option = useMemo(
    () => ({
      tooltip: {
        trigger: "axis" as const,
        confine: true,
        backgroundColor: chartTheme.background,
        borderColor: chartTheme.stroke,
        textStyle: { color: chartTheme.text },
      },
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
        splitLine: { lineStyle: { color: chartTheme.grid, type: "dashed" as const } },
        axisLabel: { color: chartTheme.muted, fontSize: 10 },
      },
      series: [
        {
          name: "Opened",
          type: "line" as const,
          smooth: true,
          symbol: "circle",
          symbolSize: 5,
          lineStyle: { width: 2, color: OPENED_COLOR },
          itemStyle: { color: OPENED_COLOR },
          areaStyle: { opacity: 0.1, color: OPENED_COLOR },
          data: sorted.map((p) => p.opened),
        },
        {
          name: "Fixed",
          type: "line" as const,
          smooth: true,
          symbol: "circle",
          symbolSize: 5,
          lineStyle: { width: 2, color: FIXED_COLOR },
          itemStyle: { color: FIXED_COLOR },
          areaStyle: { opacity: 0.1, color: FIXED_COLOR },
          data: sorted.map((p) => p.fixed),
        },
      ],
    }),
    [sorted, chartTheme],
  );

  if (loading) {
    return <SkeletonLine height="h-64" />;
  }

  return <Chart option={option} style={{ height: 280, width: "100%" }} chartTheme={chartTheme} />;
}
