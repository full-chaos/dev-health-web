"use client";

import type { CSSProperties } from "react";
// Type-only import from full echarts package (erased at runtime — no bundle impact).
import type { BarSeriesOption } from "echarts";
import { BarChart } from "echarts/charts";

import { Chart } from "./Chart";
import { formatChartValue, type ChartValueFormat } from "./chartValueFormat";
import { useChartTheme } from "./chartTheme";
import { echarts } from "@/lib/echartsInit";

echarts.use([BarChart]);

type VerticalBarChartProps = {
  categories: string[];
  series: Array<{ name: string; data: number[] }>;
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
  valueFormat?: ChartValueFormat;
};

type NumericChartParam = {
  name?: string;
  seriesName?: string;
  value?: number | string;
  marker?: string;
};

export function VerticalBarChart({
  categories,
  series,
  height = 260,
  width = "100%",
  className,
  style,
  valueFormat = "number",
}: VerticalBarChartProps) {
  const chartTheme = useChartTheme();

  const formatValue = (value: number | string | undefined): string => {
    const numeric = typeof value === "number" ? value : Number(value);
    return Number.isFinite(numeric) ? formatChartValue(numeric, valueFormat) : `${value ?? ""}`;
  };

  const barSeries: BarSeriesOption[] = series.map((item) => ({
    name: item.name,
    type: "bar",
    data: item.data,
    barMaxWidth: 24,
    label: {
      show: true,
      position: "top",
      color: chartTheme.muted,
      formatter: (params: unknown) => {
        const value = (params as NumericChartParam | undefined)?.value;
        return formatValue(value);
      },
    },
  }));

  const mergedStyle: CSSProperties = {
    height,
    width,
    ...style,
  };

  return (
    <Chart
      option={{
        tooltip: {
          trigger: "axis",
          confine: true,
          backgroundColor: chartTheme.background,
          borderColor: chartTheme.stroke,
          textStyle: {
            color: chartTheme.text,
          },
          formatter: (params: unknown): string => {
            const list = Array.isArray(params) ? params : [params];
            return list
              .map((entry) => {
                const item = entry as NumericChartParam;
                const label = item.seriesName ?? item.name ?? "Value";
                return `${item.marker ?? ""}${label}: ${formatValue(item.value)}`;
              })
              .join("<br/>");
          },
        },
        legend: {
          data: series.map((item) => item.name),
          bottom: 0,
          left: "center",
          textStyle: { color: chartTheme.muted },
        },
        grid: { left: 24, right: 16, top: 32, bottom: 52, containLabel: true },
        xAxis: {
          type: "category",
          data: categories,
          axisTick: { show: false },
          axisLine: { lineStyle: { color: chartTheme.grid } },
          axisLabel: { color: chartTheme.muted },
        },
        yAxis: {
          type: "value",
          splitLine: { lineStyle: { color: chartTheme.grid } },
          axisLabel: { color: chartTheme.muted, formatter: formatValue },
        },
        series: barSeries,
      }}
      className={className}
      style={mergedStyle}
      chartTheme={chartTheme}
    />
  );
}
