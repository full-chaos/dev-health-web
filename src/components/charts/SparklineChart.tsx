"use client";

import type { CSSProperties } from "react";

import { Chart } from "./Chart";
import { useChartTheme } from "./chartTheme";

type SparklineChartProps = {
  data: number[];
  categories?: Array<string | number>;
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
};

export function SparklineChart({
  data,
  categories,
  height = 120,
  width = "100%",
  className,
  style,
}: SparklineChartProps) {
  const chartTheme = useChartTheme();
  const xCategories = categories ?? data.map((_, index) => index + 1);

  const formatLabel = (value: string | number) => {
    if (typeof value !== "string") return String(value);
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const mergedStyle: CSSProperties = {
    height,
    width,
    ...style,
  };

  return (
    <Chart
      option={{
        tooltip: {
          trigger: "axis",
          confine: true,
          backgroundColor: chartTheme.background,
          borderColor: chartTheme.stroke,
          textStyle: {
            color: chartTheme.text,
            fontSize: 11,
          },
          axisPointer: { type: "line" },
          formatter: (params: unknown) => {
            const list = Array.isArray(params) ? params : [params];
            const first = list[0] as { name?: string; value?: number } | undefined;
            if (!first) return "";
            const label = formatLabel(first.name ?? "");
            const val = first.value ?? "";
            return `${label}<br/>${val}`;
          },
        },
        grid: { left: 8, right: 8, top: 10, bottom: 10 },
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
            smooth: true,
            symbol: "circle",
            symbolSize: 6,
            lineStyle: { width: 2 },
            areaStyle: { opacity: 0.15 },
            emphasis: { scale: true },
            itemStyle: { color: chartTheme.muted },
          },
        ],
      }}
      className={className}
      style={mergedStyle}
      chartTheme={chartTheme}
    />
  );
}
