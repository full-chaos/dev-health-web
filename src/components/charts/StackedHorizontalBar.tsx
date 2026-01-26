"use client";

import type { CSSProperties } from "react";
import { useMemo } from "react";

import { Chart } from "./Chart";
import { useChartTheme } from "./chartTheme";
import { formatNumber } from "@/lib/formatters";

type StackedBarSegment = {
  name: string;
  value: number;
  color?: string;
};

type StackedHorizontalBarProps = {
  segments: StackedBarSegment[];
  unit?: string;
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
};

export function StackedHorizontalBar({
  segments,
  unit = "units",
  height = 90,
  width = "100%",
  className,
  style,
}: StackedHorizontalBarProps) {
  const chartTheme = useChartTheme();
  const mergedStyle: CSSProperties = useMemo(() => ({ height, width, ...style }), [height, width, style]);

  const total = useMemo(
    () => segments.reduce((sum, segment) => sum + (segment.value ?? 0), 0),
    [segments]
  );

  const option = useMemo(
    () => ({
      tooltip: {
        trigger: "item" as const,
        confine: true,
        backgroundColor: chartTheme.background,
        borderColor: chartTheme.stroke,
        textStyle: {
          color: chartTheme.text,
        },
        formatter: (params: unknown) => {
          const p = params as { seriesName?: string; value?: number };
          const value = typeof p.value === "number" ? p.value : 0;
          const pct = total ? (value / total) * 100 : 0;
          return `
            <div style="font-weight: 600; margin-bottom: 4px;">${p.seriesName ?? ""}</div>
            <div><span style="color: ${chartTheme.muted}">Value:</span> ${formatNumber(value)} ${unit}</div>
            <div><span style="color: ${chartTheme.muted}">% of total:</span> <span style="color: ${chartTheme.accent2}">${pct.toFixed(1)}%</span></div>
          `;
        },
      },
      grid: { left: 8, right: 8, top: 10, bottom: 10, containLabel: false },
      xAxis: {
        type: "value" as const,
        show: false,
        max: total || undefined,
      },
      yAxis: {
        type: "category" as const,
        show: false,
        data: ["total"],
      },
      series: segments
        .filter((segment) => (segment.value ?? 0) > 0)
        .map((segment) => ({
          name: segment.name,
          type: "bar" as const,
          stack: "total",
          data: [segment.value],
          barWidth: 18,
          itemStyle: {
            color: segment.color ?? chartTheme.grid,
            borderRadius: 6,
          },
          emphasis: { focus: "series" as const },
        })),
    }),
    [chartTheme.accent2, chartTheme.background, chartTheme.grid, chartTheme.muted, chartTheme.stroke, chartTheme.text, segments, total, unit]
  );

  return <Chart option={option} className={className} style={mergedStyle} chartTheme={chartTheme} />;
}

