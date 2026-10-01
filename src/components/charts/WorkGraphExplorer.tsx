"use client";

import { type CSSProperties, useCallback, useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { GraphChart } from "echarts/charts";

import { Chart } from "./Chart";
import { type ChartTokens, useChartColors, useChartTheme, useChartTokens } from "./chartTheme";
import { echarts } from "@/lib/echartsInit";
import { CTA_LABELS } from "@/lib/design/cta";
import { layoutLayered } from "@/lib/workGraphLayout";
import { ChartTypeToggle } from "./ChartTypeToggle";
import type { WorkGraphEdge, WorkGraphNodeType, WorkGraphEdgeType } from "@/lib/graphql/types";

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
    onNodeClickAction?: (nodeId: string, nodeType: WorkGraphNodeType) => void;
    selectedNodeId?: string;
};

// Node colors: an index into the theme series colors, or a status role.
const NODE_TYPE_COLOR_SOURCE: Record<WorkGraphNodeType, number | "negative"> = {
    ISSUE: 1,
    PR: 0,
    COMMIT: 5,
    FILE: 8,
    RELEASE: 3,
    FEATURE_FLAG: 4,
    AI_WORKFLOW_RUN: 9,
    DIFF: 6,
    REVIEW_OUTCOME: 7,
    DEPLOYMENT: 2,
    INCIDENT: "negative",
};

const buildNodeTypeColors = (
    colors: readonly string[],
    tokens: ChartTokens,
): Record<WorkGraphNodeType, string> => {
    const out = {} as Record<WorkGraphNodeType, string>;
    for (const type of Object.keys(NODE_TYPE_COLOR_SOURCE) as WorkGraphNodeType[]) {
        const source = NODE_TYPE_COLOR_SOURCE[type];
        out[type] = source === "negative" ? tokens.negative : (colors[source] ?? tokens.info);
    }
    return out;
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
    "ISSUE",
    "PR",
    "COMMIT",
    "FILE",
    "RELEASE",
    "FEATURE_FLAG",
    "AI_WORKFLOW_RUN",
    "DIFF",
    "REVIEW_OUTCOME",
    "DEPLOYMENT",
    "INCIDENT",
];

export type WorkGraphLayoutMode = "layered" | "network";

const LAYOUT_MODE_OPTIONS: Array<{ id: WorkGraphLayoutMode; label: string }> = [
    { id: "layered", label: "Layered" },
    { id: "network", label: "Network" },
];

const FILTERABLE_NODE_TYPES: WorkGraphNodeType[] = ["RELEASE", "FEATURE_FLAG"];

type EdgeColorSource = number | "negative" | "positive" | "info" | "caution" | "muted";
type EdgeLineType = "solid" | "dashed" | "dotted";

// Edge colors: an index into the theme series colors, or a status role.
const EDGE_TYPE_STYLE_SOURCE: Record<string, { color: EdgeColorSource; type: EdgeLineType }> = {
    BLOCKS: { color: "negative", type: "solid" },
    IS_BLOCKED_BY: { color: "negative", type: "dashed" },
    FIXES: { color: "positive", type: "solid" },
    IMPLEMENTS: { color: "info", type: "solid" },
    REFERENCES: { color: 5, type: "dashed" },
    RELATES: { color: "muted", type: "dotted" },
    CONTAINS: { color: 3, type: "solid" },
    TOUCHES: { color: 4, type: "dotted" },
    PARENT_OF: { color: 0, type: "solid" },
    CHILD_OF: { color: 0, type: "dashed" },
    DUPLICATES: { color: "caution", type: "dashed" },
    INTRODUCED_BY: { color: 6, type: "dashed" },
    CONFIG_CHANGED_BY: { color: "caution", type: "dashed" },
    GUARDS: { color: "caution", type: "solid" },
    IMPACTS: { color: "muted", type: "dotted" },
    HAS_AI_WORKFLOW: { color: 9, type: "solid" },
    GENERATES: { color: 7, type: "solid" },
    HAS_REVIEW_OUTCOME: { color: 8, type: "solid" },
    DEPLOYS: { color: 2, type: "solid" },
    LINKED_INCIDENT: { color: "negative", type: "dashed" },
};

type EdgeStyle = { color: string; type: EdgeLineType };

