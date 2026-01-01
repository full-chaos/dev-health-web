"use client";

import type { CSSProperties } from "react";

import type { TooltipComponentFormatterCallbackParams } from "echarts";

import type { HeatmapResponse } from "@/lib/types";

import { Chart } from "./Chart";
import { useChartColors, useChartTheme } from "./chartTheme";

type HeatmapChartProps = {
  data: HeatmapResponse;
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
  onCellSelect?: (cell: { x: string; y: string; value: number }) => void;
};

export function HeatmapChart({
  data,
  height = 320,
  width = "100%",
  className,
  style,
  onCellSelect,
}: HeatmapChartProps) {
  const chartTheme = useChartTheme();
  const chartColors = useChartColors();
  const mergedStyle: CSSProperties = { height, width, ...style };

  const rawValues = data.cells.map((cell) => cell.value);
  const valueForColor = (value: number) =>
    data.legend.scale === "log" ? Math.log10(value + 1) : value;

  const colorValues = rawValues.map(valueForColor);
  const minValue = colorValues.length ? Math.min(...colorValues) : 0;
  const maxValue = colorValues.length ? Math.max(...colorValues) : 1;

  const colorRamp = [
    chartColors[5] ?? "#e2e8f0",
    chartColors[0] ?? "#60a5fa",
    chartColors[8] ?? "#f97316",
  ];

  const seriesData = data.cells.map((cell) => [
    cell.x,
    cell.y,
    valueForColor(cell.value),
    cell.value,
  ]);

  const getValueArray = (params: unknown) => {
    const entry = Array.isArray(params) ? params[0] : params;
    if (!entry || typeof entry !== "object") {
      return null;
    }
    const candidate = entry as { value?: unknown };
    return Array.isArray(candidate.value) ? candidate.value : null;
  };

  const handleClick = (params: unknown) => {
    if (!onCellSelect) {
      return;
    }
    const values = getValueArray(params);
    if (!values) {
      return;
    }
    const rawValue = typeof values[3] === "number" ? values[3] : values[2];
    const xLabel = String(values[0]);
    const yLabel = String(values[1]);
    if (typeof rawValue === "number") {
      onCellSelect({ x: xLabel, y: yLabel, value: rawValue });
    }
  };

  return (
    <Chart
      option={{
        tooltip: {
          confine: true,
          formatter: (params: TooltipComponentFormatterCallbackParams) => {
            const values = getValueArray(params);
            if (!values) {
              return "";
            }
            const raw = values[3] ?? values[2];
            const xLabel = values[0];
            const yLabel = values[1];
            const formatted = typeof raw === "number" ? raw.toFixed(2) : raw;
            return [
              `<strong>${yLabel}</strong> · ${xLabel}`,
              `${formatted} ${data.legend.unit}`,
            ].join("<br/>");
          },
        },
        grid: { left: 32, right: 32, top: 24, bottom: 48, containLabel: true },
        xAxis: {
          type: "category",
          data: data.axes.x,
          axisTick: { show: false },
          axisLine: { lineStyle: { color: chartTheme.grid } },
          axisLabel: { color: chartTheme.muted, interval: 0 },
        },
        yAxis: {
          type: "category",
          data: data.axes.y,
          axisTick: { show: false },
          axisLine: { lineStyle: { color: chartTheme.grid } },
          axisLabel: { color: chartTheme.muted },
        },
        visualMap: {
          min: minValue,
          max: maxValue,
          calculable: false,
          orient: "horizontal",
          left: "center",
          bottom: 0,
          textStyle: { color: chartTheme.muted },
          inRange: { color: colorRamp },
        },
        series: [
          {
            type: "heatmap",
            data: seriesData,
            encode: { value: 2 },
            emphasis: {
              itemStyle: { shadowBlur: 8, shadowColor: "rgba(0,0,0,0.2)" },
            },
            itemStyle: { borderColor: chartTheme.grid, borderWidth: 1 },
          },
        ],
      }}
      className={className}
      style={mergedStyle}
      onEvents={{ click: handleClick }}
      chartTheme={chartTheme}
      chartColors={chartColors}
    />
  );
}
