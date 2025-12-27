"use client";

import type { CSSProperties } from "react";

import { Chart } from "./Chart";
import { chartMutedText } from "./chartTheme";

type DonutChartProps = {
  data: Array<{ name: string; value: number }>;
  selectedIndex?: number;
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
};

export function DonutChart({
  data,
  selectedIndex = 0,
  height = 280,
  width = "100%",
  className,
  style,
}: DonutChartProps) {
  const segments = data.map((segment, index) => ({
    ...segment,
    selected: index === selectedIndex,
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