const buildEdgeTypeStyles = (
    colors: readonly string[],
    tokens: ChartTokens,
    mutedColor: string,
): Record<string, EdgeStyle> => {
    const out: Record<string, EdgeStyle> = {};
    for (const [edgeType, source] of Object.entries(EDGE_TYPE_STYLE_SOURCE)) {
        const color =
            typeof source.color === "number"
                ? (colors[source.color] ?? mutedColor)
                : source.color === "muted"
                  ? mutedColor
                  : tokens[source.color];
        out[edgeType] = { color, type: source.type };
    }
    return out;
};

function useWorkGraphColors() {
    const chartTheme = useChartTheme();
    const seriesColors = useChartColors();
    const tokens = useChartTokens();
    return useMemo(
        () => ({
            nodeTypeColors: buildNodeTypeColors(seriesColors, tokens),
            edgeTypeStyles: buildEdgeTypeStyles(seriesColors, tokens, chartTheme.muted),
        }),
        [seriesColors, tokens, chartTheme.muted],
    );
}

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
    onNodeClickAction,
    selectedNodeId,
}: WorkGraphExplorerProps) {
    const chartTheme = useChartTheme();
    const { nodeTypeColors, edgeTypeStyles } = useWorkGraphColors();

    // Page state only: the connection slice select next to this chart is state-only too.
    const [layoutMode, setLayoutMode] = useState<WorkGraphLayoutMode>("layered");
    const [hiddenNodeTypes, setHiddenNodeTypes] = useState<Set<WorkGraphNodeType>>(() => new Set());

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

    const layered = useMemo(() => layoutLayered(nodes, links), [nodes, links]);

    const categories = useMemo(
        () =>
            ALL_NODE_TYPES.map((type) => ({
                name: NODE_TYPE_LABELS[type],
                itemStyle: { color: nodeTypeColors[type] },
            })),
        [nodeTypeColors],
    );

    const option: EChartsOption = useMemo(() => {
        const totalGraphics = nodes.length + links.length;
        const animateGraph = totalGraphics < 2000;
        const isLayered = layoutMode === "layered";
        const useForceLayout = !isLayered && totalGraphics < 900;
        const showNodeLabels = nodes.length <= 120;
        const echartsNodes = nodes.map((node) => ({
            id: node.id,
            name: node.name,
            category: node.category,
            ...(isLayered
                ? { x: layered.positions.get(node.id)?.x, y: layered.positions.get(node.id)?.y }
                : {}),
            symbolSize: selectedNodeId === node.id ? node.symbolSize * 1.5 : node.symbolSize,
            symbol: NODE_TYPE_SYMBOLS[node.type],
            itemStyle: {
                color: nodeTypeColors[node.type],
                borderColor: selectedNodeId === node.id ? chartTheme.text : undefined,
                borderWidth: selectedNodeId === node.id ? 2 : 0,
            },
            label: {
                show: showNodeLabels && node.symbolSize > 25,
                position: isLayered ? ("right" as const) : ("bottom" as const),
                fontSize: 10,
                color: chartTheme.text,
            },
        }));

        const nodeById = new Map(nodes.map((node) => [node.id, node]));
        const echartsLinks = links.map((link) => {
            const linkStyle = edgeTypeStyles[link.edgeType] ?? {
                color: chartTheme.muted,
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
                    // a link inside one column (same type) bows out so it stays readable
                    curveness:
                        isLayered &&
                        nodeById.get(link.source)?.type === nodeById.get(link.target)?.type
                            ? 0.45
                            : 0.1,
                },
            };
        });

        return {
            animation: animateGraph,
            animationThreshold: 2000,
            tooltip: {
                trigger: "item",
                backgroundColor: chartTheme.background,
                borderColor: chartTheme.stroke,
                textStyle: { color: chartTheme.text },
                formatter: (params: unknown) => {
                    const p = params as {
                        dataType?: string;
                        data?: { name?: string; id?: string; edgeType?: string };
                    };
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
                    layout: isLayered ? "none" : useForceLayout ? "force" : "circular",
                    animation: animateGraph,
                    data: echartsNodes,
                    links: echartsLinks,
                    categories,
                    left: 56,
                    right: 56,
                    top: 48,
                    bottom: 48,
                    center: ["50%", "50%"],
                    roam: true,
                    draggable: useForceLayout,
                    force: useForceLayout
                        ? {
                              repulsion: 150,
                              gravity: 0.18,
                              edgeLength: [60, 150],
                              layoutAnimation: animateGraph,
                          }
                        : undefined,
                    circular: useForceLayout
                        ? undefined
                        : {
                              rotateLabel: false,
                          },
                    emphasis: {
                        focus: "adjacency",
                        lineStyle: { width: 4 },
                    },
                    label: {
                        show: false,
                    },
                    edgeSymbol: useForceLayout ? ["none", "arrow"] : ["none", "none"],
                    edgeSymbolSize: useForceLayout ? [0, 8] : [0, 0],
                },
            ],
        };
    }, [
        nodes,
        links,
        categories,
        chartTheme,
        selectedNodeId,
        nodeTypeColors,
        edgeTypeStyles,
        layoutMode,
        layered,
    ]);

    const handleEvents = useMemo(
        () => ({
            click: (params: unknown) => {
                const p = params as { dataType?: string; data?: { id?: string } };
                if (p.dataType === "node" && p.data?.id && onNodeClickAction) {
                    const [type, id] = p.data.id.split(":");
                    onNodeClickAction(id, type as WorkGraphNodeType);
                }
            },
        }),
        [onNodeClickAction],
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
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
                <ChartTypeToggle
                    options={LAYOUT_MODE_OPTIONS}
                    value={layoutMode}
                    onChangeAction={setLayoutMode}
                />
                {layoutMode === "layered" && (
                    <span className="text-(--ink-muted)" data-testid="work-graph-columns">
                        {layered.columns
                            .map((column) => `${NODE_TYPE_LABELS[column.type]} · ${column.count}`)
                            .join("  →  ")}
                    </span>
                )}
            </div>
            {layoutMode === "layered" && layered.columns.length < 3 && (
                <p
                    className="mb-2 px-1 text-xs text-(--ink-muted)"
                    data-testid="work-graph-columns-hint"
                >
                    This connection type shows{" "}
                    {layered.columns.length === 1 ? "one column" : "two columns"}. Pick PRs →
                    Commits → Files or All connections for more columns.
                </p>
            )}
            {FILTERABLE_NODE_TYPES.length > 0 && (
                <div className="mb-2 flex flex-wrap items-center gap-2 px-1 text-xs">
                    <span className="mr-1 uppercase tracking-[0.16em] text-(--ink-muted)">
                        Show
                    </span>
                    {FILTERABLE_NODE_TYPES.map((type) => (
                        <label
                            key={type}
                            title={NODE_TYPE_LABELS[type]}
                            className="flex cursor-pointer items-center gap-1.5 rounded-full border border-(--card-stroke) bg-(--card-90) px-2 py-1 text-(--ink-muted) transition-colors hover:text-foreground"
                        >
                            <input
                                type="checkbox"
                                checked={!hiddenNodeTypes.has(type)}
                                onChange={() => toggleNodeType(type)}
                                className="accent-current"
                                style={{ accentColor: nodeTypeColors[type] }}
                            />
                            <span
                                className="inline-block h-2.5 w-2.5 rounded-sm"
                                style={{ backgroundColor: nodeTypeColors[type] }}
                            />
                            <span>{NODE_TYPE_LABELS[type]}</span>
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
    "BLOCKS",
    "IS_BLOCKED_BY",
    "FIXES",
    "IMPLEMENTS",
    "REFERENCES",
    "RELATES",
    "INTRODUCED_BY",
    "CONFIG_CHANGED_BY",
    "GUARDS",
    "IMPACTS",
];

const LEGEND_EDGE_LABELS: Record<WorkGraphEdgeType, string> = {
    BLOCKS: "blocks",
    IS_BLOCKED_BY: "is blocked by",
    FIXES: "fixes",
    IMPLEMENTS: "implements",
    REFERENCES: "references",
    RELATES: "relates",
    INTRODUCED_BY: "introduced by",
    CONFIG_CHANGED_BY: "config changed by",
    GUARDS: "guards",
    IMPACTS: "impacts",
    CONTAINS: "contains",
    TOUCHES: "touches",
    DEPLOYS: "deploys",
    LINKED_INCIDENT: "linked incident",
    IS_RELATED_TO: "is related to",
    DUPLICATES: "duplicates",
    IS_DUPLICATE_OF: "is duplicate of",
    PARENT_OF: "parent of",
    CHILD_OF: "child of",
    HAS_AI_WORKFLOW: "has AI workflow",
    GENERATES: "generates",
    HAS_REVIEW_OUTCOME: "has review outcome",
};

type WorkGraphLegendProps = {
    collapsed?: boolean;
    onToggleAction?: () => void;
};

export function WorkGraphLegend({ collapsed = false, onToggleAction }: WorkGraphLegendProps) {
    const { nodeTypeColors, edgeTypeStyles } = useWorkGraphColors();
    if (collapsed) {
        return (
            <div className="flex flex-col items-center gap-3 text-(--ink-muted)">
                <button
                    type="button"
                    onClick={onToggleAction}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-(--card-stroke) text-sm transition-colors hover:border-(--accent)/40 hover:text-foreground"
                    aria-label={CTA_LABELS.expandLegend}
                    title={CTA_LABELS.expandLegend}
                >
                    ◀
                </button>
                <div className="flex flex-col items-center gap-1.5">
                    {ALL_NODE_TYPES.slice(0, 7).map((type) => (
                        <span
                            key={type}
                            className="h-2.5 w-2.5 rounded-full"
                            title={NODE_TYPE_LABELS[type]}
                            style={{ backgroundColor: nodeTypeColors[type] }}
                        />
                    ))}
                </div>
                <span className="[writing-mode:vertical-rl] rotate-180 text-label-caps uppercase tracking-[0.2em]">
                    Legend
                </span>
            </div>
        );
    }

    return (
        <div className="text-xs text-(--ink-muted)">
            <div className="flex items-center justify-between gap-3 px-1 py-1">
                <div>
                    <p className="text-label-caps font-medium uppercase tracking-[0.18em]">
                        Legend
                    </p>
                    <p className="mt-0.5 text-xs">Node colors + edge styles</p>
                </div>
                <button
                    type="button"
                    onClick={onToggleAction}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-(--card-stroke) text-sm transition-colors hover:border-(--accent)/40 hover:text-foreground"
                    aria-label={CTA_LABELS.collapseLegend}
                    title={CTA_LABELS.collapseLegend}
                >
                    ▶
                </button>
            </div>
            <div className="mt-3 space-y-4 border-t border-(--card-stroke) pt-3">
                <section className="space-y-2">
                    <p className="text-label-caps font-medium uppercase tracking-[0.18em]">
                        Node Types
                    </p>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                        {ALL_NODE_TYPES.map((type) => (
                            <div
                                key={type}
                                title={NODE_TYPE_LABELS[type]}
                                className="flex min-w-0 items-center gap-2"
                            >
                                <span
                                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                                    style={{ backgroundColor: nodeTypeColors[type] }}
                                />
                                <span className="min-w-0 truncate leading-none text-foreground/85">
                                    {NODE_TYPE_LABELS[type]}
                                </span>
                            </div>
                        ))}
                    </div>
                </section>
                <section className="space-y-2">
                    <p className="text-label-caps font-medium uppercase tracking-[0.18em]">
                        Edge Types
                    </p>
                    <div className="grid gap-y-2">
                        {LEGEND_EDGE_TYPES.map((type) => {
                            const edgeStyle = edgeTypeStyles[type];
                            const label = LEGEND_EDGE_LABELS[type];
                            return (
                                <div
                                    key={type}
                                    title={label}
                                    className="flex min-w-0 items-center gap-2"
                                >
                                    <span
                                        className="h-0.5 w-5 shrink-0"
                                        style={{
                                            backgroundColor:
                                                edgeStyle?.color ?? "var(--chart-muted)",
                                            borderBottom:
                                                edgeStyle?.type === "dashed"
                                                    ? `2px dashed ${edgeStyle.color}`
                                                    : edgeStyle?.type === "dotted"
                                                      ? `2px dotted ${edgeStyle.color}`
                                                      : undefined,
                                        }}
                                    />
                                    <span className="min-w-0 truncate leading-tight text-foreground/85">
                                        {label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </section>
            </div>
        </div>
    );
}
