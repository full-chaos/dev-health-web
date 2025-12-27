"use client";

import { Chart } from "./Chart";
import { chartMutedText } from "./chartTheme";

const data = [12, 18, 14, 22, 19, 28, 25, 31, 29, 36, 33, 38];

export function SparklineChart() {
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
          data: data.map((_, i) => i + 1),
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
      style={{ height: 120, width: "100%" }}
    />
  );
}
