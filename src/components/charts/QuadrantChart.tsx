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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const parseDateValue = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
};

const windowDays = (start: string, end: string) => {
  const startDate = parseDateValue(start);
  const endDate = parseDateValue(end);
  if (!startDate || !endDate) {
    return null;
  }
  const diffMs = Math.abs(endDate.getTime() - startDate.getTime());
  const diffDays = Math.floor(diffMs / MS_PER_DAY) + 1;
  return Math.max(1, diffDays);
};

const windowLabel = (start: string, end: string) => {
  if (start && end) {
    return start === end ? start : `${start} – ${end}`;
  }
  return start || end || "Selected window";
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
  const isPersonScope = normalizedScopeType === "person";
  const showTeamLabels = normalizedScopeType === "team";
  const focusIds = (focusEntityIds ?? []).filter(Boolean);
  const focusSet = new Set(focusIds);
  const directFocusPoints = focusIds.length
    ? data.points.filter((point) => focusSet.has(point.entity_id))
    : [];
  const focusPoints =
    isPersonScope && directFocusPoints.length === 0
      ? data.points.slice(0, 1)
      : directFocusPoints;
  const focusPointIds = new Set(focusPoints.map((point) => point.entity_id));
  const hasFocus = focusPoints.length > 0;
  const backgroundPoints = isPersonScope
    ? []
    : hasFocus
      ? data.points.filter((point) => !focusPointIds.has(point.entity_id))
      : data.points;
  const backgroundOpacity = 1;

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
      data: (point.trajectory ?? []).map((step) => ({
        value: [step.x, step.y],
        point: {
          entity_id: point.entity_id,
          entity_label: point.entity_label,
          x: step.x,
          y: step.y,
          window_start: step.window,
          window_end: step.window,
          evidence_link: point.evidence_link,
        },
      })),
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
        name: `Condition: ${annotation.description}`,
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
            const xValue = formatValue(point.x, data.axes.x.unit);
            const yValue = formatValue(point.y, data.axes.y.unit);
            const days = windowDays(point.window_start, point.window_end);
            const dayLabel = days
              ? `${days} day${days === 1 ? "" : "s"}`
              : "the selected window";
            const subject = isPersonScope ? "Your position" : "This position";
            const entityLabel = isPersonScope ? "You" : point.entity_label;
            return [
              `<strong>${entityLabel}</strong>`,
              `${xLabel}: ${xValue}`,
              `${yLabel}: ${yValue}`,
              `Window: ${windowLabel(point.window_start, point.window_end)}`,
              `${subject} reflects ${xLabel} at ${xValue} and ${yLabel} at ${yValue} over ${dayLabel}.`,
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
            label: showTeamLabels
              ? {
                  show: true,
                  formatter: (params: DefaultLabelFormatterCallbackParams) => {
                    const point = toPoint(params.data);
                    return point?.entity_label ?? "";
                  },
                  color: chartTheme.muted,
                  fontSize: 10,
                  position: "top",
                }
              : undefined,
            labelLayout: showTeamLabels ? { hideOverlap: true } : undefined,
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
