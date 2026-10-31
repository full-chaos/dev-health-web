import type { BarSeriesOption, EChartsOption, LineSeriesOption } from "echarts";

import {
    cohortCategoryOrder,
    unionCategoryOrder,
    utcTimeOrder,
} from "@/lib/ask-dev/render/category-order";
import type {
    Cohort,
    RenderPoint,
    RenderSeries,
    RenderShape,
} from "@/lib/ask-dev/render/contracts";
import { formatDisplay } from "@/lib/ask-dev/render/format";
import { utcInstant } from "@/lib/ask-dev/render/guards";
import { COHORT_SHAPE_RULES } from "@/lib/ask-dev/render/verify";

/**
 * A verified series shape as an ECharts option (CHAOS-11942, E8 design §7.1-7.3). Pure: the shape
 * in, the option out. Only the shape's own words reach the chart (`axis_label`, `value_label`,
 * `series[].label`); every number is a served point value; nothing is derived, smoothed, sampled,
 * zoomed or totalled. Bars and stacked bars are I-41 (CHAOS-11943).
 */

/** One axis position: a time instant (UTC ms) or a category label, with the served label shown. */
export type ShapePosition = {
    readonly key: string;
    readonly label: string;
    /** UTC epoch ms on a time axis; `null` on a category axis. */
    readonly at: number | null;
};

/**
 * §7.1 order. Time: by UTC instant (G5 parse), each with the served label it came from first.
 * Cohort-rule categories: ACR's rank order. Any other category axis: first-seen union. Never sorted
 * alphabetically.
 */
export function shapePositions(shape: RenderShape, cohort?: Cohort): ShapePosition[] {
    if (shape.axis_kind === "time") {
        return utcTimeOrder(shape).map(({ at, label }) => ({ key: String(at), label, at }));
    }
    const labels = COHORT_SHAPE_RULES.includes(shape.selected_by)
        ? cohortCategoryOrder(shape, cohort)
        : unionCategoryOrder(shape);
    return labels.map((label) => ({ key: label, label, at: null }));
}

/** The served point of `series` at `position`, or `undefined` (a gap: never a zero). */
export function pointAt(series: RenderSeries, position: ShapePosition): RenderPoint | undefined {
    return position.at === null
        ? series.points.find((point) => point.label === position.label)
        : series.points.find((point) => utcInstant(point.label) === position.at);
}

export type SeriesChartTheme = {
    readonly text: string;
    readonly muted: string;
    readonly grid: string;
};

export type SeriesOptionContext = {
    /** Theme series colours; series i takes colour i (G7 has already refused a shape with more). */
    readonly colors: readonly string[];
    readonly theme: SeriesChartTheme;
    /** `prefers-reduced-motion: reduce` → `animation: false`. */
    readonly reducedMotion: boolean;
};

const FONT = "var(--font-body, system-ui, sans-serif)";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Time-axis tick text: the tick's UTC month and day ("Aug 5"). Scale text only, never a served
 * word; a function, so no template is built from served text (E8 §8). ECharts' own month labels
 * are dropped by `hideOverlap` on a narrow panel, which left bare day numbers.
 */
