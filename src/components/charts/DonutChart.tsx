"use client";

import { Chart } from "./Chart";
import { chartMutedText } from "./chartTheme";

const segments = [
  { name: "Refactor", value: 28, selected: true },
  { name: "Feature", value: 34 },
  { name: "Fix", value: 18 },
  { name: "Chore", value: 20 },
];

export function DonutChart() {
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
      style={{ height: 280, width: "100%" }}
    />
  );
}
