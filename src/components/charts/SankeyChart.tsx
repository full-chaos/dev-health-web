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
  const incomingTotals = new Map<string, number>();
  const outgoingTotals = new Map<string, number>();
  const nodeValueByName = new Map<string, number>();
  links.forEach((link) => {
    outgoingTotals.set(
      link.source,
      (outgoingTotals.get(link.source) ?? 0) + link.value
    );
    incomingTotals.set(
      link.target,
      (incomingTotals.get(link.target) ?? 0) + link.value
    );
  });
  nodes.forEach((node) => {
    const incoming = incomingTotals.get(node.name) ?? 0;
    const outgoing = outgoingTotals.get(node.name) ?? 0;
    nodeValueByName.set(node.name, Math.max(incoming, outgoing));
  });
  const rootTotal = nodes.reduce((total, node) => {
    const incoming = incomingTotals.get(node.name) ?? 0;
    if (incoming === 0) {
      return total + (outgoingTotals.get(node.name) ?? 0);
    }
    return total;
  }, 0);
  const totalFlow =
    rootTotal > 0
      ? rootTotal
      : links.reduce((total, link) => total + link.value, 0);

  const formatValue = (value?: number) => {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return "--";
    }
    return `${value.toFixed(0)} ${unit}`;
  };
  const formatPercent = (value: number, total: number) => {
    if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
      return "--";
    }
    return `${((value / total) * 100).toFixed(1)}%`;
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
              const totalFromSource =
                data.source && outgoingTotals.has(data.source)
                  ? outgoingTotals.get(data.source) ?? 0
                  : 0;
              const unitLabel = unit === "hours" ? "Elapsed" : "Value";
              const shareLine =
                totalFromSource > 0 && typeof data.value === "number"
                  ? `<br/><span style="color: ${chartTheme.accent2}">${formatPercent(data.value, totalFromSource)}</span> of source flow`
                  : "";

              return `
                <div style="font-weight: 600; margin-bottom: 4px;">Flow</div>
                <div style="font-size: 11px; color: ${chartTheme.muted}">${data.source ?? ""} &rarr; ${data.target ?? ""}</div>
                <div style="margin-top: 4px;">
                  <span style="color: ${chartTheme.muted}">${unitLabel}:</span> 
                  <span style="font-weight: 600; font-family: monospace;">${formatValue(data.value)}</span>
                  ${shareLine}
                </div>
              `;
            }

            const nodeName = data.name ?? entry.name ?? "";
            const nodeValue =
              typeof data.value === "number"
                ? data.value
                : nodeValueByName.get(nodeName) ?? 0;
            const unitLabel = unit === "hours" ? "Total Elapsed" : "Total Value";
            const shareLine =
              totalFlow > 0
                ? `<br/><span style="color: ${chartTheme.accent2}">${formatPercent(nodeValue, totalFlow)}</span> of total`
                : "";

            return `
              <div style="font-weight: 600; margin-bottom: 4px;">${nodeName}</div>
              <div>
                <span style="color: ${chartTheme.muted}">${unitLabel}:</span> 
                <span style="font-weight: 600; font-family: monospace;">${formatValue(nodeValue)}</span>
                ${shareLine}
              </div>
            `;
          },
        },
        series: [
          {
            type: "sankey",
            emphasis: { focus: "adjacency" },
            data: nodes,
            links,
            roam: false,
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
