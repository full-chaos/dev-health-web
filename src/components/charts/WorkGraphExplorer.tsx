"use client";

import { type CSSProperties, useCallback, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { GraphChart } from "echarts/charts";

import { Chart } from "./Chart";
import { useChartTheme } from "./chartTheme";
import { echarts } from "@/lib/echartsInit";
import type {
  WorkGraphEdge,
  WorkGraphNodeType,
  WorkGraphEdgeType,
} from "@/lib/graphql/types";

echarts.use([GraphChart]);

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
  RELEASE: "#0d9488",
  FEATURE_FLAG: "#d97706",
  AI_WORKFLOW_RUN: "#14b8a6",
  DIFF: "#ec4899",
  REVIEW_OUTCOME: "#84cc16",
  DEPLOYMENT: "#06b6d4",
  INCIDENT: "#ef4444",
};

const NODE_TYPE_SYMBOLS: Record<WorkGraphNodeType, string> = {
  ISSUE: "circle",
  PR: "diamond",
  COMMIT: "rect",
  FILE: "triangle",
  RELEASE: "roundRect",
  FEATURE_FLAG: "arrow",
  AI_WORKFLOW_RUN: "pin",
  DIFF: "rect",
  REVIEW_OUTCOME: "diamond",
  DEPLOYMENT: "roundRect",
  INCIDENT: "circle",
};

const NODE_TYPE_LABELS: Record<WorkGraphNodeType, string> = {
  ISSUE: "Issue",
  PR: "PR",
  COMMIT: "Commit",
  FILE: "File",
  RELEASE: "Release",
  FEATURE_FLAG: "Feature Flag",
  AI_WORKFLOW_RUN: "AI Workflow",
  DIFF: "Diff",
  REVIEW_OUTCOME: "Review",
  DEPLOYMENT: "Deployment",
  INCIDENT: "Incident",
};

const ALL_NODE_TYPES: WorkGraphNodeType[] = [
  "ISSUE", "PR", "COMMIT", "FILE", "RELEASE", "FEATURE_FLAG", "AI_WORKFLOW_RUN", "DIFF", "REVIEW_OUTCOME", "DEPLOYMENT", "INCIDENT",
];

const FILTERABLE_NODE_TYPES: WorkGraphNodeType[] = ["RELEASE", "FEATURE_FLAG"];

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
  INTRODUCED_BY: { color: "#0d9488", type: "dashed" },
  CONFIG_CHANGED_BY: { color: "#d97706", type: "dashed" },
  GUARDS: { color: "#d97706", type: "solid" },
  IMPACTS: { color: "#9ca3af", type: "dotted" },
  HAS_AI_WORKFLOW: { color: "#14b8a6", type: "solid" },
  GENERATES: { color: "#ec4899", type: "solid" },
  HAS_REVIEW_OUTCOME: { color: "#84cc16", type: "solid" },
  DEPLOYS: { color: "#06b6d4", type: "solid" },
  LINKED_INCIDENT: { color: "#ef4444", type: "dashed" },
};

const NODE_SIZE: Record<WorkGraphNodeType, number> = {
  ISSUE: 30,
  PR: 30,
  COMMIT: 30,
  FILE: 20,
  RELEASE: 34,
  FEATURE_FLAG: 28,
  AI_WORKFLOW_RUN: 30,
  DIFF: 24,
  REVIEW_OUTCOME: 26,
  DEPLOYMENT: 34,
  INCIDENT: 34,
};

