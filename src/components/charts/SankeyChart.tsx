"use client";

import { type CSSProperties, useCallback, useMemo } from "react";

import { Chart } from "./Chart";
import { useChartTheme } from "./chartTheme";
import type { SankeyLink, SankeyNode } from "@/lib/types";

export type SankeyOrientation = "horizontal" | "vertical";

type SankeyChartProps = {
  nodes: SankeyNode[];
  links: SankeyLink[];
  unit?: string;
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
  /**
   * Orientation of the Sankey flow.
   * - "horizontal": left-to-right (temporal progression, default)
   * - "vertical": top-to-bottom (allocation hierarchy)
   */
  orientation?: SankeyOrientation;
  onItemClick?: (item: {
    type: "node" | "link";
    name?: string;
    source?: string;
    target?: string;
    value?: number;
  }) => void;
  /**
   * Callback when hovering over a node or link.
   * Called with null when hover ends.
   */
  onItemHover?: (item: {
    type: "node" | "link";
    name?: string;
    source?: string;
    target?: string;
    value?: number;
  } | null) => void;
};

// Compute flow totals from links/nodes data
function computeFlowTotals(nodes: SankeyNode[], links: SankeyLink[]) {
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

  return { incomingTotals, outgoingTotals, nodeValueByName, totalFlow };
}

const formatValue = (value: number | undefined, unit: string) => {
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

export function SankeyChart({
  nodes,
  links,
  unit = "items",
  height = 320,
  width = "100%",
  className,
  style,
  orientation = "horizontal",
  onItemClick,
  onItemHover,
}: SankeyChartProps) {
  const chartTheme = useChartTheme();

  const mergedStyle: CSSProperties = useMemo(
    () => ({ height, width, ...style }),
    [height, width, style]
  );

  // Memoize flow computations
  const { outgoingTotals, nodeValueByName, totalFlow } = useMemo(
    () => computeFlowTotals(nodes, links),
    [nodes, links]
  );

  // Memoize click handler
  const handleClick = useCallback(
    (params: unknown) => {
      if (!onItemClick || !params || typeof params !== "object") {
        return;
      }
      const entry = params as {
        dataType?: string;
        data?: {
          name?: string;
          value?: number;
          source?: string;
          target?: string;
        };
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
    },
    [onItemClick]
  );

  // Memoize hover handlers
  const handleMouseOver = useCallback(
    (params: unknown) => {
      if (!onItemHover || !params || typeof params !== "object") {
        return;
      }
      const entry = params as {
        dataType?: string;
        data?: {
          name?: string;
          value?: number;
          source?: string;
          target?: string;
        };
        name?: string;
      };
      const data = entry.data ?? {};
      const isLink = entry.dataType === "edge";
      onItemHover({
        type: isLink ? "link" : "node",
        name: data.name ?? entry.name,
        source: data.source,
        target: data.target,
        value: data.value,
      });
    },
    [onItemHover]
  );

  const handleMouseOut = useCallback(() => {
    onItemHover?.(null);
  }, [onItemHover]);

  // Sort nodes by value within each level for visual clarity (deterministic layout)
  const sortedNodes = useMemo(() => {
    return [...nodes].sort((a, b) => {
      const aVal = nodeValueByName.get(a.name) ?? 0;
      const bVal = nodeValueByName.get(b.name) ?? 0;
      // Sort descending by value
      return bVal - aVal;
    });
  }, [nodes, nodeValueByName]);

  // Memoize the ECharts option to prevent re-renders
  const option = useMemo(() => {
    const tooltipFormatter = (params: unknown) => {
      if (!params || typeof params !== "object") {
        return "";
      }
      const entry = params as {
        dataType?: string;
        data?: {
          name?: string;
          value?: number;
          source?: string;
          target?: string;
        };
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
            <span style="font-weight: 600; font-family: monospace;">${formatValue(data.value, unit)}</span>
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
          <span style="font-weight: 600; font-family: monospace;">${formatValue(nodeValue, unit)}</span>
          ${shareLine}
        </div>
      `;
    };

    // Vertical layout configuration
    const isVertical = orientation === "vertical";
    const labelConfig = isVertical
      ? {
        color: chartTheme.text,
        fontSize: 11,
        position: "right" as const,
        // Ensure labels don't overlap nodes in vertical mode
        formatter: "{b}",
      }
      : { color: chartTheme.text, fontSize: 11 };

    return {
      tooltip: {
        trigger: "item" as const,
        confine: true,
        formatter: tooltipFormatter,
      },
      series: [
        {
          type: "sankey" as const,
          orient: (isVertical ? "vertical" : "horizontal") as "vertical" | "horizontal",
          emphasis: { focus: "adjacency" as const },
          data: sortedNodes,
          links,
          roam: false,
          lineStyle: {
            color: "gradient",
            curveness: 0.5,
            opacity: 0.45,
          },
          label: labelConfig,
          itemStyle: {
            borderColor: chartTheme.grid,
            borderWidth: 1,
          },
          nodeGap: isVertical ? 18 : 14,
          // Increase node width in vertical mode for better visibility
          nodeWidth: isVertical ? 24 : 20,
          // Layout algorithm settings for deterministic positioning
          layoutIterations: 32,
          // For vertical orientation, provide more breathing room
          left: isVertical ? "5%" : "1%",
          right: isVertical ? "20%" : "10%",
          top: isVertical ? "8%" : "5%",
          bottom: isVertical ? "5%" : "5%",
        },
      ],
    };
  }, [
    sortedNodes,
    links,
    unit,
    orientation,
    chartTheme.text,
    chartTheme.grid,
    chartTheme.muted,
    chartTheme.accent2,
    outgoingTotals,
    nodeValueByName,
    totalFlow,
  ]);

  // Memoize onEvents to prevent re-renders
  const onEvents = useMemo(() => {
    const events: Record<string, (params: unknown) => void> = {};
    if (onItemClick) {
      events.click = handleClick;
    }
    if (onItemHover) {
      events.mouseover = handleMouseOver;
      events.mouseout = handleMouseOut;
    }
    return Object.keys(events).length > 0 ? events : undefined;
  }, [onItemClick, onItemHover, handleClick, handleMouseOver, handleMouseOut]);

  return (
    <Chart
      option={option}
      className={className}
      style={mergedStyle}
      onEvents={onEvents}
      chartTheme={chartTheme}
    />
  );
}
