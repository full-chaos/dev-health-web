"use client";

import type { CSSProperties } from "react";

import { Chart } from "./Chart";
import { chartMutedText } from "./chartTheme";
import { toSankeyData } from "./chartTransforms";
import { workItemStatusTransitionSample } from "@/data/devHealthOpsSample";
import type { WorkItemStatusTransitionSummary } from "@/data/devHealthOpsTypes";

type SankeyChartProps = {
  data?: WorkItemStatusTransitionSummary[];
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
};

export function SankeyChart({
  data = workItemStatusTransitionSample,
  height = 320,
  width = "100%",
  className,
  style,
}: SankeyChartProps) {
  const { nodes, links } = toSankeyData(data);
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
            label: { color: chartMutedText },
            nodeGap: 14,
          },
        ],
      }}
      className={className}
      style={mergedStyle}
    />
  );
}
