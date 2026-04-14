"use client";

import { type CSSProperties, useMemo } from "react";
// Type-only import from full echarts package (erased at runtime — no bundle impact).
import type { EChartsOption } from "echarts";

import { Chart } from "./Chart";
import { useChartTheme } from "./chartTheme";
import type {
  WorkGraphEdge,
  WorkGraphNodeType,
  WorkGraphEdgeType,
} from "@/lib/graphql/types";

type WorkGraphNode = {
  id: string;
  name: string;
  type: WorkGraphNodeType;
  category: number;
  symbolSize: number;
};

type WorkGraphLink = {
  source: string;
  target: string;
  edgeType: WorkGraphEdgeType;
  confidence: number;
  lineStyle?: {
    width: number;
    opacity: number;
  };
};

type WorkGraphExplorerProps = {
  edges: WorkGraphEdge[];
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
  onNodeClick?: (nodeId: string, nodeType: WorkGraphNodeType) => void;
  selectedNodeId?: string;
};

const NODE_TYPE_COLORS: Record<WorkGraphNodeType, string> = {
  ISSUE: "#f59e0b",
  PR: "#10b981",
  COMMIT: "#6366f1",
  FILE: "#8b5cf6",
};

const NODE_TYPE_SYMBOLS: Record<WorkGraphNodeType, string> = {
  ISSUE: "circle",
  PR: "diamond",
  COMMIT: "rect",
  FILE: "triangle",
};

const EDGE_TYPE_STYLES: Record<
  string,
  { color: string; type: "solid" | "dashed" | "dotted" }
> = {
  BLOCKS: { color: "#ef4444", type: "solid" },
  IS_BLOCKED_BY: { color: "#ef4444", type: "dashed" },
  FIXES: { color: "#22c55e", type: "solid" },
  IMPLEMENTS: { color: "#3b82f6", type: "solid" },
  REFERENCES: { color: "#a855f7", type: "dashed" },
  RELATES: { color: "#6b7280", type: "dotted" },
  CONTAINS: { color: "#06b6d4", type: "solid" },
  TOUCHES: { color: "#f97316", type: "dotted" },
  PARENT_OF: { color: "#14b8a6", type: "solid" },
  CHILD_OF: { color: "#14b8a6", type: "dashed" },
  DUPLICATES: { color: "#eab308", type: "dashed" },
};

function edgesToGraph(edges: WorkGraphEdge[]): {
  nodes: WorkGraphNode[];
  links: WorkGraphLink[];
} {
  const nodeMap = new Map<string, WorkGraphNode>();
  const links: WorkGraphLink[] = [];

  for (const edge of edges) {
    const sourceKey = `${edge.sourceType}:${edge.sourceId}`;
    const targetKey = `${edge.targetType}:${edge.targetId}`;

    if (!nodeMap.has(sourceKey)) {
      nodeMap.set(sourceKey, {
        id: sourceKey,
        name: edge.sourceId,
        type: edge.sourceType,
        category: ["ISSUE", "PR", "COMMIT", "FILE"].indexOf(edge.sourceType),
        symbolSize: edge.sourceType === "FILE" ? 20 : 30,
      });
    }

    if (!nodeMap.has(targetKey)) {
      nodeMap.set(targetKey, {
        id: targetKey,
        name: edge.targetId,
        type: edge.targetType,
        category: ["ISSUE", "PR", "COMMIT", "FILE"].indexOf(edge.targetType),
        symbolSize: edge.targetType === "FILE" ? 20 : 30,
      });
    }

    links.push({
      source: sourceKey,
      target: targetKey,
      edgeType: edge.edgeType,
      confidence: edge.confidence,
      lineStyle: {
        width: Math.max(1, edge.confidence * 3),
        opacity: 0.4 + edge.confidence * 0.6,
      },
    });
  }

  return {
    nodes: Array.from(nodeMap.values()),
    links,
  };
}

