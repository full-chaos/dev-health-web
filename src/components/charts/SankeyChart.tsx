"use client";

import type { CSSProperties } from "react";

import { Chart } from "./Chart";
import { useChartTheme } from "./chartTheme";
import type { SankeyLink, SankeyNode } from "@/lib/types";

type SankeyChartProps = {
  nodes: SankeyNode[];
  links: SankeyLink[];
  unit?: string;
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
  onItemClick?: (item: {
    type: "node" | "link";
    name?: string;
    source?: string;
    target?: string;
    value?: number;
  }) => void;
};

export function SankeyChart({
  nodes,
  links,
  unit = "items",
  height = 320,
  width = "100%",
  className,
  style,
  onItemClick,
}: SankeyChartProps) {
  const chartTheme = useChartTheme();
  const mergedStyle: CSSProperties = {
    height,
    width,
    ...style,
  };

  const formatValue = (value?: number) => {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return "--";
    }
    return `${value.toFixed(0)} ${unit}`;
  };

  const handleClick = (params: unknown) => {
    if (!onItemClick || !params || typeof params !== "object") {
      return;
    }
    const entry = params as {
      dataType?: string;
      data?: { name?: string; value?: number; source?: string; target?: string };
      name?: string;
    };
    const data = entry.data ?? {};
    const isLink = entry.dataType === "edge";
    onItemClick({
      type: isLink ? "link" : "node",
      name: data.name ?? entry.name,
      source: data.source,
      target: data.target,
      value: data.value,
    });
  };

  return (
    <Chart
      option={{
        tooltip: {
          trigger: "item",
          confine: true,
          formatter: (params: unknown) => {
            if (!params || typeof params !== "object") {
              return "";
            }
            const entry = params as {
              dataType?: string;
              data?: { name?: string; value?: number; source?: string; target?: string };
              name?: string;
            };
            const data = entry.data ?? {};
            if (entry.dataType === "edge") {
              return `${data.source ?? ""} -> ${data.target ?? ""}<br/>${formatValue(
                data.value
              )}`;
            }
            return `${data.name ?? entry.name ?? ""}<br/>${formatValue(
              data.value
            )}`;
          },
        },
        series: [
          {
            type: "sankey",
            emphasis: { focus: "adjacency" },
            data: nodes,
            links,
            lineStyle: { color: "gradient", curveness: 0.5, opacity: 0.45 },
            label: { color: chartTheme.text, fontSize: 11 },
            itemStyle: {
              borderColor: chartTheme.grid,
              borderWidth: 1,
            },
            nodeGap: 14,
          },
        ],
      }}
      className={className}
      style={mergedStyle}
      onEvents={onItemClick ? { click: handleClick } : undefined}
    />
  );
}
