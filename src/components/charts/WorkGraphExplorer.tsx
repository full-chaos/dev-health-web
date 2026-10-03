"use client";

import {
    type CSSProperties,
    type MouseEvent as ReactMouseEvent,
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type { EChartsOption } from "echarts";
import { GraphChart } from "echarts/charts";

import { Chart } from "./Chart";
import { Button } from "@/components/shared/Button";
import { NODE_TYPE_COLOR_SOURCE } from "@/lib/workGraphNodeColors";
import { type ChartTokens, useChartColors, useChartTheme, useChartTokens } from "./chartTheme";
import { echarts } from "@/lib/echartsInit";
import { CTA_LABELS } from "@/lib/design/cta";
import {
    BOX_HEIGHT,
    LABEL_WIDTH,
    MARGIN_LEFT,
    MARGIN_RIGHT,
    MARGIN_Y,
    defaultGraphMode,
    innerLinkCurveness,
    layoutLayered,
} from "@/lib/workGraphLayout";
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
    /**
     * Layer visibility owned by the page ("Graph context" card). When both are given the
     * explorer shows no checkbox row of its own and obeys these; without them it keeps its own.
     */
    hiddenNodeTypes?: ReadonlySet<WorkGraphNodeType>;
    onToggleNodeTypeAction?: (nodeType: WorkGraphNodeType) => void;
    selectedNodeId?: string;
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

/**
 * Width steps of the layered drawing. 1 = the drawing fits the box. A larger step makes the
 * drawing wider than the box (more room between the columns), and the box scrolls sideways.
 */
export const ZOOM_LEVELS = [1, 1.5, 2, 3, 4] as const;
/** A drag shorter than this is a click (the chart library uses the same limit). */
const DRAG_START_PX = 4;
/** The wheel gives at most one zoom step in this time (a pinch sends many wheel events). */
const WHEEL_ZOOM_GAP_MS = 150;

const LAYOUT_MODE_OPTIONS: Array<{ id: WorkGraphLayoutMode; label: string }> = [
    { id: "layered", label: "Layered" },
    { id: "network", label: "Network" },
];

/** The node types a viewer can hide (layer visibility). */
export const LAYER_NODE_TYPES: WorkGraphNodeType[] = ["RELEASE", "FEATURE_FLAG"];
const FILTERABLE_NODE_TYPES = LAYER_NODE_TYPES;

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
    hiddenNodeTypes: ReadonlySet<WorkGraphNodeType>,
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
    hiddenNodeTypes: controlledHidden,
    onToggleNodeTypeAction,
}: WorkGraphExplorerProps) {
    const chartTheme = useChartTheme();
    const { nodeTypeColors, edgeTypeStyles } = useWorkGraphColors();

    // Page state only: the connection slice select next to this chart is state-only too.
    // `chosenMode` is the user's explicit pick; until then the default rule decides (below).
    const [chosenMode, setChosenMode] = useState<WorkGraphLayoutMode | null>(null);
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const [boxWidth, setBoxWidth] = useState(900);
    // The layered drawing is moved with the scroll of its box, NOT with a zoom of the chart
    // library: an "inside" data zoom takes every wheel event over the chart, so the box (which
    // can be thousands of px high) could no longer be scrolled with the wheel. So: the box
    // scrolls both ways, a drag scrolls it, and a zoom step makes the drawing wider.
    const [zoomStep, setZoomStep] = useState(0);
    const canvasWidth = Math.round(boxWidth * ZOOM_LEVELS[zoomStep]);
    const stripRef = useRef<HTMLDivElement | null>(null);
    // The point of the drawing that stays at the same place of the box through a zoom step.
    const zoomAnchor = useRef<{ share: number; offset: number } | null>(null);
    const lastWheelZoom = useRef(0);
    const dragged = useRef(false);
    const endDrag = useRef<(() => void) | null>(null);
    useEffect(() => () => endDrag.current?.(), []);
    const [ownHiddenNodeTypes, setHiddenNodeTypes] = useState<Set<WorkGraphNodeType>>(
        () => new Set(),
    );
    const isLayerControlled =
        controlledHidden !== undefined && onToggleNodeTypeAction !== undefined;
    const hiddenNodeTypes: ReadonlySet<WorkGraphNodeType> = isLayerControlled
        ? controlledHidden
        : ownHiddenNodeTypes;

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

    const layered = useMemo(
        () => layoutLayered(nodes, links, { width: canvasWidth }),
        [nodes, links, canvasWidth],
    );
    // One rule picks the opening mode (see defaultGraphMode); an explicit choice always wins.
    const layoutMode: WorkGraphLayoutMode = chosenMode ?? defaultGraphMode(layered.columns);
    const setLayoutMode = setChosenMode;
    const layeredHeight =
        layered.height + 2 * MARGIN_Y > BOX_HEIGHT ? layered.height + 2 * MARGIN_Y : BOX_HEIGHT;

    // Horizontal fit to the card: the drawing width follows the scroll area's width.
    useEffect(() => {
        const element = scrollRef.current;
        if (!element || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver((entries) => {
            const next = Math.round(entries[0]?.contentRect.width ?? 0);
            if (next > 0) setBoxWidth(next);
        });
        observer.observe(element);
        return () => observer.disconnect();
    }, [layoutMode]);

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
            // layered: coordinates go through explicit axes (below), so the drawing is placed
            // exactly (no automatic fit); network: the layout algorithm places the node
            ...(isLayered
                ? {
                      value: [
                          layered.positions.get(node.id)?.x ?? 0,
                          layered.positions.get(node.id)?.y ?? 0,
                      ],
                  }
                : {}),
            symbolSize: (() => {
                // dense columns get smaller marks so rows do not overlap
                const base = isLayered
                    ? Math.min(node.symbolSize, Math.max(6, layered.rowPitch * 0.7))
                    : node.symbolSize;
                return selectedNodeId === node.id ? base * 1.5 : base;
            })(),
            symbol: NODE_TYPE_SYMBOLS[node.type],
            itemStyle: {
                color: nodeTypeColors[node.type],
                borderColor: selectedNodeId === node.id ? chartTheme.text : undefined,
                borderWidth: selectedNodeId === node.id ? 2 : 0,
            },
            label: {
                // layered: every row is labelled (the canvas scrolls); network: production rule
                show: isLayered ? true : showNodeLabels && node.symbolSize > 25,
                ...(isLayered ? { width: LABEL_WIDTH, overflow: "truncate" as const } : {}),
                position: isLayered ? ("right" as const) : ("bottom" as const),
                fontSize: 10,
                color: chartTheme.text,
            },
        }));

        const nodeById = new Map(nodes.map((node) => [node.id, node]));
        const bowRoom = new Map(layered.columns.map((column) => [column.type, column.bowRoom]));
        const echartsLinks = links.map((link) => {
            const linkStyle = edgeTypeStyles[link.edgeType] ?? {
                color: chartTheme.muted,
                type: "solid" as const,
            };
            const sourceType = nodeById.get(link.source)?.type;
            // A link inside one column (same type) bows out so it stays readable: always to the
            // left of the column (the labels are on the right), and never wider than the free
            // room there, so it does not leave the canvas.
            const insideColumn =
                isLayered && sourceType !== undefined
                    ? sourceType === nodeById.get(link.target)?.type
                    : false;
            return {
                source: link.source,
                target: link.target,
                lineStyle: {
                    color: linkStyle.color,
                    type: linkStyle.type,
                    width: link.lineStyle?.width ?? 1,
                    opacity: link.lineStyle?.opacity ?? 0.6,
                    curveness: insideColumn
                        ? innerLinkCurveness(
                              layered.positions.get(link.source)?.y ?? 0,
                              layered.positions.get(link.target)?.y ?? 0,
                              (sourceType && bowRoom.get(sourceType)) || 0,
                          )
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
            ...(isLayered
                ? {
                      grid: {
                          left: MARGIN_LEFT,
                          right: MARGIN_RIGHT,
                          top: MARGIN_Y,
                          bottom: MARGIN_Y,
                      },
                      xAxis: {
                          type: "value" as const,
                          show: false,
                          min: 0,
                          max: Math.max(1, canvasWidth - MARGIN_LEFT - MARGIN_RIGHT),
                      },
                      yAxis: {
                          type: "value" as const,
                          show: false,
                          inverse: true,
                          min: 0,
                          max: Math.max(1, layered.height),
                      },
                  }
                : {}),
            series: [
                {
                    type: "graph",
                    ...(isLayered ? { coordinateSystem: "cartesian2d" as const } : {}),
                    layout: isLayered ? "none" : useForceLayout ? "force" : "circular",
                    animation: animateGraph,
                    data: echartsNodes,
                    links: echartsLinks,
                    categories,
                    ...(isLayered
                        ? {}
                        : {
                              left: 56,
                              right: 56,
                              top: MARGIN_Y,
                              bottom: MARGIN_Y,
                              center: ["50%", "50%"],
                          }),
                    // layered: the box scrolls (wheel, drag) and the zoom steps change the
                    // width, so no wheel zoom / drag pan of the chart library fights them
                    roam: !isLayered,
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
        canvasWidth,
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

    // The column names are outside the box (always in view), so they follow its sideways scroll.
    const syncColumnNames = useCallback(() => {
        const box = scrollRef.current;
        const strip = stripRef.current;
        if (box && strip) strip.style.transform = `translateX(${-box.scrollLeft}px)`;
    }, []);

    // One zoom step in (1), out (-1) or back to the fit (0). `offset` is the place of the box
    // (px from its left edge) that keeps its point of the drawing: the pointer for the wheel,
    // the middle of the box for the buttons.
    const changeZoom = useCallback(
        (direction: 1 | -1 | 0, offset?: number) => {
            const box = scrollRef.current;
            if (box && canvasWidth > 0) {
                const at = offset ?? box.clientWidth / 2;
                zoomAnchor.current = { share: (box.scrollLeft + at) / canvasWidth, offset: at };
            }
            setZoomStep((step) =>
                direction === 0
                    ? 0
                    : Math.min(ZOOM_LEVELS.length - 1, Math.max(0, step + direction)),
            );
        },
        [canvasWidth],
    );

    // After the width changed: put the kept point back at its place, then the column names.
    useLayoutEffect(() => {
        const box = scrollRef.current;
        const anchor = zoomAnchor.current;
        zoomAnchor.current = null;
        if (box && anchor) box.scrollLeft = Math.max(0, anchor.share * canvasWidth - anchor.offset);
        syncColumnNames();
    }, [canvasWidth, layoutMode, syncColumnNames]);

    // Ctrl (or the Command key) + wheel, which is also what a pinch on a trackpad sends, zooms.
    // The plain wheel is NOT touched: it scrolls the box. The listener is added by hand because
    // it must be able to stop the browser's own page zoom (React's wheel listener is passive).
    useEffect(() => {
        const box = scrollRef.current;
        if (!box) return;
        const onWheel = (event: WheelEvent) => {
            if (!event.ctrlKey && !event.metaKey) return;
            event.preventDefault();
            const now = Date.now();
            if (event.deltaY === 0 || now - lastWheelZoom.current < WHEEL_ZOOM_GAP_MS) return;
            lastWheelZoom.current = now;
            changeZoom(event.deltaY < 0 ? 1 : -1, event.clientX - box.getBoundingClientRect().left);
        };
        box.addEventListener("wheel", onWheel, { passive: false });
        return () => box.removeEventListener("wheel", onWheel);
    }, [layoutMode, changeZoom]);

    // A drag with the mouse scrolls the box (touch and trackpad scroll it without help).
    const startDrag = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
        const box = event.currentTarget;
        dragged.current = false;
        // The main button only, and not the scroll bar of the box (its target is the box).
        if (event.button !== 0 || event.target === box) return;
        const from = {
            x: event.clientX,
            y: event.clientY,
            left: box.scrollLeft,
            top: box.scrollTop,
        };
        const onMove = (move: MouseEvent) => {
            const dx = move.clientX - from.x;
            const dy = move.clientY - from.y;
            if (!dragged.current && Math.hypot(dx, dy) < DRAG_START_PX) return;
            dragged.current = true;
            box.scrollLeft = from.left - dx;
            box.scrollTop = from.top - dy;
        };
        const stop = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", stop);
            endDrag.current = null;
        };
        endDrag.current?.();
        endDrag.current = stop;
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", stop);
    }, []);

    // The drawing moves with the pointer, so the chart sees a drag as a click on the node under
    // the pointer. A click that ends a drag is not a selection: it does not reach the chart.
    const dropClickAfterDrag = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
        if (!dragged.current) return;
        dragged.current = false;
        event.stopPropagation();
    }, []);

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
            </div>
            {layoutMode === "layered" && (
                // the column strip stays outside the scroll area, so it is always visible
                <div
                    className="relative mb-1 h-5 overflow-hidden text-xs text-(--ink-muted)"
                    data-testid="work-graph-columns"
                >
                    <div
                        ref={stripRef}
                        className="absolute inset-y-0 left-0"
                        style={{ width: canvasWidth }}
                    >
                        {layered.columns.map((column) => (
                            <span
                                key={column.type}
                                className="absolute top-0 whitespace-nowrap"
                                style={{ left: MARGIN_LEFT + column.x - 6 }}
                            >
                                {NODE_TYPE_LABELS[column.type]} · {column.count}
                            </span>
                        ))}
                    </div>
                </div>
            )}
            {layoutMode === "layered" && (
                <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs text-(--ink-muted)">
                    <p className="mr-1" data-testid="work-graph-move-hint">
                        Drag or scroll to move. Zoom with the buttons or Ctrl + wheel.
                    </p>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => changeZoom(1)}
                        disabled={zoomStep === ZOOM_LEVELS.length - 1}
                    >
                        Zoom in
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => changeZoom(-1)}
                        disabled={zoomStep === 0}
                    >
                        Zoom out
                    </Button>
                    {zoomStep > 0 ? (
                        <Button variant="ghost" size="sm" onClick={() => changeZoom(0)}>
                            Reset zoom
                        </Button>
                    ) : null}
                </div>
            )}
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
            {!isLayerControlled && FILTERABLE_NODE_TYPES.length > 0 && (
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
            {layoutMode === "layered" ? (
                <div
                    ref={scrollRef}
                    className="overflow-auto select-none"
                    style={{ maxHeight: BOX_HEIGHT }}
                    data-testid="work-graph-scroll"
                    data-zoom={ZOOM_LEVELS[zoomStep]}
                    onScroll={syncColumnNames}
                    onMouseDown={startDrag}
                    onClickCapture={dropClickAfterDrag}
                >
                    <Chart
                        option={option}
                        style={{
                            height: layeredHeight,
                            width: zoomStep === 0 ? "100%" : canvasWidth,
                        }}
                        onEvents={handleEvents}
                        chartTheme={chartTheme}
                    />
                </div>
            ) : (
                <Chart
                    option={option}
                    style={{ height, width: "100%" }}
                    onEvents={handleEvents}
                    chartTheme={chartTheme}
                />
            )}
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
    /** "rail" (default): the narrow vertical strip; "row": a horizontal strip for under the graph. */
    orientation?: "rail" | "row";
    collapsed?: boolean;
    onToggleAction?: () => void;
};

type WorkGraphLayerTogglesProps = {
    hiddenNodeTypes: ReadonlySet<WorkGraphNodeType>;
    onToggleAction: (nodeType: WorkGraphNodeType) => void;
};

/** "Layer visibility": one checkbox per hideable node type (the same ones the explorer used to hold). */
export function WorkGraphLayerToggles({
    hiddenNodeTypes,
    onToggleAction,
}: WorkGraphLayerTogglesProps) {
    const { nodeTypeColors } = useWorkGraphColors();
    return (
        <div className="flex flex-col gap-2 text-sm" data-testid="layer-toggles">
            {LAYER_NODE_TYPES.map((type) => (
                <label
                    key={type}
                    title={NODE_TYPE_LABELS[type]}
                    className="flex cursor-pointer items-center justify-between gap-3 border-b border-(--card-stroke) py-2"
                >
                    <span className="flex items-center gap-2">
                        <span
                            className="inline-block h-2.5 w-2.5 rounded-sm"
                            style={{ backgroundColor: nodeTypeColors[type] }}
                        />
                        {NODE_TYPE_LABELS[type]}
                    </span>
                    <input
                        type="checkbox"
                        checked={!hiddenNodeTypes.has(type)}
                        onChange={() => onToggleAction(type)}
                        className="accent-current"
                        style={{ accentColor: nodeTypeColors[type] }}
                    />
                </label>
            ))}
        </div>
    );
}

export function WorkGraphLegend({
    collapsed = false,
    onToggleAction,
    orientation = "rail",
}: WorkGraphLegendProps) {
    const { nodeTypeColors, edgeTypeStyles } = useWorkGraphColors();
    if (collapsed) {
        return (
            <div
                className={`flex items-center gap-3 text-(--ink-muted) ${orientation === "row" ? "flex-row" : "flex-col"}`}
            >
                <button
                    type="button"
                    onClick={onToggleAction}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-(--card-stroke) text-sm transition-colors hover:border-(--accent)/40 hover:text-foreground"
                    aria-label={CTA_LABELS.expandLegend}
                    title={CTA_LABELS.expandLegend}
                >
                    ◀
                </button>
                <div
                    className={`flex items-center gap-1.5 ${orientation === "row" ? "flex-row" : "flex-col"}`}
                >
                    {ALL_NODE_TYPES.slice(0, 7).map((type) => (
                        <span
                            key={type}
                            className="h-2.5 w-2.5 rounded-full"
                            title={NODE_TYPE_LABELS[type]}
                            style={{ backgroundColor: nodeTypeColors[type] }}
                        />
                    ))}
                </div>
                <span
                    className={`text-label-caps uppercase tracking-[0.2em] ${orientation === "row" ? "" : "[writing-mode:vertical-rl] rotate-180"}`}
                >
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
