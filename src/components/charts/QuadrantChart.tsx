"use client";

import type { CSSProperties } from "react";
import type {
  DefaultLabelFormatterCallbackParams,
  MarkAreaComponentOption,
  TooltipComponentFormatterCallbackParams,
} from "echarts";

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
  focusEntityIds?: string[];
  scopeType?: "org" | "team" | "repo" | "person" | "developer" | "service" | string;
};

export function QuadrantChart({
  data,
  height = 360,
  width = "100%",
  className,
  style,
  onPointSelect,
  focusEntityIds,
  scopeType,
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

  const normalizedScopeType =
    scopeType === "developer" ? "person" : scopeType ?? "org";
  const focusIds = (focusEntityIds ?? []).filter(Boolean);
  const focusSet = new Set(focusIds);
  const focusPoints = focusIds.length
    ? data.points.filter((point) => focusSet.has(point.entity_id))
    : [];
  const hasFocus = focusPoints.length > 0;
  const backgroundPoints = hasFocus
    ? data.points.filter((point) => !focusSet.has(point.entity_id))
    : data.points;
  const backgroundOpacity = normalizedScopeType === "person" ? 0.2 : 1;

  const focusData = focusPoints.map((point) => ({
    value: [point.x, point.y],
    point,
  }));
  const backgroundData = backgroundPoints.map((point) => ({
    value: [point.x, point.y],
    point,
  }));

  const trajectorySource = hasFocus ? focusPoints : data.points;
  const trajectorySeries = trajectorySource
    .filter((point) => (point.trajectory?.length ?? 0) > 1)
    .map((point, index) => ({
      type: "line" as const,
      name: point.entity_label,
      data: (point.trajectory ?? []).map((step) => [step.x, step.y, step.window]),
      lineStyle: {
        color: colors[(index + 2) % colors.length] ?? colors[2],
        width: 2,
        type: "solid" as const,
      },
      symbol: "circle",
      symbolSize: 6,
      itemStyle: {
        color: colors[(index + 2) % colors.length] ?? colors[2],
      },
      emphasis: { focus: "series" as const },
      z: 2,
    }));

  const annotations: MarkAreaComponentOption["data"] = (data.annotations ?? []).map(
    (annotation) => [
      {
        name: annotation.description,
        xAxis: annotation.x_range[0],
        yAxis: annotation.y_range[0],
      },
      {
        xAxis: annotation.x_range[1],
        yAxis: annotation.y_range[1],
      },
    ]
  );
  const markArea: MarkAreaComponentOption | undefined = annotations?.length
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
    : undefined;

  const toPoint = (data: unknown) => {
    if (!data || typeof data !== "object") {
      return null;
    }
    const candidate = data as { point?: QuadrantPoint };
    return candidate.point ?? null;
  };

  const getParamsEntry = (
    params: unknown
  ): DefaultLabelFormatterCallbackParams | null => {
    const entry = Array.isArray(params) ? params[0] : params;
    if (!entry || typeof entry !== "object") {
      return null;
    }
    return entry as DefaultLabelFormatterCallbackParams;
  };

  const handleClick = (params: unknown) => {
    const entry = getParamsEntry(params);
    const point = entry ? toPoint(entry.data) : null;
    if (point && onPointSelect) {
      onPointSelect(point);
    }
  };

  return (
    <Chart
      option={{
        tooltip: {
          confine: true,
          formatter: (params: TooltipComponentFormatterCallbackParams) => {
            const entry = getParamsEntry(params);
            const point = entry ? toPoint(entry.data) : null;
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
            data: backgroundData,
            symbolSize: normalizedScopeType === "person" ? 8 : 10,
            itemStyle: {
              color: chartTheme.muted,
              opacity: backgroundOpacity,
            },
            markArea: backgroundData.length ? markArea : undefined,
            emphasis: { scale: true },
            z: 1,
          },
          ...(hasFocus
            ? [
                {
                  type: "scatter" as const,
                  data: focusData,
                  symbolSize: 14,
                  itemStyle: {
                    color: colors[0] ?? "#2563eb",
                  },
                  label: {
                    show: true,
                    formatter: (params: DefaultLabelFormatterCallbackParams) => {
                      const point = toPoint(params.data);
                      return point?.entity_label ?? "";
                    },
                    color: chartTheme.text,
                    fontSize: 11,
                    fontWeight: 600,
                    position: "top" as const,
                  },
                  labelLayout: { hideOverlap: true },
                  markArea: !backgroundData.length ? markArea : undefined,
                  z: 3,
                },
              ]
            : []),
          ...trajectorySeries,
        ],
      }}
      className={className}
      style={mergedStyle}
      onEvents={{ click: handleClick }}
    />
  );
}
