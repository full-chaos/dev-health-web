"use client";

import { Chart } from "./Chart";
import { chartMutedText } from "./chartTheme";

const nodes = [
  { name: "Backlog" },
  { name: "In Progress" },
  { name: "Review" },
  { name: "Done" },
  { name: "Bugs" },
  { name: "Features" },
  { name: "Tech Debt" },
];

const links = [
  { source: "Backlog", target: "In Progress", value: 32 },
  { source: "In Progress", target: "Review", value: 22 },
  { source: "Review", target: "Done", value: 18 },
  { source: "Backlog", target: "Bugs", value: 12 },
  { source: "Backlog", target: "Features", value: 14 },
  { source: "Backlog", target: "Tech Debt", value: 8 },
];

export function SankeyChart() {
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
      style={{ height: 320, width: "100%" }}
    />
  );
}
