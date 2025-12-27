"use client";

import type { CSSProperties } from "react";

import { Chart } from "./Chart";
import { chartGridColor, chartMutedText } from "./chartTheme";
import { toThroughputBarSeries } from "./chartTransforms";
import { workItemMetricsDailySample } from "@/data/devHealthOpsSample";
import type { WorkItemMetricsDaily } from "@/data/devHealthOpsTypes";

type VerticalBarChartProps = {
  data?: WorkItemMetricsDaily[];
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
};

const scopeOrder = ["auth", "api", "ui", "data", "ops", "docs"];

export function VerticalBarChart({
  data = workItemMetricsDailySample,
  height = 260,
  width = "100%",
  className,
  style,
}: VerticalBarChartProps) {
  const { categories, planned, actual } = toThroughputBarSeries(data, {
    scopeOrder,
  });

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
          data: ["Planned", "Actual"],
          bottom: 0,
          left: "center",
          textStyle: { color: chartMutedText },
        },
        grid: { left: 24, right: 16, top: 32, bottom: 52, containLabel: true },
        xAxis: {
          type: "category",
          data: categories,
          axisTick: { show: false },
          axisLine: { lineStyle: { color: chartGridColor } },
          axisLabel: { color: chartMutedText },
        },
        yAxis: {
          type: "value",
          splitLine: { lineStyle: { color: chartGridColor } },
          axisLabel: { color: chartMutedText },
        },
        series: [
          {
            name: "Planned",
            type: "bar",
            data: planned,
            barMaxWidth: 24,
          },
          {
            name: "Actual",
            type: "bar",
            data: actual,
            barMaxWidth: 24,
          },
        ],
      }}
      className={className}
      style={mergedStyle}
    />
  );
}
