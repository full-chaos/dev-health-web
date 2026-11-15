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
 * Merges every team `TimeseriesResult` (scope not ORG) whose `measure === measureId` into a
 * single synthetic series by combining values per date bucket across teams.
 *
 * - Rate / percentage / percentile / duration measures → **mean** per date.
 * - Raw-count measures (`COUNT`) → **sum** per date.
 * - A null bucket (backend had no data) is skipped, never counted as 0; a date
 *   where every team is null is null.
 *
 * Returns `undefined` when no matching series exist (matches prior `.find()`
 * behaviour so callers can still check for `undefined`).
 */
export function mergeSeriesByMeasure(
    timeseries: TimeseriesResult[],
    measureId: string,
): TimeseriesResult | undefined {
    // The ORG series is the org rate: it is never one more "team" in a mean (CHAOS-13780).
    const matching = timeseries.filter((s) => s.measure === measureId && s.scope !== "ORG");
    if (matching.length === 0) return undefined;
    if (matching.length === 1) return matching[0];

    // Accumulate all values per date across every team series.
    const dateMap = new Map<string, Array<number | null>>();
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
        // Missing is not zero: a team with a null bucket contributes nothing (it
        // is not a 0 that deflates the mean), and a date where every team is
        // null stays null.
        const values = (dateMap.get(date) ?? []).filter((v): v is number => v !== null);
        if (values.length === 0) return { date, value: null };
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

/**
 * The one series a TestOps tile or trend reads for `measureId`: never a mean across scopes.
 *
 * - No team selected: the served ORG series (the org rate); without one, the merge of the team
 *   series (`mergeSeriesByMeasure`).
 * - One team selected: that team's series.
 * - Several teams selected: the ORG series, which the API reads under the request's team filter
 *   (only those teams' rows); without one, the merge of the served team series.
 */
export function seriesForScope(
    timeseries: TimeseriesResult[],
    measureId: string,
    teamIds?: readonly string[],
): TimeseriesResult | undefined {
    const matching = timeseries.filter((s) => s.measure === measureId);
    if (teamIds?.length === 1) {
        return matching.find((s) => s.scope !== "ORG" && s.dimensionValue === teamIds[0]);
    }
    return matching.find((s) => s.scope === "ORG") ?? mergeSeriesByMeasure(timeseries, measureId);
}

// ---------------------------------------------------------------------------
// Page-level helpers (shared across tests, pipelines, and overview pages)
// ---------------------------------------------------------------------------

/**
 * Returns the most recent bucket value of the series `seriesForScope` reads for `measureId`.
 * `undefined` (rendered as "--") when there is no bucket or the latest bucket is
 * null; a produced 0 is returned as 0.
 */
export function getLatestValue(
    timeseries: TimeseriesResult[],
    measureId: string,
    teamIds?: readonly string[],
): number | undefined {
    const series = seriesForScope(timeseries, measureId, teamIds);
    if (!series || series.buckets.length === 0) return undefined;
    return series.buckets[series.buckets.length - 1].value ?? undefined;
}

/** Returns sparkline data of the series `seriesForScope` reads for `measureId`. */
export function getSparkline(
    timeseries: TimeseriesResult[],
    measureId: string,
    teamIds?: readonly string[],
): { ts: string; value: number | null }[] | undefined {
    const series = seriesForScope(timeseries, measureId, teamIds);
    if (!series) return undefined;
    return series.buckets.map((b: TimeseriesBucket) => ({ ts: b.date, value: b.value }));
}

/**
 * Period-over-period change (%) from first to last bucket of the series `seriesForScope` reads.
 * Returns `undefined` when history is insufficient.
 */
export function getDelta(
    timeseries: TimeseriesResult[],
    measureId: string,
    teamIds?: readonly string[],
): number | undefined {
    const series = seriesForScope(timeseries, measureId, teamIds);
    const buckets = series?.buckets;
    if (!buckets || buckets.length < 2) return undefined;
    const prev = buckets[0].value;
    const curr = buckets[buckets.length - 1].value;
    // A null endpoint has no defined change; never compute against a phantom 0.
    if (prev === null || curr === null) return undefined;
    if (prev === 0) return undefined;
    return ((curr - prev) / Math.abs(prev)) * 100;
}
