"use client";

import type { CSSProperties } from "react";
// Type-only import from full echarts package (erased at runtime — no bundle impact).
import type { BarSeriesOption } from "echarts";
import { BarChart } from "echarts/charts";

import { Chart } from "./Chart";
import { useChartTheme } from "./chartTheme";
import { echarts } from "@/lib/echartsInit";

echarts.use([BarChart]);

type HorizontalBarChartProps = {
  categories: string[];
  values: number[];
  /**
   * Optional full identifiers (e.g. raw repo ids) aligned with
   * `categories`. When provided, the axis tooltip surfaces the full id
   * even when the rendered category label is a degraded short form.
   * Pair with `resolveEntityLabels` from `@/lib/labels/entityLabel`.
   */
  categoryTitles?: string[];
  height?: number | string;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
};

export function HorizontalBarChart({
  categories,
  values,
  categoryTitles,
  height = 240,
  width = "100%",
  className,
  style,
}: HorizontalBarChartProps) {
  const chartTheme = useChartTheme();
  const barSeries: BarSeriesOption = {
    type: "bar",
    data: values,
    barMaxWidth: 18,
    label: {
      show: true,
      position: "right",
      color: chartTheme.muted,
    },
  };

  const mergedStyle: CSSProperties = {
    height,
    width,
    ...style,
  };

  // When full identifiers are supplied, show them in the axis tooltip so a
  // degraded short label (e.g. `#550e8400`) still traces to its real id.
  const tooltipFormatter = categoryTitles
    ? (params: unknown): string => {
        const list = Array.isArray(params) ? params : [params];
        const first = list[0] as
          | {
              name?: string;
              value?: number | string;
              dataIndex?: number;
              marker?: string;
            }
          | undefined;
        if (!first) return "";
        const idx = typeof first.dataIndex === "number" ? first.dataIndex : -1;
        const heading = (idx >= 0 ? categoryTitles[idx] : undefined) ?? first.name ?? "";
        return `${heading}<br/>${first.marker ?? ""}${first.value ?? ""}`;
      }
    : undefined;

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
          formatter: tooltipFormatter,
        },
        grid: { left: 80, right: 24, top: 20, bottom: 20 },
        xAxis: {
          type: "value",
          splitLine: { lineStyle: { color: chartTheme.grid } },
          axisLabel: { color: chartTheme.muted },
        },
        yAxis: {
          type: "category",
          data: categories,
          axisTick: { show: false },
          axisLine: { lineStyle: { color: chartTheme.grid } },
          axisLabel: { color: chartTheme.muted },
        },
        series: [barSeries],
      }}
      className={className}
      style={mergedStyle}
      chartTheme={chartTheme}
    />
  );
}
