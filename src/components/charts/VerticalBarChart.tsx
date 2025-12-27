"use client";

import { Chart } from "./Chart";
import { chartGridColor, chartMutedText } from "./chartTheme";

const categories = ["Auth", "API", "UI", "Data", "Ops", "Docs"];
const planned = [12, 18, 9, 14, 7, 5];
const actual = [10, 15, 12, 11, 9, 6];

export function VerticalBarChart() {
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
      style={{ height: 260, width: "100%" }}
    />
  );
}
