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
    /** `item` for pies and other charts without an axis; default `axis`. */
    trigger?: "axis" | "item";
    /** Keep the tooltip inside the chart box (default true; a chart that never confined passes false). */
    confine?: boolean;
    /** Tooltip text size when the chart sets one; otherwise ECharts' default. */
    fontSize?: number;
};

/** The one tooltip: surface background, hairline border, text token. Identity is the marker swatch. */
export const buildTooltip = (theme: ChartTheme, options: TooltipOptions = {}) => ({
    trigger: options.trigger ?? ("axis" as const),
    confine: options.confine ?? true,
    backgroundColor: theme.background,
    borderColor: theme.stroke,
    textStyle: { color: theme.text, ...(options.fontSize ? { fontSize: options.fontSize } : {}) },
    ...(options.crosshair
        ? {
              axisPointer: {
                  type: "line" as const,
                  lineStyle: { color: theme.muted, width: 1, type: "solid" as const },
              },
          }
        : {}),
    ...(options.formatter ? { formatter: options.formatter } : {}),
});

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
export const visibleSymbolIndexes = (values: ReadonlyArray<unknown>): Set<number> => {
    const shown = new Set<number>();
    let last = -1;
    values.forEach((value, index) => {
        if (!hasValue(value)) {
            return;
        }
        last = index;
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
 * Data items carrying the per-point symbol size, for charts with a legend: the series keeps its own
 * static `symbolSize` (so the legend glyph is unchanged) and only the points are sized 0 or `END_DOT_SIZE`.
 */
export const withPointSymbols = <T extends number | null | undefined>(values: ReadonlyArray<T>) => {
    const shown = visibleSymbolIndexes(values);
    return values.map((value, index) => ({
        value,
        symbolSize: shown.has(index) ? END_DOT_SIZE : 0,
    }));
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