function edgesToGraph(
  edges: WorkGraphEdge[],
  hiddenNodeTypes: Set<WorkGraphNodeType>,
): {
  nodes: WorkGraphNode[];
  links: WorkGraphLink[];
} {
  const nodeMap = new Map<string, WorkGraphNode>();
  const links: WorkGraphLink[] = [];

  for (const edge of edges) {
    if (hiddenNodeTypes.has(edge.sourceType) || hiddenNodeTypes.has(edge.targetType)) {
      continue;
    }

    const sourceKey = `${edge.sourceType}:${edge.sourceId}`;
    const targetKey = `${edge.targetType}:${edge.targetId}`;

    if (!nodeMap.has(sourceKey)) {
      nodeMap.set(sourceKey, {
        id: sourceKey,
        name: edge.sourceId,
        type: edge.sourceType,
        category: ALL_NODE_TYPES.indexOf(edge.sourceType),
        symbolSize: NODE_SIZE[edge.sourceType] ?? 30,
      });
    }

    if (!nodeMap.has(targetKey)) {
      nodeMap.set(targetKey, {
        id: targetKey,
        name: edge.targetId,
        type: edge.targetType,
        category: ALL_NODE_TYPES.indexOf(edge.targetType),
        symbolSize: NODE_SIZE[edge.targetType] ?? 30,
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

  const [hiddenNodeTypes, setHiddenNodeTypes] = useState<Set<WorkGraphNodeType>>(
    () => new Set(),
  );

  const toggleNodeType = useCallback((nodeType: WorkGraphNodeType) => {
    setHiddenNodeTypes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeType)) {
        next.delete(nodeType);
      } else {
        next.add(nodeType);
      }
      return next;
    });
  }, []);

  const { nodes, links } = useMemo(
    () => edgesToGraph(edges, hiddenNodeTypes),
    [edges, hiddenNodeTypes],
  );

  const categories = useMemo(
    () =>
      ALL_NODE_TYPES.map((type) => ({
        name: NODE_TYPE_LABELS[type],
        itemStyle: { color: NODE_TYPE_COLORS[type] },
      })),
    [],
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
    <div className={className} style={{ width, ...style }}>
      {FILTERABLE_NODE_TYPES.length > 0 && (
        <div className="mb-2 flex items-center gap-3 px-1">
          {FILTERABLE_NODE_TYPES.map((type) => (
            <label key={type} className="flex cursor-pointer items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={!hiddenNodeTypes.has(type)}
                onChange={() => toggleNodeType(type)}
                className="accent-current"
                style={{ accentColor: NODE_TYPE_COLORS[type] }}
              />
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: NODE_TYPE_COLORS[type] }}
              />
              <span className="text-(--ink-muted)">
                {NODE_TYPE_LABELS[type]}
              </span>
            </label>
          ))}
        </div>
      )}
      <Chart
        option={option}
        style={{ height, width: "100%" }}
        onEvents={handleEvents}
        chartTheme={chartTheme}
      />
    </div>
  );
}

const LEGEND_EDGE_TYPES: WorkGraphEdgeType[] = [
  "BLOCKS", "IS_BLOCKED_BY", "FIXES", "IMPLEMENTS", "REFERENCES", "RELATES",
  "INTRODUCED_BY", "CONFIG_CHANGED_BY", "GUARDS", "IMPACTS",
];

export function WorkGraphLegend() {
  return (
    <div className="space-y-3 text-[11px]">
      <div className="space-y-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-(--ink-muted)">
          Node Types
        </p>
        <div className="space-y-2">
          {ALL_NODE_TYPES.map((type) => (
            <div
              key={type}
              className="flex items-center gap-2 rounded-xl border border-(--card-stroke) px-2 py-2"
            >
              <span
                className="h-3 w-3 shrink-0 rounded-sm"
                style={{ backgroundColor: NODE_TYPE_COLORS[type] }}
              />
              <span className="leading-none">{NODE_TYPE_LABELS[type]}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-(--ink-muted)">
          Edge Types
        </p>
        <div className="space-y-2">
          {LEGEND_EDGE_TYPES.map((type) => {
            const edgeStyle = EDGE_TYPE_STYLES[type];
            return (
              <div
                key={type}
                className="flex items-center gap-2 rounded-xl border border-(--card-stroke) px-2 py-2"
              >
                <span
                  className="h-0.5 w-4 shrink-0"
                  style={{
                    backgroundColor: edgeStyle?.color ?? "#6b7280",
                    borderBottom: edgeStyle?.type === "dashed"
                      ? `2px dashed ${edgeStyle.color}`
                      : edgeStyle?.type === "dotted"
                        ? `2px dotted ${edgeStyle.color}`
                        : undefined,
                  }}
                />
                <span className="leading-tight">
                  {type.toLowerCase().replace(/_/g, " ")}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
