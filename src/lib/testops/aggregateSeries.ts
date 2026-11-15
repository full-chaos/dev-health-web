import type { TimeseriesResult, TimeseriesBucket } from "@/lib/graphql/schemas/analytics";

/**
 * The one served series a TestOps tile or trend reads for `measureId`: the ORG series, for every
 * scope. The API reads it under the request's filters, so with one or more teams selected it is the
 * value of those teams' repositories. A team series is never shown as the scope's value, and the web
 * never makes a series from other series: no mean, no sum. No ORG series is no value ("Not reported").
 */
export function seriesForScope(
    timeseries: TimeseriesResult[],
    measureId: string,
): TimeseriesResult | undefined {
    return timeseries.find((s) => s.measure === measureId && s.scope === "ORG");
}

// ---------------------------------------------------------------------------
// Page-level helpers (shared across tests, pipelines, and overview pages)
// ---------------------------------------------------------------------------

/**
 * Returns the most recent bucket value of the series `seriesForScope` reads for `measureId`.
 * `undefined` (the tile reads "Not reported") when there is no series, no bucket or the latest
 * bucket is null; a produced 0 is returned as 0.
 */
export function getLatestValue(
    timeseries: TimeseriesResult[],
    measureId: string,
): number | undefined {
    const series = seriesForScope(timeseries, measureId);
    if (!series || series.buckets.length === 0) return undefined;
    return series.buckets[series.buckets.length - 1].value ?? undefined;
}

/** Returns sparkline data of the series `seriesForScope` reads for `measureId`. */
export function getSparkline(
    timeseries: TimeseriesResult[],
    measureId: string,
): { ts: string; value: number | null }[] | undefined {
    const series = seriesForScope(timeseries, measureId);
    if (!series) return undefined;
    return series.buckets.map((b: TimeseriesBucket) => ({ ts: b.date, value: b.value }));
}

/**
 * Period-over-period change (%) from first to last bucket of the series `seriesForScope` reads.
 * Returns `undefined` when history is insufficient.
 */
export function getDelta(timeseries: TimeseriesResult[], measureId: string): number | undefined {
    const series = seriesForScope(timeseries, measureId);
    const buckets = series?.buckets;
    if (!buckets || buckets.length < 2) return undefined;
    const prev = buckets[0].value;
    const curr = buckets[buckets.length - 1].value;
    // A null endpoint has no defined change; never compute against a phantom 0.
    if (prev === null || curr === null) return undefined;
    if (prev === 0) return undefined;
    return ((curr - prev) / Math.abs(prev)) * 100;
}
