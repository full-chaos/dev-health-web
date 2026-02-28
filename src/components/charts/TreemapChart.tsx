"use client";

import type { CSSProperties } from "react";
import { useCallback, useMemo } from "react";
import type { EChartsOption } from "echarts/core";

import { Chart } from "./Chart";
import { useChartColors, useChartTheme } from "./chartTheme";
import { buildTooltipHtml, calcPercent } from "@/lib/chartUtils";

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
    labelFormatter?: (params: unknown, totalValue: number) => string;
    tooltipFormatter?: (params: unknown, totalValue: number, unit: string) => string;
    onNodeClick?: (node: {
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
    labelFormatter,
    tooltipFormatter,
    onNodeClick,
}: TreemapChartProps) {
    const chartTheme = useChartTheme();
    const chartColors = useChartColors();
    const mergedStyle: CSSProperties = { height, width, ...style };

    const totalValue = data.value || 0;

    // Assign colors to top-level children
    const coloredData = useMemo(() => {
        if (useInputColors || !data.children?.length) return data;

        const assignColors = (node: TreemapNode, depth: number, colorIndex: number): TreemapNode => {
            const baseColor = chartColors[colorIndex % chartColors.length];
            return {
                ...node,
                itemStyle: depth === 0 ? { color: baseColor } : node.itemStyle,
                children: node.children?.map((child, idx) =>
                    assignColors(child, depth + 1, depth === 0 ? idx : colorIndex)
                ),
            };
        };

        return {
            ...data,
            children: data.children.map((child, idx) => assignColors(child, 0, idx)),
        };
    }, [data, chartColors, useInputColors]);

    const handleClick = useCallback(
        (params: unknown) => {
            if (!onNodeClick || !params || typeof params !== "object") return;
            const entry = params as {
                data?: { name?: string; value?: number };
                treePathInfo?: Array<{ name: string; value: number }>;
            };
            const nodeData = entry.data as TreemapNode | undefined;
            if (!nodeData?.name) return;

            const path = entry.treePathInfo?.map((p) => p.name) ?? [nodeData.name];
            const value = nodeData.value ?? 0;
            const percent = calcPercent(value, totalValue);

            onNodeClick({ name: nodeData.name, value, path, percent, data: nodeData });
        },
        [onNodeClick, totalValue]
    );

    const option = useMemo(
        () => ({
            tooltip: {
                confine: true,
                backgroundColor: chartTheme.background,
                borderColor: chartTheme.stroke,
                textStyle: {
                    color: chartTheme.text,
                },
                formatter: (params: unknown) => {
                    if (tooltipFormatter) {
                        return tooltipFormatter(params, totalValue, unit);
                    }
                    if (!params || typeof params !== "object") return "";
                    const entry = params as {
                        data?: { name?: string; value?: number };
                        treePathInfo?: Array<{ name: string }>;
                    };
                    const nodeData = entry.data;
                    if (!nodeData?.name) return "";

                    const path = entry.treePathInfo?.slice(1).map((p) => p.name).join(" → ") ?? nodeData.name;
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
                    data: coloredData.children ?? [],
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
                            if (labelFormatter) {
                                return labelFormatter(params, totalValue);
                            }
                            const p = params as { name?: string; value?: number };
                            const name = p.name ?? "";
                            const value = typeof p.value === "number" ? p.value : 0;
                            const pct = calcPercent(value, totalValue);
                            if (pct < 3) return ""; // Hide tiny labels
                            return `${name}\n${pct.toFixed(0)}%`;
                        },
                        color: chartTheme.text,
                        fontSize: 11,
                        fontWeight: 500,
                    },
                    upperLabel: {
                        show: true,
                        height: 24,
                        color: chartTheme.text,
                        fontSize: 12,
                        fontWeight: 600,
                    },
                    itemStyle: {
                        borderColor: chartTheme.background,
                        borderWidth: 2,
                        gapWidth: 2,
                    },
                    levels: [
                        {
                            itemStyle: {
                                borderColor: chartTheme.stroke,
                                borderWidth: 3,
                                gapWidth: 3,
                            },
                            upperLabel: { show: false },
                        },
                        {
                            itemStyle: {
                                borderColor: chartTheme.stroke,
                                borderWidth: 2,
                                gapWidth: 2,
                            },
                            emphasis: {
                                itemStyle: { borderColor: chartTheme.accent2 },
                            },
                        },
                        {
                            itemStyle: {
                                borderColor: chartTheme.grid,
                                borderWidth: 1,
                                gapWidth: 1,
                            },
                            label: { fontSize: 10 },
                        },
                    ],
                },
            ],
        }) as EChartsOption,
        [coloredData, totalValue, unit, chartTheme, tooltipFormatter, labelFormatter, showBreadcrumb]
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
