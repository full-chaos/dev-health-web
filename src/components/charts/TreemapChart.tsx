"use client";

import type { CSSProperties } from "react";
import { useCallback, useMemo } from "react";
// Type-only import from full echarts package (erased at runtime — no bundle impact).
import type { EChartsOption } from "echarts";
import { TreemapChart as EChartsTreemapChart } from "echarts/charts";

import { Chart } from "./Chart";
import { useChartColors, useChartTheme } from "./chartTheme";
import { echarts } from "@/lib/echartsInit";
import { buildTooltipHtml, calcPercent } from "@/lib/chartUtils";
import { depthOpacity, tileLabelColor } from "@/lib/chartLabelColor";
import { formatPercent } from "@/lib/formatters";

echarts.use([EChartsTreemapChart]);

export type TreemapNode = {
    name: string;
    value: number;
    children?: TreemapNode[];
    itemStyle?: {
        color?: string;
        opacity?: number;
    };
    [key: string]: unknown;
};

type TreemapChartProps = {
    data: TreemapNode;
    unit?: string;
    height?: number | string;
    width?: number | string;
    className?: string;
    style?: CSSProperties;
    useInputColors?: boolean;
    showBreadcrumb?: boolean;
    labelFormatterAction?: (params: unknown, totalValue: number) => string;
    tooltipFormatterAction?: (params: unknown, totalValue: number, unit: string) => string;
    onNodeClickAction?: (node: {
        name: string;
        value: number;
        path: string[];
        percent: number;
        data?: TreemapNode;
    }) => void;
};

/**
 * ECharts Treemap visualization for hierarchical data.
 * Used for Investment Mix and Code Hotspots to show dominance and distribution.
 */
