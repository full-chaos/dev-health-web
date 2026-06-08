/**
 * Pure, server-safe timeseries helpers shared by TimeseriesChart (a `"use client"`
 * chart wrapper) and server components that need the same ordering contract.
 *
 * This module is deliberately NEUTRAL — it carries no `"use client"` directive — so a
 * server component can import and CALL `orderTimeseriesPoints` directly. Re-exporting it
 * through the client `TimeseriesChart` module would turn it into a client reference under
 * RSC, which throws when invoked during server render (CHAOS-2079).
 */

export type TimeseriesPoint = {
    day: string;
    value: number;
    /** Optional compact axis label (e.g. "MM-DD"). Ordering always uses `day`, so a
     *  truncated label can never reorder the series across a month/year boundary. */
    label?: string;
};

/**
 * Order timeseries points chronologically by their full `day` key and project them into
 * echarts category/value arrays. The axis label prefers an explicit `label` (compact
 * "MM-DD") but sorting ALWAYS uses `day`, so a truncated label can never reorder the
 * series across a month or year boundary (CHAOS-2079 regression guard).
 */
export function orderTimeseriesPoints(data: TimeseriesPoint[]): {
    categories: string[];
    values: number[];
} {
    const ordered = [...data].sort((a, b) => a.day.localeCompare(b.day));
    return {
        categories: ordered.map((point) => point.label ?? point.day),
        values: ordered.map((point) => point.value),
    };
}