export function WorkGraphExplorer({
  edges,
  height = 600,
  width = "100%",
  className,
  style,
  onNodeClick,
  selectedNodeId,
}: WorkGraphExplorerProps) {
  const chartTheme = useChartTheme();

  const { nodes, links } = useMemo(() => edgesToGraph(edges), [edges]);

  const categories = useMemo(
    () => [
      { name: "Issue", itemStyle: { color: NODE_TYPE_COLORS.ISSUE } },
      { name: "PR", itemStyle: { color: NODE_TYPE_COLORS.PR } },
      { name: "Commit", itemStyle: { color: NODE_TYPE_COLORS.COMMIT } },
      { name: "File", itemStyle: { color: NODE_TYPE_COLORS.FILE } },
    ],
    []
  );

  const option: EChartsOption = useMemo(() => {
    const echartsNodes = nodes.map((node) => ({
      id: node.id,
      name: node.name,
      category: node.category,
      symbolSize: selectedNodeId === node.id ? node.symbolSize * 1.5 : node.symbolSize,
      symbol: NODE_TYPE_SYMBOLS[node.type],
      itemStyle: {
        color: NODE_TYPE_COLORS[node.type],
        borderColor: selectedNodeId === node.id ? "#fff" : undefined,
        borderWidth: selectedNodeId === node.id ? 2 : 0,
      },
      label: {
        show: node.symbolSize > 25,
        position: "bottom" as const,
        fontSize: 10,
        color: chartTheme.text,
      },
    }));

    const echartsLinks = links.map((link) => {
      const linkStyle = EDGE_TYPE_STYLES[link.edgeType] ?? {
        color: "#6b7280",
        type: "solid" as const,
      };
      return {
        source: link.source,
        target: link.target,
        lineStyle: {
          color: linkStyle.color,
          type: linkStyle.type,
          width: link.lineStyle?.width ?? 1,
          opacity: link.lineStyle?.opacity ?? 0.6,
          curveness: 0.1,
        },
      };
    });

    return {
      tooltip: {
        trigger: "item",
        backgroundColor: chartTheme.background,
        borderColor: chartTheme.stroke,
        textStyle: { color: chartTheme.text },
        formatter: (params: unknown) => {
          const p = params as { dataType?: string; data?: { name?: string; id?: string; edgeType?: string } };
          if (p.dataType === "node") {
            const nodeId = p.data?.id ?? "";
            const [type, id] = nodeId.split(":");
            return `<strong>${type}</strong><br/>${id}`;
          }
          if (p.dataType === "edge") {
            return `${p.data?.edgeType ?? "relates"}`;
          }
          return "";
        },
      },
      series: [
        {
          type: "graph",
          layout: "force",
          animation: true,
          data: echartsNodes,
          links: echartsLinks,
          categories,
          left: 24,
          right: 24,
          top: 24,
          bottom: 24,
          center: ["50%", "54%"],
          roam: true,
          draggable: true,
          force: {
            repulsion: 150,
            gravity: 0.18,
            edgeLength: [60, 150],
            layoutAnimation: true,
          },
          emphasis: {
            focus: "adjacency",
            lineStyle: { width: 4 },
          },
          label: {
            show: false,
          },
          edgeSymbol: ["none", "arrow"],
          edgeSymbolSize: [0, 8],
        },
      ],
    };
  }, [nodes, links, categories, chartTheme, selectedNodeId]);

  const handleEvents = useMemo(
    () => ({
      click: (params: unknown) => {
        const p = params as { dataType?: string; data?: { id?: string } };
        if (p.dataType === "node" && p.data?.id && onNodeClick) {
          const [type, id] = p.data.id.split(":");
          onNodeClick(id, type as WorkGraphNodeType);
        }
      },
    }),
    [onNodeClick]
  );

  if (edges.length === 0) {
    return (
      <div
        className={`flex items-center justify-center ${className || ""}`}
        style={{
          height,
          width,
          ...style,
        }}
      >
        <p className="text-(--ink-muted)">No edges to display</p>
      </div>
    );
  }

  return (
    <Chart
      option={option}
      className={className}
      style={{ height, width, ...style }}
      onEvents={handleEvents}
      chartTheme={chartTheme}
    />
  );
}

export function WorkGraphLegend() {
  return (
    <div className="space-y-3 text-[11px]">
      <div className="space-y-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-(--ink-muted)">
          Node Types
        </p>
        <div className="space-y-2">
          {(Object.entries(NODE_TYPE_COLORS) as [WorkGraphNodeType, string][]).map(
            ([type]) => {
              const bgClass = {
                ISSUE: "bg-[#f59e0b]",
                PR: "bg-[#10b981]",
                COMMIT: "bg-[#6366f1]",
                FILE: "bg-[#8b5cf6]",
              }[type];
              return (
                <div
                  key={type}
                  className="flex items-center gap-2 rounded-xl border border-(--card-stroke) px-2 py-2"
                >
                  <span className={`h-3 w-3 shrink-0 rounded-sm ${bgClass}`} />
                  <span className="leading-none">{type}</span>
                </div>
              );
            }
          )}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-(--ink-muted)">
          Edge Types
        </p>
        <div className="space-y-2">
          {Object.entries(EDGE_TYPE_STYLES)
            .slice(0, 6)
            .map(([type]) => {
              const bgClass = {
                BLOCKS: "bg-[#ef4444]",
                IS_BLOCKED_BY: "bg-[#ef4444]",
                FIXES: "bg-[#22c55e]",
                IMPLEMENTS: "bg-[#3b82f6]",
                REFERENCES: "bg-[#a855f7]",
                RELATES: "bg-[#6b7280]",
              }[type] || "bg-gray-500";
              return (
                <div
                  key={type}
                  className="flex items-center gap-2 rounded-xl border border-(--card-stroke) px-2 py-2"
                >
                  <span className={`h-0.5 w-4 shrink-0 ${bgClass}`} />
                  <span className="leading-tight">{type.toLowerCase().replace(/_/g, " ")}</span>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
