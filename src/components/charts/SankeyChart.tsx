"use client";

import type { CSSProperties } from "react";

import { Chart } from "./Chart";
import { useChartTheme } from "./chartTheme";

type SankeyChartProps = {
  nodes: Array<{ name: string }>;
  links: Array<{ source: string; target: string; value: number }>;
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
};

export function SankeyChart({
  nodes,
  links,
  height = 320,
  width = "100%",
  className,
  style,
}: SankeyChartProps) {
  const chartTheme = useChartTheme();
  const mergedStyle: CSSProperties = {
    height,
    width,
    ...style,
  };

  return (
    <Chart
      option={{
        tooltip: { trigger: "item", confine: true },
        series: [
          {
            type: "sankey",
            emphasis: { focus: "adjacency" },
            data: nodes,
            links,
            lineStyle: { color: "gradient", curveness: 0.5 },
            label: { color: chartTheme.muted },
            nodeGap: 14,
          },
        ],
      }}
      className={className}
      style={mergedStyle}
    />
  );
}
