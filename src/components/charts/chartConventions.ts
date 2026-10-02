import type { TooltipComponentOption } from "echarts";

import type { ChartTheme } from "./chartTheme";

/**
 * Chart conventions shared by the time series, sparkline and bar wrappers:
 * one tooltip, a muted hairline crosshair, round 2px lines, a symbol only where
 * a point would otherwise be invisible, and a legend only for two or more series.
 * Colors come from the theme store; nothing here holds a color literal.
 */

type TooltipOptions = {
    /** ECharts' own tooltip formatter type, so the option stays assignable to `TooltipComponentOption`. */
    formatter?: TooltipComponentOption["formatter"];
    /** Draw the time-series crosshair (muted, 1px, solid). Bars keep ECharts' default pointer. */
    crosshair?: boolean;
    /** `cross` keeps a chart's two-axis pointer (with value labels) and themes its lines. */
    pointer?: "line" | "cross";
    /** `item` for pies and other charts without an axis; default `axis`. */
    trigger?: "axis" | "item";
    /** Keep the tooltip inside the chart box (default true; a chart that never confined passes false). */
    confine?: boolean;
    /** Tooltip text size when the chart sets one; otherwise ECharts' default. */
    fontSize?: number;
};

type PointerLine = { color: string; width: 1; type: "solid" };

/** What `buildTooltip` returns; `axisPointer` and `formatter` are present only when asked for. */
export type BuiltTooltip = {
    trigger: "axis" | "item";
    confine: boolean;
    backgroundColor: string;
    borderColor: string;
    textStyle: { color: string; fontSize?: number };
    axisPointer?: {
        type: "line" | "cross";
        lineStyle: PointerLine;
        crossStyle?: PointerLine;
        label?: { backgroundColor: string };
    };
    formatter?: TooltipComponentOption["formatter"];
};

/** The one tooltip: surface background, hairline border, text token. Identity is the marker swatch. */
export const buildTooltip = (theme: ChartTheme, options: TooltipOptions = {}): BuiltTooltip => {
    const line: PointerLine = { color: theme.muted, width: 1, type: "solid" };
    const axisPointer: BuiltTooltip["axisPointer"] = !options.crosshair
        ? undefined
        : options.pointer === "cross"
          ? {
                type: "cross",
                lineStyle: line,
                crossStyle: line,
                label: { backgroundColor: theme.muted },
            }
          : { type: "line", lineStyle: line };
    return {
        trigger: options.trigger ?? "axis",
        confine: options.confine ?? true,
        backgroundColor: theme.background,
        borderColor: theme.stroke,
        textStyle: {
            color: theme.text,
            ...(options.fontSize ? { fontSize: options.fontSize } : {}),
        },
        ...(axisPointer ? { axisPointer } : {}),
        ...(options.formatter ? { formatter: options.formatter } : {}),
    };
};

/** A 2px line with round caps and joins. */
export const lineMark = { width: 2, cap: "round" as const, join: "round" as const };

/** The dot is ringed in the surface color so it separates from the line and the grid. */
export const dotRing = (theme: ChartTheme) => ({ borderColor: theme.background, borderWidth: 2 });

export const END_DOT_SIZE = 8;

const hasValue = (value: unknown) => value !== null && value !== undefined;

/**
 * Which points get a symbol: the last point with a value, and every isolated point (one with
 * no neighbour on either side, such as a single value between gaps or a one-point series),
 * which a line could not show. Every other point has no symbol; hover still reads it through
 * the crosshair and tooltip.
 */
export const visibleSymbolIndexes = (
    values: ReadonlyArray<unknown>,
    options: { connectNulls?: boolean } = {},
): Set<number> => {
    const shown = new Set<number>();
    let last = -1;
    values.forEach((value, index) => {
        if (!hasValue(value)) {
            return;
        }
        last = index;
        // With `connectNulls` the line bridges a gap, so a point between gaps is not isolated.
        if (options.connectNulls) {
            return;
        }
        const before = index > 0 && hasValue(values[index - 1]);
        const after = index < values.length - 1 && hasValue(values[index + 1]);
        if (!before && !after) {
            shown.add(index);
        }
    });
    if (last >= 0) {
        shown.add(last);
    }
    return shown;
};

/** ECharts `symbolSize` callback: `END_DOT_SIZE` on the points above, 0 elsewhere. */
export const pointSymbolSize = (values: ReadonlyArray<unknown>) => {
    const shown = visibleSymbolIndexes(values);
    return (_value: unknown, params: { dataIndex: number }): number =>
        shown.has(params.dataIndex) ? END_DOT_SIZE : 0;
};

/**
 * Data items carrying the per-point symbol size and ring, for charts with a legend: the series keeps its
 * own static `symbolSize` and no ring (so the legend glyph is unchanged); only the points are sized 0 or
 * `END_DOT_SIZE`, and a shown dot is ringed in the surface color.
 */
export const withPointSymbols = <T extends number | null | undefined>(
    values: ReadonlyArray<T>,
    theme: ChartTheme,
    options: { connectNulls?: boolean } = {},
) => {
    const shown = visibleSymbolIndexes(values, options);
    return values.map((value, index) =>
        shown.has(index)
            ? { value, symbolSize: END_DOT_SIZE, itemStyle: dotRing(theme) }
            : { value, symbolSize: 0 },
    );
};

/** A bottom legend in muted text for two or more series; none for one. */
export const buildLegend = (names: string[], theme: ChartTheme, show = names.length >= 2) =>
    show
        ? {
              data: names,
              bottom: 0,
              left: "center" as const,
              textStyle: { color: theme.muted },
          }
        : undefined;
