"use client";

import type { CSSProperties } from "react";
// Type-only imports from full echarts package (erased at runtime — no bundle impact).
import type {
    DefaultLabelFormatterCallbackParams,
    EChartsOption,
    MarkAreaComponentOption,
    TooltipComponentFormatterCallbackParams,
} from "echarts";
import { ScatterChart } from "echarts/charts";

import type { ZoneOverlay } from "@/lib/quadrantZones";
import { ZONE_GRADIENT_ALPHA } from "@/lib/themeTints";
import { chartEntityLabel } from "@/lib/labels/entityLabel";
import type { QuadrantPoint, QuadrantResponse } from "@/lib/types";

import { Chart } from "./Chart";
import { type ChartTheme, useChartColors, useChartTheme } from "./chartTheme";
import { echarts } from "@/lib/echartsInit";
import { formatQuadrantValue } from "./quadrantFormat";

echarts.use([ScatterChart]);

const normalizeScopeType = (
    scopeType?: "org" | "team" | "repo" | "person" | "developer" | "service" | string,
) => (scopeType === "developer" ? "person" : (scopeType ?? "org"));

const rgbaPattern = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/i;
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
        hex.length === 3
            ? hex
                  .split("")
                  .map((item) => item + item)
                  .join("")
            : hex;
    const value = Number.parseInt(normalized, 16);
    if (Number.isNaN(value)) {
        return color;
    }
    const red = (value >> 16) & 255;
    const green = (value >> 8) & 255;
    const blue = value & 255;
    return `rgba(${red}, ${green}, ${blue}, ${nextAlpha})`;
};

// Zone drawing is production's: a radial gradient of the zone hue, a dashed outline and a
// glow. Only the hue comes from the theme (`--quadrant-zone-N`); the alphas are the ones the
// theme test checks.
const buildZoneGradient = (color: string) => ({
    type: "radial" as const,
    x: 0.45,
    y: 0.4,
    r: 0.95,
    colorStops: [
        { offset: 0, color: withAlpha(color, ZONE_GRADIENT_ALPHA.peak) },
        { offset: 0.6, color: withAlpha(color, ZONE_GRADIENT_ALPHA.mid) },
        { offset: 1, color: withAlpha(color, ZONE_GRADIENT_ALPHA.edge) },
    ],
});

