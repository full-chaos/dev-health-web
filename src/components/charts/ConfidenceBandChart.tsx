"use client";

import type { CSSProperties } from "react";
import { useMemo } from "react";

import { Chart } from "./Chart";
import { useChartTheme } from "./chartTheme";

type ConfidenceBandChartProps = {
  backlogSize: number;
  p50Days: number;
  p85Days: number;
  p95Days: number;
  throughputMean: number;
  mode?: "burndown" | "burnup";
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
};

function generateProjection(
  backlog: number,
  throughput: number,
  days: number,
  mode: "burndown" | "burnup"
): number[] {
  const result: number[] = [];
  let remaining = backlog;

  for (let d = 0; d <= days; d++) {
    if (mode === "burndown") {
      result.push(Math.max(0, remaining));
    } else {
      result.push(Math.min(backlog, backlog - remaining));
    }
    remaining -= throughput;
  }

  return result;
}

function generateDayLabels(days: number): string[] {
  const labels: string[] = [];
  for (let d = 0; d <= days; d++) {
    if (d === 0) {
      labels.push("Today");
    } else {
      labels.push(`Day ${d}`);
    }
  }
  return labels;
}

export function ConfidenceBandChart({
  backlogSize,
  p50Days,
  p85Days,
  p95Days,
  throughputMean,
  mode = "burndown",
  height = 320,
  width = "100%",
  className,
  style,
}: ConfidenceBandChartProps) {
  const chartTheme = useChartTheme();
  const mergedStyle: CSSProperties = { height, width, ...style };

  const maxDays = Math.max(p95Days, 1);
  const dayLabels = useMemo(() => generateDayLabels(maxDays), [maxDays]);

  const projection = useMemo(
    () => generateProjection(backlogSize, throughputMean, maxDays, mode),
    [backlogSize, throughputMean, maxDays, mode]
  );

  const p50Band = useMemo(() => {
    return dayLabels.map((_, i) => {
      if (i <= p50Days) return projection[i];
      return mode === "burndown" ? 0 : backlogSize;
    });
  }, [dayLabels, p50Days, projection, mode, backlogSize]);

  const p85Band = useMemo(() => {
    return dayLabels.map((_, i) => {
      if (i <= p85Days) return projection[i];
      return mode === "burndown" ? 0 : backlogSize;
    });
  }, [dayLabels, p85Days, projection, mode, backlogSize]);

  const p95Band = useMemo(() => {
    return dayLabels.map((_, i) => {
      if (i <= p95Days) return projection[i];
      return mode === "burndown" ? 0 : backlogSize;
    });
  }, [dayLabels, p95Days, projection, mode, backlogSize]);

  const option = useMemo(
    () => ({
      tooltip: {
        trigger: "axis" as const,
        confine: true,
        backgroundColor: chartTheme.background,
        borderColor: chartTheme.stroke,
        textStyle: { color: chartTheme.text },
        formatter: (params: unknown) => {
          if (!Array.isArray(params) || params.length === 0) return "";
          const first = params[0] as { axisValue?: string; dataIndex?: number };
          const day = first.axisValue ?? "";
          const dayIndex = first.dataIndex ?? 0;
          const remaining = projection[dayIndex] ?? 0;

          let completionInfo = "";
          if (dayIndex === p50Days) {
            completionInfo = `<div style="color: ${chartTheme.accent1}; margin-top: 4px;">P50 completion point</div>`;
          } else if (dayIndex === p85Days) {
            completionInfo = `<div style="color: ${chartTheme.accent2}; margin-top: 4px;">P85 completion point (recommended)</div>`;
          } else if (dayIndex === p95Days) {
            completionInfo = `<div style="color: ${chartTheme.accent3}; margin-top: 4px;">P95 completion point (conservative)</div>`;
          }

          return `
            <div style="font-weight: 600;">${day}</div>
            <div style="margin-top: 4px;">
              ${mode === "burndown" ? "Remaining" : "Completed"}: <strong>${Math.round(remaining)}</strong> items
            </div>
            ${completionInfo}
          `;
        },
      },
      legend: {
        data: ["P50 (Optimistic)", "P85 (Target)", "P95 (Conservative)"],
        bottom: 0,
        left: "center",
        textStyle: { color: chartTheme.muted, fontSize: 11 },
        itemWidth: 12,
        itemHeight: 8,
      },
      grid: {
        left: 48,
        right: 24,
        top: 24,
        bottom: 48,
      },
      xAxis: {
        type: "category" as const,
        data: dayLabels,
        boundaryGap: false,
        axisLine: { lineStyle: { color: chartTheme.grid } },
        axisLabel: {
          color: chartTheme.muted,
          fontSize: 10,
          interval: Math.floor(maxDays / 6),
        },
      },
      yAxis: {
        type: "value" as const,
        name: mode === "burndown" ? "Items Remaining" : "Items Completed",
        nameLocation: "middle" as const,
        nameGap: 35,
        nameTextStyle: { color: chartTheme.muted, fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: chartTheme.grid, type: "dashed" as const } },
        axisLabel: { color: chartTheme.muted, fontSize: 10 },
        min: 0,
        max: backlogSize,
      },
      series: [
        {
          name: "P95 (Conservative)",
          type: "line" as const,
          data: p95Band,
          smooth: true,
          lineStyle: { width: 0 },
          showSymbol: false,
          areaStyle: {
            opacity: 0.15,
            color: chartTheme.accent3,
          },
          z: 1,
        },
        {
          name: "P85 (Target)",
          type: "line" as const,
          data: p85Band,
          smooth: true,
          lineStyle: { width: 0 },
          showSymbol: false,
          areaStyle: {
            opacity: 0.25,
            color: chartTheme.accent2 || "#f59e0b",
          },
          z: 2,
        },
        {
          name: "P50 (Optimistic)",
          type: "line" as const,
          data: p50Band,
          smooth: true,
          lineStyle: { width: 2, color: chartTheme.accent1 || "#22c55e" },
          showSymbol: false,
          areaStyle: {
            opacity: 0.35,
            color: chartTheme.accent1 || "#22c55e",
          },
          z: 3,
        },
      ],
      markLine: {
        silent: true,
        symbol: ["none", "none"],
        lineStyle: { type: "dashed" as const, color: chartTheme.muted },
        data: [
          { xAxis: p50Days, label: { show: false } },
          { xAxis: p85Days, label: { show: false } },
          { xAxis: p95Days, label: { show: false } },
        ],
      },
    }),
    [
      chartTheme,
      dayLabels,
      maxDays,
      mode,
      backlogSize,
      projection,
      p50Band,
      p85Band,
      p95Band,
      p50Days,
      p85Days,
      p95Days,
    ]
  );

  return (
    <Chart
      option={option}
      className={className}
      style={mergedStyle}
      chartTheme={chartTheme}
    />
  );
}
