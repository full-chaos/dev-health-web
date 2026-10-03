import type { TimeseriesResult } from "@/lib/graphql/schemas/analytics";

import { mergeSeriesByMeasure } from "./aggregateSeries";

/** One day of the two-series pipeline trend. `null` = no served value for that day (a gap). */
export type PipelineRatePoint = {
    day: string;
    success: number | null;
    failure: number | null;
};

/**
 * The daily success rate and failure rate of completed pipeline runs, side by side, for the
 * two-series trend chart (TestOps Overview and Pipelines).
 *
 * It only lines the two served series up by day (`mergeSeriesByMeasure` is the same roll-up the
 * tiles use). It computes no value: a day that one series does not serve stays `null` there, and
 * the failure rate is never derived from the success rate (the two need not sum to 100%).
 */
export function buildPipelineRateTrend(timeseries: TimeseriesResult[]): PipelineRatePoint[] {
    const success = mergeSeriesByMeasure(timeseries, "PIPELINE_SUCCESS_RATE");
    const failure = mergeSeriesByMeasure(timeseries, "PIPELINE_FAILURE_RATE");

    const byDay = new Map<string, PipelineRatePoint>();
    const point = (day: string): PipelineRatePoint => {
        const existing = byDay.get(day);
        if (existing) return existing;
        const created: PipelineRatePoint = { day, success: null, failure: null };
        byDay.set(day, created);
        return created;
    };

    for (const bucket of success?.buckets ?? []) point(bucket.date).success = bucket.value;
    for (const bucket of failure?.buckets ?? []) point(bucket.date).failure = bucket.value;

    return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** True when the trend has at least one served value to plot. */
export function hasPipelineRateData(points: PipelineRatePoint[]): boolean {
    return points.some((p) => p.success !== null || p.failure !== null);
}