const buildZoneSurfaceStyle = (
    color: string,
    options?: {
        outlineAlpha?: number;
        glowAlpha?: number;
        radius?: number;
        active?: boolean;
    },
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

/**
 * A percent axis runs 0 to 100 in steps of 25 when every served value on it is in that range, as a
 * percent axis reads (display only: left alone, ECharts rounds the top up to 120 with uneven ticks).
 * A served percent outside 0 to 100 keeps the automatic range, so no point is ever cut off.
 */
export const percentAxisRange = (
    unit: string | undefined,
    values: readonly number[],
): { min: number; max: number; interval: number } | undefined =>
    unit === "%" && values.every((value) => value >= 0 && value <= 100)
        ? { min: 0, max: 100, interval: 25 }
        : undefined;

/** Id of the label-only series that draws the team / repo point labels above every dot. */
export const POINT_LABEL_SERIES_ID = "point-labels";

/** Plot-area insets with no point labels (the axis labels are kept in by `containLabel`). */
const GRID = { left: 48, right: 24, top: 24, bottom: 48 };
/** Approximate advance of one character of a point label (11px at most). */
const POINT_LABEL_CHAR_PX = 6.5;
/** Height of a point label above its dot (label line plus the gap to the dot). */
const POINT_LABEL_HEIGHT_PX = 22;

/**
 * Plot-area insets that keep a point label inside the chart. A label is centred above its dot, so a
 * point on the right edge (a percent axis ending at 100) needs half its label width of room on the
 * right, and a point on the top edge needs the label height above. Display only.
 */
export const quadrantGrid = (labels: readonly string[]) => {
    if (labels.length === 0) return { ...GRID, containLabel: true };
    const longest = Math.max(...labels.map((label) => label.length));
    return {
        ...GRID,
        right: Math.max(GRID.right, Math.ceil((longest * POINT_LABEL_CHAR_PX) / 2) + 8),
        top: Math.max(GRID.top, POINT_LABEL_HEIGHT_PX + 8),
        containLabel: true,
    };
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
    const xAxisRange = percentAxisRange(
        data.axes.x.unit,
        data.points.map((point) => point.x),
    );
    const yAxisRange = percentAxisRange(
        data.axes.y.unit,
        data.points.map((point) => point.y),
    );

    const normalizedScopeType = normalizeScopeType(scopeType);
    const isPersonScope = normalizedScopeType === "person";
    const showPointLabels = normalizedScopeType === "team" || normalizedScopeType === "repo";
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
    // The labels drawn above the dots: every point on a team / repo chart, the focus points always.
    const pointLabels = [...(showPointLabels ? backgroundPoints : []), ...focusPoints].map(
        (point) => chartEntityLabel(point.entity_label),
    );

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
    const annotationColor = withAlpha(chartTheme.muted, 0.2);
    const annotationAreas: MarkAreaComponentOption["data"] = showInterpretation
        ? (data.annotations ?? []).map((annotation, index) => {
              const isActive = highlightOverlayKey === `annotation:${index}`;
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
    const zoneAreas: MarkAreaComponentOption["data"] = showInterpretation
        ? (activeZoneOverlay?.zones ?? []).map((zone: import("@/lib/quadrantZones").ZoneRegion) => [
              {
                  name: zone.label,
                  xAxis: zone.xRange[0],
                  yAxis: zone.yRange[0],
                  itemStyle: buildZoneSurfaceStyle(zone.color, {
                      active: highlightOverlayKey === `zone:${zone.id}`,
                  }),
              },
              {
                  xAxis: zone.xRange[1],
                  yAxis: zone.yRange[1],
              },
          ])
        : [];
    const markAreaData: MarkAreaComponentOption["data"] = [
        ...(annotationAreas ?? []),
        ...(zoneAreas ?? []),
    ];
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
                const xValue = formatQuadrantValue(point.x, data.axes.x.unit);
                const yValue = formatQuadrantValue(point.y, data.axes.y.unit);
                const entityLabel = isPersonScope ? "You" : chartEntityLabel(point.entity_label);

                return [
                    `<div style="font-weight: 600; margin-bottom: 4px;">${entityLabel}</div>`,
                    `<div style="display: flex; justify-content: space-between; gap: 12px; opacity: 0.8;"><span>${xLabel}</span> <span style="font-weight: 500;">${xValue}</span></div>`,
                    `<div style="display: flex; justify-content: space-between; gap: 12px; opacity: 0.8;"><span>${yLabel}</span> <span style="font-weight: 500;">${yValue}</span></div>`,
                    `<div style="margin-top: 6px; font-size: 10px; opacity: 0.6;">Click to investigate pattern</div>`,
                ].join("");
            },
        },
        grid: quadrantGrid(pointLabels),
        xAxis: {
            name: xAxisLabel,
            nameLocation: "middle",
            nameGap: 30,
            type: "value",
            splitNumber: 4,
            ...xAxisRange,
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
            ...yAxisRange,
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
                // The point labels are drawn by the label series below, above every dot.
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
                              color: colors[0] ?? chartTheme.accent2,
                          },
                          label: {
                              show: true,
                              formatter: (params: DefaultLabelFormatterCallbackParams) => {
                                  const point = toPoint(params.data);
                                  return point ? chartEntityLabel(point.entity_label) : "";
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
            // Team / repo point labels in their own silent series drawn above all dots, so another
            // point's dot never covers a label; overlapping labels are moved, or hidden when they
            // still overlap. Points, tooltips and clicks stay on the dot series. Display only.
            ...(showPointLabels && backgroundData.length
                ? [
                      {
                          type: "scatter" as const,
                          id: POINT_LABEL_SERIES_ID,
                          data: backgroundData,
                          symbol: "circle",
                          symbolSize: normalizedScopeType === "person" ? 8 : 10,
                          itemStyle: { opacity: 0 },
                          silent: true,
                          tooltip: { show: false },
                          label: {
                              show: true,
                              formatter: (params: DefaultLabelFormatterCallbackParams) => {
                                  const point = toPoint(params.data);
                                  return point ? chartEntityLabel(point.entity_label) : "";
                              },
                              color: chartTheme.muted,
                              fontSize: 10,
                              position: "top" as const,
                              // A halo in the chart background keeps the text readable over a dot.
                              textBorderColor: chartTheme.background,
                              textBorderWidth: 2,
                          },
                          labelLayout: { hideOverlap: true, moveOverlap: "shiftY" as const },
                          z: 7,
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
    onPointSelectAction?: (point: QuadrantPoint) => void;
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
    onPointSelectAction,
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
        if (point && onPointSelectAction) {
            onPointSelectAction(point);
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
