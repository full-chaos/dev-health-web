import type { TimeseriesResult, TimeseriesBucket } from "@/lib/graphql/schemas/analytics";

// Measures that represent raw counts and should be **summed** when merging
// across teams. All other measures (rates, percentages, percentiles, durations)
// are **averaged** — summing percentages or p95 latencies across teams is
// mathematically wrong.
//
// Approximation note: a volume-weighted org rollup would be more accurate for
// rate measures (e.g. weighting PIPELINE_SUCCESS_RATE by pipeline count per
// team). That requires server-side denominator data not yet available in the
// per-team TimeseriesResult payload. A client-side unweighted mean is the best
// available approximation; it may diverge from the true org rate when teams
// have very different volumes. The correct long-term fix is to compute the
// aggregate server-side and return a single org-level series — tracked as a
// deferred backend improvement.
const COUNT_MEASURES = new Set(["COUNT"]);

function isSumMeasure(measureId: string): boolean {
    return COUNT_MEASURES.has(measureId);
}

/**
 * Merges every `TimeseriesResult` whose `measure === measureId` into a single
 * synthetic org-level series by combining values per date bucket across teams.
 *
 * - Rate / percentage / percentile / duration measures → **mean** per date.
 * - Raw-count measures (`COUNT`) → **sum** per date.
 *
 * Returns `undefined` when no matching series exist (matches prior `.find()`
 * behaviour so callers can still check for `undefined`).
 */
export function mergeSeriesByMeasure(
    timeseries: TimeseriesResult[],
    measureId: string,
): TimeseriesResult | undefined {
    const matching = timeseries.filter((s) => s.measure === measureId);
    if (matching.length === 0) return undefined;
    if (matching.length === 1) return matching[0];

    // Accumulate all values per date across every team series.
    const dateMap = new Map<string, number[]>();
    for (const series of matching) {
        for (const bucket of series.buckets) {
            const existing = dateMap.get(bucket.date);
            if (existing) {
                existing.push(bucket.value);
            } else {
                dateMap.set(bucket.date, [bucket.value]);
            }
        }
    }

    // Sort dates ascending, matching the SQL `bucket ASC` ordering.
    const sortedDates = Array.from(dateMap.keys()).sort();

    const useSum = isSumMeasure(measureId);
    const mergedBuckets: TimeseriesBucket[] = sortedDates.map((date) => {
        const values = dateMap.get(date)!;
        const total = values.reduce((a, b) => a + b, 0);
        const combined = useSum ? total : total / values.length;
        return { date, value: combined };
    });

    return {
        dimension: matching[0].dimension,
        // "org" signals this is a rolled-up aggregate, not a single-team series.
        dimensionValue: "org",
        measure: measureId,
        buckets: mergedBuckets,
    };
}

// ---------------------------------------------------------------------------
// Page-level helpers (shared across tests, pipelines, and overview pages)
// ---------------------------------------------------------------------------

/** Returns the most recent bucket value for `measureId`, merged across all teams. */
export function getLatestValue(
    timeseries: TimeseriesResult[],
    measureId: string,
): number | undefined {
    const series = mergeSeriesByMeasure(timeseries, measureId);
    if (!series || series.buckets.length === 0) return undefined;
    return series.buckets[series.buckets.length - 1].value;
}

/** Returns sparkline data for `measureId`, merged across all teams. */
export function getSparkline(
    timeseries: TimeseriesResult[],
    measureId: string,
): { ts: string; value: number }[] | undefined {
    const series = mergeSeriesByMeasure(timeseries, measureId);
    if (!series) return undefined;
    return series.buckets.map((b: TimeseriesBucket) => ({ ts: b.date, value: b.value }));
}

/**
 * Period-over-period change (%) from first to last bucket, merged across all
 * teams. Returns `undefined` when history is insufficient.
 */
export function getDelta(timeseries: TimeseriesResult[], measureId: string): number | undefined {
    const series = mergeSeriesByMeasure(timeseries, measureId);
    const buckets = series?.buckets;
    if (!buckets || buckets.length < 2) return undefined;
    const prev = buckets[0].value;
    const curr = buckets[buckets.length - 1].value;
    if (prev === 0) return undefined;
    return ((curr - prev) / Math.abs(prev)) * 100;
}
