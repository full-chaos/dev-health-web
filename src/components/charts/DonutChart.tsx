"use client";

import type { CSSProperties } from "react";

import { Chart } from "./Chart";
import { chartMutedText } from "./chartTheme";
import { toWorkItemTypeDonutData } from "./chartTransforms";
import { workItemTypeSummarySample } from "@/data/devHealthOpsSample";
import type { WorkItemTypeSummary } from "@/data/devHealthOpsTypes";

type DonutChartProps = {
  data?: WorkItemTypeSummary[];
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
};

export function DonutChart({
  data = workItemTypeSummarySample,
  height = 280,
  width = "100%",
  className,
  style,
}: DonutChartProps) {
  const segments = toWorkItemTypeDonutData(data).map((segment, index) => ({
    ...segment,
    selected: index === 0,
  }));

  const mergedStyle: CSSProperties = {
    height,
    width,
    ...style,
  };

  return (
    <Chart
      option={{
        tooltip: { trigger: "item", confine: true },
        legend: {
          bottom: 0,
          textStyle: { color: chartMutedText },
        },
        series: [
          {
            type: "pie",
            radius: ["52%", "72%"],
            center: ["50%", "45%"],
            selectedMode: "single",
            selectedOffset: 10,
            padAngle: 2,
            itemStyle: {
              borderRadius: 6,
              shadowBlur: 12,
              shadowOffsetY: 6,
              shadowColor: "rgba(0,0,0,0.15)",
            },
            label: {
              color: chartMutedText,
              formatter: "{b}: {d}%",
            },
            data: segments,
          },
        ],
      }}
      className={className}
      style={mergedStyle}
    />
  );
}
