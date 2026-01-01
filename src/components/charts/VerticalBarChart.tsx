"use client";

import type { CSSProperties } from "react";
import type { BarSeriesOption } from "echarts";

import { Chart } from "./Chart";
import { useChartTheme } from "./chartTheme";

type VerticalBarChartProps = {
  categories: string[];
  series: Array<{ name: string; data: number[] }>;
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
};

export function VerticalBarChart({
  categories,
  series,
  height = 260,
  width = "100%",
  className,
  style,
}: VerticalBarChartProps) {
  const chartTheme = useChartTheme();
  const barSeries: BarSeriesOption[] = series.map((item) => ({
    name: item.name,
    type: "bar",
    data: item.data,
    barMaxWidth: 24,
  }));

  const mergedStyle: CSSProperties = {
    height,
    width,
    ...style,
  };

  return (
    <Chart
      option={{
        tooltip: { trigger: "axis", confine: true },
        legend: {
          data: series.map((item) => item.name),
          bottom: 0,
          left: "center",
          textStyle: { color: chartTheme.muted },
        },
        grid: { left: 24, right: 16, top: 32, bottom: 52, containLabel: true },
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
        series: barSeries,
      }}
      className={className}
      style={mergedStyle}
      chartTheme={chartTheme}
    />
  );
}
