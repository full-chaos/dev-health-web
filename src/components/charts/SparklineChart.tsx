"use client";

import type { CSSProperties } from "react";

import { Chart } from "./Chart";
import { chartMutedText } from "./chartTheme";
import { toSparklineSeries } from "./chartTransforms";
import { workItemMetricsDailySample } from "@/data/devHealthOpsSample";
import type { WorkItemMetricsDaily } from "@/data/devHealthOpsTypes";

type SparklineChartProps = {
  data?: WorkItemMetricsDaily[];
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
};

export function SparklineChart({
  data = workItemMetricsDailySample,
  height = 120,
  width = "100%",
  className,
  style,
}: SparklineChartProps) {
  const { categories, values } = toSparklineSeries(data, {
    workScopeId: "auth",
  });

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
          data: categories,
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
            data: values,
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
