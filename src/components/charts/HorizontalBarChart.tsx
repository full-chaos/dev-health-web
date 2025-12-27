"use client";

import type { CSSProperties } from "react";

import { Chart } from "./Chart";
import { chartGridColor, chartMutedText } from "./chartTheme";
import { toTeamEfficiencyBarSeries } from "./chartTransforms";
import { workItemFlowEfficiencyDailySample } from "@/data/devHealthOpsSample";
import type { WorkItemFlowEfficiencyDaily } from "@/data/devHealthOpsTypes";

type HorizontalBarChartProps = {
  data?: WorkItemFlowEfficiencyDaily[];
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
};

export function HorizontalBarChart({
  data = workItemFlowEfficiencyDailySample,
  height = 240,
  width = "100%",
  className,
  style,
}: HorizontalBarChartProps) {
  const { categories, values } = toTeamEfficiencyBarSeries(data);
  const mergedStyle: CSSProperties = {
    height,
    width,
    ...style,
  };

  return (
    <Chart
      option={{
        tooltip: { trigger: "axis", confine: true },
        grid: { left: 80, right: 24, top: 20, bottom: 20 },
        xAxis: {
          type: "value",
          splitLine: { lineStyle: { color: chartGridColor } },
          axisLabel: { color: chartMutedText },
        },
        yAxis: {
          type: "category",
          data: categories,
          axisTick: { show: false },
          axisLine: { lineStyle: { color: chartGridColor } },
          axisLabel: { color: chartMutedText },
        },
        series: [
          {
            type: "bar",
            data: values,
            barMaxWidth: 18,
            label: {
              show: true,
              position: "right",
              color: chartMutedText,
            },
          },
        ],
      }}
      className={className}
      style={mergedStyle}
    />
  );
}