export function TreemapChart({
    data,
    unit = "units",
    height = 400,
    width = "100%",
    className,
    style,
    useInputColors = false,
    showBreadcrumb = true,
    labelFormatterAction,
    tooltipFormatterAction,
    onNodeClickAction,
}: TreemapChartProps) {
    const chartTheme = useChartTheme();
    const chartColors = useChartColors();
    const mergedStyle: CSSProperties = { height, width, ...style };

    const totalValue = data.value || 0;

    // Assign colors to top-level children
    const coloredData = useMemo(() => {
        if (useInputColors || !data.children?.length) return data;

        // Generic palette path: no evidence-quality opacity here, so depth is shown by opacity steps.
        const assignColors = (
            node: TreemapNode,
            depth: number,
            colorIndex: number,
        ): TreemapNode => {
            const baseColor = chartColors[colorIndex % chartColors.length];
            return {
                ...node,
                itemStyle: { color: baseColor, opacity: depthOpacity(depth), ...node.itemStyle },
                children: node.children?.map((child, idx) =>
                    assignColors(child, depth + 1, depth === 0 ? idx : colorIndex),
                ),
            };
        };

        return {
            ...data,
            children: data.children.map((child, idx) => assignColors(child, 0, idx)),
        };
    }, [data, chartColors, useInputColors]);

    // Label ink per tile, chosen by contrast against the tile's blended fill; hidden if none passes.
    const labelledData = useMemo(() => {
        const candidates = [chartTheme.text, chartTheme.background] as const;
        const walk = (
            node: TreemapNode,
            inherited?: { color: string; opacity?: number },
        ): TreemapNode => {
            const color = node.itemStyle?.color ?? inherited?.color;
            const opacity = node.itemStyle?.opacity ?? inherited?.opacity;
            const ink = color
                ? tileLabelColor(color, opacity, chartTheme.background, candidates)
                : chartTheme.text;
            return {
                ...node,
                label: ink
                    ? { color: ink, ...(node.label as object | undefined) }
                    : { show: false },
                children: node.children?.map((child) =>
                    walk(child, color ? { color, opacity } : undefined),
                ),
            };
        };
        return (coloredData.children ?? []).map((child) => walk(child));
    }, [coloredData, chartTheme.background, chartTheme.text]);

    const handleClick = useCallback(
        (params: unknown) => {
            if (!onNodeClickAction || !params || typeof params !== "object") return;
            const entry = params as {
                data?: { name?: string; value?: number };
                treePathInfo?: Array<{ name: string; value: number }>;
            };
            const nodeData = entry.data as TreemapNode | undefined;
            if (!nodeData?.name) return;

            const path = entry.treePathInfo?.map((p) => p.name) ?? [nodeData.name];
            const value = nodeData.value ?? 0;
            const percent = calcPercent(value, totalValue);

            onNodeClickAction({
                name: nodeData.name,
                value,
                path,
                percent,
                data: nodeData,
            });
        },
        [onNodeClickAction, totalValue],
    );

    const option = useMemo(
        () =>
            ({
                tooltip: {
                    confine: true,
                    backgroundColor: chartTheme.background,
                    borderColor: chartTheme.stroke,
                    textStyle: {
                        color: chartTheme.text,
                    },
                    formatter: (params: unknown) => {
                        if (tooltipFormatterAction) {
                            return tooltipFormatterAction(params, totalValue, unit);
                        }
                        if (!params || typeof params !== "object") return "";
                        const entry = params as {
                            data?: { name?: string; value?: number };
                            treePathInfo?: Array<{ name: string }>;
                        };
                        const nodeData = entry.data;
                        if (!nodeData?.name) return "";

                        const path =
                            entry.treePathInfo
                                ?.slice(1)
                                .map((p) => p.name)
                                .join(" → ") ?? nodeData.name;
                        const value = nodeData.value ?? 0;
                        const percent = calcPercent(value, totalValue);

                        return buildTooltipHtml({
                            title: nodeData.name,
                            subtitle: path !== nodeData.name ? path : undefined,
                            value,
                            unit,
                            percent,
                            mutedColor: chartTheme.muted,
                            accentColor: chartTheme.accent2,
                        });
                    },
                },
                series: [
                    {
                        type: "treemap" as const,
                        data: labelledData,
                        top: 8,
                        left: 8,
                        right: 8,
                        bottom: 8,
                        roam: false,
                        nodeClick: false as const,
                        breadcrumb: showBreadcrumb
                            ? {
                                  show: true,
                                  top: 4,
                                  left: 8,
                                  itemStyle: {
                                      color: chartTheme.background,
                                      borderColor: chartTheme.stroke,
                                      textStyle: { color: chartTheme.text },
                                  },
                              }
                            : { show: false },
                        label: {
                            show: true,
                            formatter: (params: unknown) => {
                                if (labelFormatterAction) {
                                    return labelFormatterAction(params, totalValue);
                                }
                                const p = params as { name?: string; value?: number };
                                const name = p.name ?? "";
                                const value = typeof p.value === "number" ? p.value : 0;
                                const pct = calcPercent(value, totalValue);
                                if (pct < 3) return ""; // Hide tiny labels
                                return `${name}\n${formatPercent(pct)}`;
                            },
                            color: chartTheme.text,
                            textBorderWidth: 0,
                            fontSize: 11,
                            fontWeight: 500,
                        },
                        upperLabel: {
                            show: true,
                            height: 24,
                            color: chartTheme.text,
                            textBorderWidth: 0,
                            fontSize: 12,
                            fontWeight: 600,
                        },
                        // Tiles are separated by a 2px surface gap, not by borders.
                        itemStyle: {
                            borderColor: chartTheme.background,
                            borderWidth: 0,
                            gapWidth: 2,
                            borderRadius: 3,
                        },
                        levels: [
                            {
                                itemStyle: { borderWidth: 0, gapWidth: 2 },
                                upperLabel: { show: false },
                            },
                            {
                                itemStyle: { borderWidth: 0, gapWidth: 2 },
                                emphasis: {
                                    itemStyle: { borderWidth: 2, borderColor: chartTheme.text },
                                },
                            },
                            {
                                itemStyle: { borderWidth: 0, gapWidth: 2 },
                                label: { fontSize: 10, textBorderWidth: 0 },
                            },
                        ],
                    },
                ],
            }) as EChartsOption,
        [
            labelledData,
            totalValue,
            unit,
            chartTheme,
            tooltipFormatterAction,
            labelFormatterAction,
            showBreadcrumb,
        ],
    );

    return (
        <Chart
            option={option}
            className={className}
            style={mergedStyle}
            onEvents={{ click: handleClick }}
            chartTheme={chartTheme}
            chartColors={chartColors}
        />
    );
}
