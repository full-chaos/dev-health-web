"use client";

import { type CSSProperties, useCallback, useMemo } from "react";

import { SankeyChart as EChartsSankeyChart } from "echarts/charts";

import { Chart } from "./Chart";
import { useChartTheme } from "./chartTheme";
import { echarts } from "@/lib/echartsInit";
import type { SankeyLink, SankeyNode } from "@/lib/types";
import { chartEntityLabel } from "@/lib/labels/entityLabel";
import { formatNumber, formatPercent } from "@/lib/formatters";

echarts.use([EChartsSankeyChart]);

type SankeyChartProps = {
    nodes: SankeyNode[];
    links: SankeyLink[];
    unit?: string;
    height?: number | string;
    width?: number | string;
    className?: string;
    style?: CSSProperties;
    tooltipFormatterAction?: (params: unknown, unit: string) => string;
    onItemClickAction?: (item: {
        type: "node" | "link";
        name?: string;
        source?: string;
        target?: string;
        value?: number;
    }) => void;
};

// Compute flow totals from links/nodes data
function computeFlowTotals(nodes: SankeyNode[], links: SankeyLink[]) {
    const incomingTotals = new Map<string, number>();
    const outgoingTotals = new Map<string, number>();
    const nodeValueByName = new Map<string, number>();

    links.forEach((link) => {
        outgoingTotals.set(link.source, (outgoingTotals.get(link.source) ?? 0) + link.value);
        incomingTotals.set(link.target, (incomingTotals.get(link.target) ?? 0) + link.value);
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
        rootTotal > 0 ? rootTotal : links.reduce((total, link) => total + link.value, 0);

    return { incomingTotals, outgoingTotals, nodeValueByName, totalFlow };
}

const formatValue = (value: number | undefined, unit: string) => {
    if (typeof value !== "number" || Number.isNaN(value)) {
        return "--";
    }
    return `${formatNumber(value, { maximumFractionDigits: 0 })} ${unit}`;
};

const formatShare = (value: number, total: number) => {
    if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
        return "--";
    }
    return formatPercent((value / total) * 100);
};

export function SankeyChart({
    nodes,
    links,
    unit = "items",
    height = 320,
    width = "100%",
    className,
    style,
    tooltipFormatterAction,
    onItemClickAction,
}: SankeyChartProps) {
    const chartTheme = useChartTheme();

    const mergedStyle: CSSProperties = useMemo(
        () => ({ height, width, ...style }),
        [height, width, style],
    );

    const { chartNodes, chartLinks, labelByKey } = useMemo(() => {
        const keyByRef = new Map<string, string>();
        const labelByKey = new Map<string, string>();

        const makeKey = (node: SankeyNode) => {
            if (node.id) {
                return node.id;
            }
            if (node.group) {
                return `${node.group}:${node.name}`;
            }
            return node.name;
        };

        nodes.forEach((node) => {
            const key = makeKey(node);
            keyByRef.set(node.name, key);
            if (node.id) {
                keyByRef.set(node.id, key);
            }
            labelByKey.set(key, node.name);
        });

        const chartNodes = nodes.map((node) => ({
            ...node,
            name: keyByRef.get(node.name) ?? makeKey(node),
        }));

        const chartLinks = links.map((link) => ({
            ...link,
            source: keyByRef.get(link.source) ?? link.source,
            target: keyByRef.get(link.target) ?? link.target,
        }));

        return { chartNodes, chartLinks, labelByKey };
    }, [nodes, links]);

    const displayNameForKey = useCallback(
        (value: string) => {
            // Render-safe entity resolution (A7): a degraded label is the stable
            // short token, never a bare UUID/hash, so Sankey nodes/tooltips match
            // cards and tables.
            const base =
                labelByKey.get(value) ??
                (value.includes(":") ? value.split(":").slice(1).join(":") : value);
            // Preserve an empty value (e.g. unnamed edge endpoints) verbatim so
            // missing labels never degrade to a placeholder token.
            return base ? chartEntityLabel(base) : base;
        },
        [labelByKey],
    );

    // Memoize flow computations
    const { outgoingTotals, nodeValueByName, totalFlow } = useMemo(
        () => computeFlowTotals(chartNodes, chartLinks),
        [chartNodes, chartLinks],
    );

    // Memoize click handler
    const handleClick = useCallback(
        (params: unknown) => {
            if (!onItemClickAction || !params || typeof params !== "object") {
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
            onItemClickAction({
                type: isLink ? "link" : "node",
                name: displayNameForKey(data.name ?? entry.name ?? ""),
                source: data.source ? displayNameForKey(data.source) : undefined,
                target: data.target ? displayNameForKey(data.target) : undefined,
                value: data.value,
            });
        },
        [displayNameForKey, onItemClickAction],
    );

    // Memoize the ECharts option to prevent re-renders
    const option = useMemo(() => {
        const defaultTooltipFormatter = (params: unknown) => {
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
                const sourceLabel = data.source ? displayNameForKey(data.source) : "";
                const targetLabel = data.target ? displayNameForKey(data.target) : "";
                const totalFromSource =
                    data.source && outgoingTotals.has(data.source)
                        ? (outgoingTotals.get(data.source) ?? 0)
                        : 0;
                const unitLabel = unit === "hours" ? "Elapsed" : "Value";
                const shareLine =
                    totalFromSource > 0 && typeof data.value === "number"
                        ? `<br/><span style="color: ${chartTheme.accent2}">${formatShare(data.value, totalFromSource)}</span> of source flow`
                        : "";

                return `
          <div style="font-weight: 600; margin-bottom: 4px;">Flow</div>
          <div style="font-size: 11px; color: ${chartTheme.muted}">${sourceLabel} &rarr; ${targetLabel}</div>
          <div style="margin-top: 4px;">
            <span style="color: ${chartTheme.muted}">${unitLabel}:</span> 
            <span style="font-weight: 600; font-family: monospace;">${formatValue(data.value, unit)}</span>
            ${shareLine}
          </div>
        `;
            }

            const rawNodeName = data.name ?? entry.name ?? "";
            const nodeName = displayNameForKey(rawNodeName);

            const nodeValue =
                typeof data.value === "number"
                    ? data.value
                    : (nodeValueByName.get(rawNodeName) ?? 0);
            const unitLabel = unit === "hours" ? "Total Elapsed" : "Total Value";
            const shareLine =
                totalFlow > 0
                    ? `<br/><span style="color: ${chartTheme.accent2}">${formatShare(nodeValue, totalFlow)}</span> of total`
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

        return {
            tooltip: {
                trigger: "item" as const,
                confine: true,
                backgroundColor: chartTheme.background,
                borderColor: chartTheme.stroke,
                textStyle: {
                    color: chartTheme.text,
                },
                position: (
                    point: number[],
                    _params: unknown,
                    _dom: unknown,
                    _rect: unknown,
                    size: { contentSize: number[]; viewSize: number[] },
                ): number[] => {
                    const [x, y] = point;
                    const [tooltipWidth, tooltipHeight] = size.contentSize;
                    const [viewWidth, viewHeight] = size.viewSize;
                    const padding = 16;
                    // Position to the right if there's room, otherwise to the left
                    let newX = x + padding;
                    if (newX + tooltipWidth > viewWidth) {
                        newX = x - tooltipWidth - padding;
                    }
                    // Position below if there's room, otherwise above
                    let newY = y + padding;
                    if (newY + tooltipHeight > viewHeight) {
                        newY = y - tooltipHeight - padding;
                    }
                    // Ensure tooltip stays within bounds
                    newX = Math.max(0, Math.min(newX, viewWidth - tooltipWidth));
                    newY = Math.max(0, Math.min(newY, viewHeight - tooltipHeight));
                    return [newX, newY];
                },
                formatter: (params: unknown) =>
                    tooltipFormatterAction
                        ? tooltipFormatterAction(params, unit)
                        : defaultTooltipFormatter(params),
            },
            series: [
                {
                    type: "sankey" as const,
                    emphasis: { focus: "adjacency" as const },
                    data: chartNodes,
                    links: chartLinks,
                    roam: false,
                    lineStyle: { color: "gradient", curveness: 0.5, opacity: 0.45 },
                    label: {
                        color: chartTheme.text,
                        fontSize: 11,
                        formatter: (params: unknown) => {
                            if (!params || typeof params !== "object") {
                                return "";
                            }
                            const entry = params as { name?: string };
                            const name = entry.name || "";
                            return displayNameForKey(name);
                        },
                    },
                    itemStyle: {
                        borderColor: chartTheme.grid,
                        borderWidth: 1,
                    },
                    nodeGap: 14,
                },
            ],
        };
    }, [
        chartNodes,
        chartLinks,
        unit,
        chartTheme.text,
        chartTheme.grid,
        chartTheme.muted,
        chartTheme.accent2,
        chartTheme.background,
        chartTheme.stroke,
        outgoingTotals,
        nodeValueByName,
        totalFlow,
        tooltipFormatterAction,
        displayNameForKey,
    ]);

    // Memoize onEvents to prevent re-renders
    const onEvents = useMemo(
        () => (onItemClickAction ? { click: handleClick } : undefined),
        [onItemClickAction, handleClick],
    );

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
