"use client";

import type { CSSProperties } from "react";

import { PieChart } from "echarts/charts";

import { Chart } from "./Chart";
import { useChartColors, useChartTheme } from "./chartTheme";
import { buildTooltip } from "./chartConventions";
import { echarts } from "@/lib/echartsInit";

echarts.use([PieChart]);

export type DonutSegment = {
    name: string;
    value: number;
    /** 1-based position in the theme's chart colors; keeps a category on one color. */
    colorIndex?: number;
    /** Use the muted ink color (for a "none of the above" slice such as Human or Unknown). */
    muted?: boolean;
};

type DonutChartProps = {
    data: DonutSegment[];
    /** Write each legend entry's share after its name ("Human 50%"). Off by default. */
    legendPercent?: boolean;
    selectedIndex?: number;
    height?: number | string;
    width?: number | string;
    className?: string;
    style?: CSSProperties;
};

export function DonutChart({
    data,
    legendPercent = false,
    selectedIndex = 0,
    height = 280,
    width = "100%",
    className,
    style,
}: DonutChartProps) {
    const chartTheme = useChartTheme();
    const colors = useChartColors();
    const total = data.reduce((sum, segment) => sum + segment.value, 0);
    const segments = data.map(({ colorIndex, muted, ...segment }, index) => ({
        ...segment,
        selected: index === selectedIndex,
        ...(muted
            ? { itemStyle: { color: chartTheme.muted } }
            : colorIndex
              ? { itemStyle: { color: colors[colorIndex - 1] } }
              : {}),
    }));

    const mergedStyle: CSSProperties = {
        height,
        width,
        ...style,
    };

    return (
        <Chart
            option={{
                tooltip: buildTooltip(chartTheme, { trigger: "item" }),
                legend: {
                    bottom: 0,
                    textStyle: { color: chartTheme.muted },
                    ...(legendPercent
                        ? {
                              formatter: (name: string) => {
                                  const value = data.find((d) => d.name === name)?.value ?? 0;
                                  return `${name} ${total > 0 ? Math.round((value / total) * 100) : 0}%`;
                              },
                          }
                        : {}),
                },
                series: [
                    {
                        type: "pie",
                        radius: ["52%", "72%"],
                        center: ["50%", "45%"],
                        selectedMode: "single",
                        selectedOffset: 10,
                        padAngle: 2,
                        itemStyle: {
                            borderRadius: 6,
                            shadowBlur: 12,
                            shadowOffsetY: 6,
                            shadowColor: "rgba(0,0,0,0.15)",
                        },
                        label: {
                            color: chartTheme.muted,
                            formatter: "{b}: {d}%",
                        },
                        data: segments,
                    },
                ],
            }}
            className={className}
            style={mergedStyle}
            chartTheme={chartTheme}
        />
    );
}
