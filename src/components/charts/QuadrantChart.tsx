"use client";

import type { CSSProperties } from "react";
import type {
  DefaultLabelFormatterCallbackParams,
  EChartsOption,
  MarkAreaComponentOption,
  TooltipComponentFormatterCallbackParams,
} from "echarts";

import type { ZoneOverlay } from "@/lib/quadrantZones";
import type { QuadrantPoint, QuadrantResponse } from "@/lib/types";

import { Chart } from "./Chart";
import { type ChartTheme, useChartColors, useChartTheme } from "./chartTheme";

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




const normalizeScopeType = (
  scopeType?: "org" | "team" | "repo" | "person" | "developer" | "service" | string
) => (scopeType === "developer" ? "person" : scopeType ?? "org");

const rgbaPattern =
  /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i;
const hexPattern = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

const clampAlpha = (alpha: number) => Math.min(1, Math.max(0, alpha));

const withAlpha = (color: string, alpha: number) => {
  const nextAlpha = clampAlpha(alpha);
  const trimmed = color.trim();
  const match = trimmed.match(rgbaPattern);
  if (match) {
    const red = Number(match[1]);
    const green = Number(match[2]);
    const blue = Number(match[3]);
    if ([red, green, blue].some((value) => Number.isNaN(value))) {
      return color;
    }
    return `rgba(${red}, ${green}, ${blue}, ${nextAlpha})`;
  }
  const hexMatch = trimmed.match(hexPattern);
  if (!hexMatch) {
    return color;
  }
  const hex = hexMatch[1];
  const normalized =
    hex.length === 3 ? hex.split("").map((item) => item + item).join("") : hex;
  const value = Number.parseInt(normalized, 16);
  if (Number.isNaN(value)) {
    return color;
  }
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${nextAlpha})`;
};

const buildZoneGradient = (color: string) => ({
  type: "radial" as const,
  x: 0.45,
  y: 0.4,
  r: 0.95,
  colorStops: [
    { offset: 0, color: withAlpha(color, 0.2) },
    { offset: 0.6, color: withAlpha(color, 0.12) },
    { offset: 1, color: withAlpha(color, 0) },
  ],
});

const buildZoneSurfaceStyle = (
  color: string,
  options?: {
    outlineAlpha?: number;
    glowAlpha?: number;
    radius?: number;
    active?: boolean;
  }
) => {
  const outlineAlpha = options?.outlineAlpha ?? 0.32;
  const glowAlpha = options?.glowAlpha ?? 0.22;
  const radius = options?.radius ?? 32;
  const isActive = options?.active ?? false;
  return {
    color: buildZoneGradient(color),
    opacity: isActive ? 1 : 0.92,
    borderWidth: isActive ? 2 : 1,
    borderColor: withAlpha(color, isActive ? outlineAlpha + 0.14 : outlineAlpha),
    borderType: "dashed" as const,
    borderRadius: radius,
    shadowBlur: isActive ? 24 : 20,
    shadowColor: withAlpha(color, isActive ? glowAlpha + 0.12 : glowAlpha),
  };
};

const toPoint = (data: unknown) => {
  if (!data || typeof data !== "object") {
    return null;
  }
  const candidate = data as { point?: QuadrantPoint };
  return candidate.point ?? null;
};

type TooltipEntry = TooltipComponentFormatterCallbackParams & {
  componentType?: string;
  data?: unknown;
  name?: string;
};

const getParamsEntry = (params: unknown): TooltipEntry | null => {
  const entry = Array.isArray(params) ? params[0] : params;
  if (!entry || typeof entry !== "object") {
    return null;
  }
  return entry as TooltipEntry;
};

type QuadrantChartOptionParams = {
  data: QuadrantResponse;
  chartTheme: ChartTheme;
  colors: string[];
  focusEntityIds?: string[];
  scopeType?: "org" | "team" | "repo" | "person" | "developer" | "service" | string;
  zoneOverlay?: ZoneOverlay | null;
  showZoneOverlay?: boolean;
  highlightOverlayKey?: string | null;
};

export const buildQuadrantOption = ({
  data,
  chartTheme,
  colors,
  focusEntityIds,
  scopeType,
  zoneOverlay,
  showZoneOverlay = false,
  highlightOverlayKey,
}: QuadrantChartOptionParams): EChartsOption => {
  const xAxisLabel = data.axes.x.unit
    ? `${data.axes.x.label} (${data.axes.x.unit})`
    : data.axes.x.label;
  const yAxisLabel = data.axes.y.unit
    ? `${data.axes.y.label} (${data.axes.y.unit})`
    : data.axes.y.label;

  const normalizedScopeType = normalizeScopeType(scopeType);
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
    value: [point.x, point.y] as [number, number],
    point,
  }));
  const backgroundData = backgroundPoints.map((point) => ({
    value: [point.x, point.y] as [number, number],
    point,
  }));

  const showInterpretation = Boolean(showZoneOverlay);
  const activeZoneOverlay = showInterpretation ? zoneOverlay : null;
  const annotationColor = "rgba(148, 163, 184, 0.2)";
  const annotationAreas: MarkAreaComponentOption["data"] = showInterpretation
    ? (data.annotations ?? []).map((annotation, index) => {
      const isActive =
        highlightOverlayKey === `annotation:${index}`;
      return [
        {
          name: `Condition: ${annotation.description}`,
          xAxis: annotation.x_range[0],
          yAxis: annotation.y_range[0],
          itemStyle: buildZoneSurfaceStyle(annotationColor, {
            outlineAlpha: 0.24,
            glowAlpha: 0.18,
            radius: 28,
            active: isActive,
          }),
        },
        {
          xAxis: annotation.x_range[1],
          yAxis: annotation.y_range[1],
        },
      ];
    })
    : [];
  const zoneAreas = showInterpretation
    ? (activeZoneOverlay?.zones ?? []).map((zone: import("@/lib/quadrantZones").ZoneRegion) => [
      {
        name: zone.label,
        xAxis: zone.xRange[0],
        yAxis: zone.yRange[0],
        itemStyle: buildZoneSurfaceStyle(zone.color, {
          active: highlightOverlayKey === `zone:${zone.id}`,
        }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      {
        xAxis: zone.xRange[1],
        yAxis: zone.yRange[1],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    ])
    : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markAreaData: any = [...annotationAreas, ...zoneAreas];
  const markArea: MarkAreaComponentOption | undefined = markAreaData.length
    ? {
      silent: true,
      z: 1,
      label: { show: false },
      tooltip: { show: false },
      data: markAreaData,
    }
    : undefined;
  const gridLineStyle = { color: chartTheme.grid, opacity: 0.16 };
  const axisLineStyle = { color: chartTheme.grid, opacity: 0.28 };
  const axisLabelColor = withAlpha(chartTheme.muted, 0.75);

  return {
    tooltip: {
      confine: true,
      backgroundColor: chartTheme.background,
      borderColor: chartTheme.stroke,
      textStyle: {
        color: chartTheme.text,
        fontSize: 12,
      },
      formatter: (params: TooltipComponentFormatterCallbackParams) => {
        const entry = getParamsEntry(params);
        const isMarkArea =
          entry?.componentType === "markArea" || Array.isArray(entry?.data);
        if (isMarkArea) {
          return "";
        }
        const point = entry ? toPoint(entry.data) : null;
        if (!point) {
          return "";
        }
        const xLabel = data.axes.x.label;
        const yLabel = data.axes.y.label;
        const xValue = formatValue(point.x, data.axes.x.unit);
        const yValue = formatValue(point.y, data.axes.y.unit);
        const entityLabel = isPersonScope ? "You" : point.entity_label;

        return [
          `<div style="font-weight: 600; margin-bottom: 4px;">${entityLabel}</div>`,
          `<div style="display: flex; justify-content: space-between; gap: 12px; opacity: 0.8;"><span>${xLabel}</span> <span style="font-weight: 500;">${xValue}</span></div>`,
          `<div style="display: flex; justify-content: space-between; gap: 12px; opacity: 0.8;"><span>${yLabel}</span> <span style="font-weight: 500;">${yValue}</span></div>`,
          `<div style="margin-top: 6px; font-size: 10px; opacity: 0.6;">Click to investigate pattern</div>`
        ].join("");
      },
    },
    grid: { left: 48, right: 24, top: 24, bottom: 48, containLabel: true },
    xAxis: {
      name: xAxisLabel,
      nameLocation: "middle",
      nameGap: 30,
      type: "value",
      splitNumber: 4,
      axisLine: { lineStyle: axisLineStyle },
      axisLabel: { color: axisLabelColor },
      splitLine: { lineStyle: gridLineStyle },
    },
    yAxis: {
      name: yAxisLabel,
      nameLocation: "middle",
      nameGap: 40,
      type: "value",
      splitNumber: 4,
      axisLine: { lineStyle: axisLineStyle },
      axisLabel: { color: axisLabelColor },
      splitLine: { lineStyle: gridLineStyle },
    },
    series: [
      {
        type: "scatter",
        data: backgroundData,
        symbol: "circle",
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
        emphasis: {
          scale: true,
          itemStyle: { borderColor: chartTheme.text, borderWidth: 2 },
        },
        z: 5,
      },
      ...(hasFocus
        ? [
          {
            type: "scatter" as const,
            data: focusData,
            symbol: "circle",
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
            emphasis: {
              scale: true,
              itemStyle: { borderColor: chartTheme.text, borderWidth: 2 },
            },
            z: 6,
          },
        ]
        : []),
    ],
  };
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
  zoneOverlay?: ZoneOverlay | null;
  showZoneOverlay?: boolean;
  highlightOverlayKey?: string | null;
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
  zoneOverlay,
  showZoneOverlay = false,
  highlightOverlayKey,
}: QuadrantChartProps) {
  const chartTheme = useChartTheme();
  const colors = useChartColors();
  const mergedStyle: CSSProperties = { height, width, ...style };

  const handleClick = (params: unknown) => {
    const entry = getParamsEntry(params);
    const point = entry ? toPoint(entry.data) : null;
    if (point && onPointSelect) {
      onPointSelect(point);
    }
  };

  return (
    <Chart
      option={buildQuadrantOption({
        data,
        chartTheme,
        colors,
        focusEntityIds,
        scopeType,
        zoneOverlay,
        showZoneOverlay,
        highlightOverlayKey,
      })}
      className={className}
      style={mergedStyle}
      onEvents={{ click: handleClick }}
      chartTheme={chartTheme}
      chartColors={colors}
    />
  );
}
