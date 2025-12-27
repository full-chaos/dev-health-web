"use client";

import type { CSSProperties } from "react";

import { Chart } from "./Chart";
import { chartMutedText } from "./chartTheme";

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
  const xCategories = categories ?? data.map((_, index) => index + 1);

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
          axisPointer: { type: "line" },
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
            itemStyle: { color: chartMutedText },
          },
        ],
      }}
      className={className}
      style={mergedStyle}
    />
  );
}