export function utcTick(value: number): string {
    const date = new Date(value);
    return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function lineData(
    series: RenderSeries,
    positions: readonly ShapePosition[],
): NonNullable<LineSeriesOption["data"]> {
    return positions.map((position) => {
        const value = pointAt(series, position)?.value ?? null;
        // A series without a point at a position gets `null` there, so the line breaks (never 0).
        return position.at === null ? value : [position.at, value];
    });
}

/** §7.2 (time axis) and §7.3 (category axis) line charts. */
export function lineOption(
    shape: RenderShape,
    positions: readonly ShapePosition[],
    context: SeriesOptionContext,
): EChartsOption {
    const time = shape.axis_kind === "time";
    const legend = shape.series.length >= 2;
    const colors = shape.series.map((_, index) => context.colors[index]!);
    const axisText = { color: context.theme.muted, fontFamily: FONT };
    return {
        animation: !context.reducedMotion,
        useUTC: true,
        color: colors,
        backgroundColor: "transparent",
        textStyle: { color: context.theme.text, fontFamily: FONT },
        tooltip: { show: false },
        legend: legend
            ? {
                  show: true,
                  selectedMode: false,
                  top: 0,
                  left: 0,
                  data: shape.series.map((series) => series.label),
                  textStyle: { color: context.theme.text, fontFamily: FONT },
              }
            : { show: false },
        grid: { left: 8, right: 16, top: legend ? 48 : 28, bottom: 28 },
        xAxis: time
            ? {
                  type: "time",
                  name: shape.axis_label,
                  nameLocation: "middle",
                  nameGap: 24,
                  nameTextStyle: axisText,
                  axisLabel: { ...axisText, hideOverlap: true, formatter: utcTick },
                  axisLine: { lineStyle: { color: context.theme.grid } },
                  splitLine: { show: false },
              }
            : {
                  type: "category",
                  data: positions.map((position) => position.label),
                  boundaryGap: false,
                  name: shape.axis_label,
                  nameLocation: "middle",
                  nameGap: 24,
                  nameTextStyle: axisText,
                  axisLabel: { ...axisText, hideOverlap: true },
                  axisLine: { lineStyle: { color: context.theme.grid } },
              },
        yAxis: {
            type: "value",
            scale: false,
            name: shape.value_label,
            nameLocation: "end",
            nameTextStyle: { ...axisText, align: "left" },
            axisLabel: axisText,
            splitLine: { lineStyle: { color: context.theme.grid } },
        },
        series: shape.series.map((series, index): LineSeriesOption => ({
            type: "line",
            id: series.key,
            name: series.label,
            data: lineData(series, positions),
            smooth: false,
            step: false,
            connectNulls: false,
            showSymbol: true,
            showAllSymbol: true,
            symbol: "circle",
            symbolSize: 6,
            lineStyle: { width: 2, color: colors[index] },
            itemStyle: { color: colors[index] },
            label: { show: false },
            emphasis: { disabled: true },
            silent: true,
        })),
    };
}

/** A bar no wider than this: one bar in a wide panel still reads as a bar (ask-dev MAX_BAR_WIDTH). */
const MAX_BAR_WIDTH = 88;

/** One legend row per series (a vertical legend never wraps, whatever the panel width). */
const LEGEND_ROW = 20;

/**
 * §7.4 bars and stacked bars on a category axis (CHAOS-11943). `bars`: one series carries a value
 * label on top, in the display form (the value table has the exact form); several series carry
 * none. `stacked_bars`: every series is stacked (`stack: "s"`) in served order, bottom up; G6 has
 * refused a negative value, so the default same-sign stacking applies. A series with no point at a
 * position gets `null` there (no zero-height segment). No total anywhere (G3): no total label,
 * series, axis-max text, table column or summary.
 */
export function barOption(
    shape: RenderShape,
    positions: readonly ShapePosition[],
    context: SeriesOptionContext,
): EChartsOption {
    const stacked = shape.presentation === "stacked_bars";
    const legend = shape.series.length >= 2;
    const valueLabels = !stacked && shape.series.length === 1;
    const colors = shape.series.map((_, index) => context.colors[index]!);
    const axisText = { color: context.theme.muted, fontFamily: FONT };
    return {
        animation: !context.reducedMotion,
        color: colors,
        backgroundColor: "transparent",
        textStyle: { color: context.theme.text, fontFamily: FONT },
        tooltip: { show: false },
        legend: legend
            ? {
                  show: true,
                  selectedMode: false,
                  orient: "vertical",
                  top: 0,
                  left: 0,
                  itemGap: 4,
                  data: shape.series.map((series) => series.label),
                  textStyle: { color: context.theme.text, fontFamily: FONT },
              }
            : { show: false },
        // The rotated member names and both axis names stay inside the chart (no clipped name).
        grid: {
            left: 8,
            right: 16,
            top: legend ? 16 + LEGEND_ROW * shape.series.length : 16,
            bottom: 8,
            outerBoundsMode: "same",
            outerBoundsContain: "all",
        },
        xAxis: {
            type: "category",
            data: positions.map((position) => position.label),
            name: shape.axis_label,
            nameLocation: "middle",
            nameGap: 28,
            nameTextStyle: axisText,
            // Long member names are drawn at an angle and never shortened; the value table has
            // every name in full.
            axisLabel: { ...axisText, rotate: 30, hideOverlap: true },
            axisLine: { lineStyle: { color: context.theme.grid } },
        },
        yAxis: {
            type: "value",
            scale: false,
            name: shape.value_label,
            // Along the axis, so a wrapped legend never sits on it.
            nameLocation: "middle",
            nameRotate: 90,
            nameGap: 36,
            nameTextStyle: axisText,
            axisLabel: axisText,
            splitLine: { lineStyle: { color: context.theme.grid } },
        },
        series: shape.series.map((series, index): BarSeriesOption => ({
            type: "bar",
            id: series.key,
            name: series.label,
            data: positions.map((position) => pointAt(series, position)?.value ?? null),
            ...(stacked ? { stack: "s" } : {}),
            barMaxWidth: MAX_BAR_WIDTH,
            itemStyle: { color: colors[index] },
            label: valueLabels
                ? {
                      show: true,
                      position: "top",
                      color: context.theme.text,
                      fontFamily: FONT,
                      formatter: (params: { value?: unknown }) =>
                          typeof params.value === "number" ? formatDisplay(params.value) : "",
                  }
                : { show: false },
            emphasis: { disabled: true },
            silent: true,
        })),
    };
}

/**
 * The chart's height in px: a line 224; bars 256, plus one legend row per series when there are
 * several, so the plot keeps its height under a vertical legend.
 */
export function chartHeight(shape: RenderShape): number {
    if (shape.presentation === "line") return 224;
    return 256 + (shape.series.length >= 2 ? LEGEND_ROW * shape.series.length : 0);
}

/** The option for a verified series shape: `line` (I-24), `bars` and `stacked_bars` (I-41). */
export function seriesOption(
    shape: RenderShape,
    positions: readonly ShapePosition[],
    context: SeriesOptionContext,
): EChartsOption {
    return shape.presentation === "line"
        ? lineOption(shape, positions, context)
        : barOption(shape, positions, context);
}
