"use client";

import type { CSSProperties } from "react";
import { useCallback, useMemo } from "react";

import { Chart } from "./Chart";
import { useChartColors, useChartTheme } from "./chartTheme";
import { calcPercent } from "@/lib/chartUtils";

export type TransitionData = {
    fromStatus: string;
    toStatus: string;
    count: number;
};

type TransitionHeatmapChartProps = {
    data: TransitionData[];
    unit?: string;
    height?: number | string;
    width?: number | string;
    className?: string;
    style?: CSSProperties;
    showSmallTransitions?: boolean;
    minTransitionThreshold?: number;
    onCellClick?: (cell: {
        from: string;
        to: string;
        count: number;
        percentOfOutgoing: number;
    }) => void;
};

// Sensible state ordering for workflow
const STATE_ORDER = [
    "backlog",
    "todo",
    "in_progress",
    "in_review",
    "blocked",
    "done",
    "canceled",
];

const sortStates = (states: string[]): string[] => {
    return [...states].sort((a, b) => {
        const aLower = a.toLowerCase();
        const bLower = b.toLowerCase();
        const aIndex = STATE_ORDER.findIndex((s) => aLower.includes(s));
        const bIndex = STATE_ORDER.findIndex((s) => bLower.includes(s));
        if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
    });
};

/**
 * ECharts Heatmap showing state transitions as a matrix.
 * Y-axis: from-state, X-axis: to-state, Value: transition count.
 */
export function TransitionHeatmapChart({
    data,
    unit = "transitions",
    height = 400,
    width = "100%",
    className,
    style,
    showSmallTransitions = true,
    minTransitionThreshold = 1,
    onCellClick,
}: TransitionHeatmapChartProps) {
    const chartTheme = useChartTheme();
    const chartColors = useChartColors();
    const mergedStyle: CSSProperties = { height, width, ...style };

    // Filter data based on threshold
    const filteredData = useMemo(() => {
        if (showSmallTransitions) return data;
        return data.filter((d) => d.count >= minTransitionThreshold);
    }, [data, showSmallTransitions, minTransitionThreshold]);

    // Extract unique states and sort them
    const { fromStates, toStates } = useMemo(() => {
        const fromSet = new Set<string>();
        const toSet = new Set<string>();
        filteredData.forEach((d) => {
            fromSet.add(d.fromStatus);
            toSet.add(d.toStatus);
        });
        return {
            fromStates: sortStates(Array.from(fromSet)),
            toStates: sortStates(Array.from(toSet)),
        };
    }, [filteredData]);

    // Calculate outgoing totals for percentage calculation
    const outgoingTotals = useMemo(() => {
        const totals = new Map<string, number>();
        filteredData.forEach((d) => {
            totals.set(d.fromStatus, (totals.get(d.fromStatus) ?? 0) + d.count);
        });
        return totals;
    }, [filteredData]);

    // Build heatmap data: [xIndex, yIndex, value, rawValue, fromState, toState]
    const heatmapData = useMemo(() => {
        return filteredData.map((d) => {
            const xIndex = toStates.indexOf(d.toStatus);
            const yIndex = fromStates.indexOf(d.fromStatus);
            return [xIndex, yIndex, d.count, d.count, d.fromStatus, d.toStatus];
        });
    }, [filteredData, fromStates, toStates]);

    const maxValue = useMemo(() => {
        return Math.max(...filteredData.map((d) => d.count), 1);
    }, [filteredData]);

    // Color ramp for heatmap
    const colorRamp = useMemo(() => [
        chartColors[5] ?? "#e2e8f0",
        chartColors[0] ?? "#60a5fa",
        chartColors[8] ?? "#f97316",
    ], [chartColors]);

    const handleClick = useCallback(
        (params: unknown) => {
            if (!onCellClick || !params || typeof params !== "object") return;
            const entry = params as { value?: unknown[] };
            const values = entry.value;
            if (!Array.isArray(values) || values.length < 6) return;

            const count = typeof values[2] === "number" ? values[2] : 0;
            const fromState = String(values[4]);
            const toState = String(values[5]);
            const outgoingTotal = outgoingTotals.get(fromState) ?? 0;
            const percentOfOutgoing = calcPercent(count, outgoingTotal);

            onCellClick({
                from: fromState,
                to: toState,
                count,
                percentOfOutgoing,
            });
        },
        [onCellClick, outgoingTotals]
    );

    const option = useMemo(
        () => ({
            tooltip: {
                confine: true,
                formatter: (params: unknown) => {
                    if (!params || typeof params !== "object") return "";
                    const entry = params as { value?: unknown[] };
                    const values = entry.value;
                    if (!Array.isArray(values) || values.length < 6) return "";

                    const count = typeof values[2] === "number" ? values[2] : 0;
                    const fromState = String(values[4]);
                    const toState = String(values[5]);
                    const outgoingTotal = outgoingTotals.get(fromState) ?? 0;
                    const percentOfOutgoing = calcPercent(count, outgoingTotal);

                    return `
            <div style="font-weight: 600; margin-bottom: 4px;">${fromState} → ${toState}</div>
            <div style="font-family: var(--font-mono, monospace);">
              <strong>${count.toLocaleString()}</strong> ${unit}
            </div>
            <div style="margin-top: 4px; color: ${chartTheme.accent2};">
              ${percentOfOutgoing.toFixed(1)}% of outgoing from "${fromState}"
            </div>
          `;
                },
            },
            grid: {
                left: 100,
                right: 48,
                top: 24,
                bottom: 80,
                containLabel: false,
            },
            xAxis: {
                type: "category" as const,
                data: toStates,
                name: "To State",
                nameLocation: "middle" as const,
                nameGap: 40,
                nameTextStyle: {
                    color: chartTheme.muted,
                    fontSize: 11,
                    fontWeight: 500,
                },
                axisTick: { show: false },
                axisLine: { lineStyle: { color: chartTheme.grid } },
                axisLabel: {
                    color: chartTheme.muted,
                    fontSize: 10,
                    rotate: 45,
                    interval: 0,
                },
            },
            yAxis: {
                type: "category" as const,
                data: fromStates,
                name: "From State",
                nameLocation: "middle" as const,
                nameGap: 70,
                nameTextStyle: {
                    color: chartTheme.muted,
                    fontSize: 11,
                    fontWeight: 500,
                },
                axisTick: { show: false },
                axisLine: { lineStyle: { color: chartTheme.grid } },
                axisLabel: { color: chartTheme.muted, fontSize: 10 },
            },
            visualMap: {
                min: 0,
                max: maxValue,
                calculable: false,
                orient: "horizontal" as const,
                left: "center",
                bottom: 0,
                textStyle: { color: chartTheme.muted },
                inRange: { color: colorRamp },
            },
            series: [
                {
                    type: "heatmap" as const,
                    data: heatmapData,
                    label: {
                        show: true,
                        formatter: (params: unknown) => {
                            const entry = params as { value?: unknown[] };
                            const values = entry.value;
                            if (!Array.isArray(values)) return "";
                            const count = typeof values[2] === "number" ? values[2] : 0;
                            return count > 0 ? count.toString() : "";
                        },
                        color: chartTheme.text,
                        fontSize: 10,
                    },
                    emphasis: {
                        itemStyle: {
                            shadowBlur: 10,
                            shadowColor: "rgba(0, 0, 0, 0.3)",
                        },
                    },
                    itemStyle: {
                        borderColor: chartTheme.background,
                        borderWidth: 2,
                    },
                },
            ],
        }),
        [fromStates, toStates, heatmapData, maxValue, colorRamp, unit, chartTheme, outgoingTotals]
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
