"use client";

import type { CSSProperties } from "react";

import type { QuadrantPoint, QuadrantResponse } from "@/lib/types";

import { Chart } from "./Chart";
import { useChartColors, useChartTheme } from "./chartTheme";

const formatValue = (value: number, unit: string) => {
  if (!Number.isFinite(value)) {
    return "--";
  }
  if (unit === "%") {
    return `${value.toFixed(1)}%`;
  }
  if (unit === "days") {
    return `${value.toFixed(1)}d`;
  }
  if (unit === "hours") {
    return `${value.toFixed(1)}h`;
  }
  return `${value.toFixed(1)} ${unit}`.trim();
};

type QuadrantChartProps = {
  data: QuadrantResponse;
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
  onPointSelect?: (point: QuadrantPoint) => void;
};

export function QuadrantChart({
  data,
  height = 360,
  width = "100%",
  className,
  style,
  onPointSelect,
}: QuadrantChartProps) {
  const chartTheme = useChartTheme();
  const colors = useChartColors();
  const mergedStyle: CSSProperties = { height, width, ...style };
  const xAxisLabel = data.axes.x.unit
    ? `${data.axes.x.label} (${data.axes.x.unit})`
    : data.axes.x.label;
  const yAxisLabel = data.axes.y.unit
    ? `${data.axes.y.label} (${data.axes.y.unit})`
    : data.axes.y.label;

  const scatterData = data.points.map((point) => ({
    value: [point.x, point.y],
    point,
  }));

  const trajectorySeries = data.points
    .filter((point) => (point.trajectory?.length ?? 0) > 1)
    .map((point, index) => ({
      type: "line" as const,
      name: point.entity_label,
      data: (point.trajectory ?? []).map((step) => [step.x, step.y, step.window]),
      lineStyle: {
        color: colors[(index + 2) % colors.length] ?? colors[2],
        width: 2,
        type: "solid",
      },
      symbol: "circle",
      symbolSize: 6,
      itemStyle: {
        color: colors[(index + 2) % colors.length] ?? colors[2],
      },
      emphasis: { focus: "series" },
      z: 2,
    }));

  const annotations = (data.annotations ?? []).map((annotation) => [
    {
      name: annotation.description,
      xAxis: annotation.x_range[0],
      yAxis: annotation.y_range[0],
    },
    {
      xAxis: annotation.x_range[1],
      yAxis: annotation.y_range[1],
    },
  ]);

  const handleClick = (params: { data?: { point?: QuadrantPoint } }) => {
    const point = params?.data?.point;
    if (point && onPointSelect) {
      onPointSelect(point);
    }
  };

  return (
    <Chart
      option={{
        tooltip: {
          confine: true,
          formatter: (params: { data?: { point?: QuadrantPoint } }) => {
            const point = params?.data?.point;
            if (!point) {
              return "";
            }
            const xLabel = data.axes.x.label;
            const yLabel = data.axes.y.label;
            return [
              `<strong>${point.entity_label}</strong>`,
              `${xLabel}: ${formatValue(point.x, data.axes.x.unit)}`,
              `${yLabel}: ${formatValue(point.y, data.axes.y.unit)}`,
              `Window: ${point.window_start} – ${point.window_end}`,
            ].join("<br/>");
          },
        },
        grid: { left: 48, right: 24, top: 24, bottom: 48, containLabel: true },
        xAxis: {
          name: xAxisLabel,
          nameLocation: "middle",
          nameGap: 30,
          type: "value",
          axisLine: { lineStyle: { color: chartTheme.grid } },
          axisLabel: { color: chartTheme.muted },
          splitLine: { lineStyle: { color: chartTheme.grid } },
        },
        yAxis: {
          name: yAxisLabel,
          nameLocation: "middle",
          nameGap: 40,
          type: "value",
          axisLine: { lineStyle: { color: chartTheme.grid } },
          axisLabel: { color: chartTheme.muted },
          splitLine: { lineStyle: { color: chartTheme.grid } },
        },
        series: [
          {
            type: "scatter",
            data: scatterData,
            symbolSize: 12,
            itemStyle: {
              color: colors[0] ?? "#2563eb",
            },
            markArea: annotations.length
              ? {
                  itemStyle: {
                    color: "rgba(148, 163, 184, 0.08)",
                  },
                  label: {
                    show: true,
                    color: chartTheme.muted,
                    fontSize: 10,
                    formatter: "{b}",
                  },
                  data: annotations,
                }
              : undefined,
          },
          ...trajectorySeries,
        ],
      }}
      className={className}
      style={mergedStyle}
      onEvents={{ click: handleClick }}
    />
  );
}
