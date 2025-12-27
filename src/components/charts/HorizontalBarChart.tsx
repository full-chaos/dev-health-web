"use client";

import { Chart } from "./Chart";
import { chartGridColor, chartMutedText } from "./chartTheme";

const teams = ["Platform", "Growth", "Core", "Infra", "Mobile", "Data"];
const scores = [92, 84, 76, 73, 68, 61];

export function HorizontalBarChart() {
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
          data: teams,
          axisTick: { show: false },
          axisLine: { lineStyle: { color: chartGridColor } },
        },
        series: [
          {
            type: "bar",
            data: scores,
            barMaxWidth: 18,
            label: {
              show: true,
              position: "right",
              color: chartMutedText,
            },
          },
        ],
      }}
      style={{ height: 240, width: "100%" }}
    />
  );
}
