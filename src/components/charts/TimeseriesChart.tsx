"use client";

import type { CSSProperties } from "react";

import { Chart } from "./Chart";
import { useChartTheme } from "./chartTheme";

type TimeseriesChartProps = {
  data: Array<{ day: string; value: number }>;
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
};

export function TimeseriesChart({
  data,
  height = 280,
  width = "100%",
  className,
  style,
}: TimeseriesChartProps) {
  const chartTheme = useChartTheme();
  const ordered = [...data].sort((a, b) => a.day.localeCompare(b.day));
  const categories = ordered.map((point) => point.day);
  const values = ordered.map((point) => point.value);

  const mergedStyle: CSSProperties = {
    height,
    width,
    ...style,
  };

  return (
    <Chart
      option={{
        tooltip: { trigger: "axis", confine: true },
        grid: { left: 24, right: 16, top: 32, bottom: 32, containLabel: true },
        xAxis: {
          type: "category",
          data: categories,
          axisTick: { show: false },
          axisLine: { lineStyle: { color: chartTheme.grid } },
          axisLabel: { color: chartTheme.muted },
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
          },
        ],
      }}
      className={className}
      style={mergedStyle}
      chartTheme={chartTheme}
    />
  );
}
