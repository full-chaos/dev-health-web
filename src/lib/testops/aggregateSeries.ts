import type { TimeseriesResult, TimeseriesBucket } from "@/lib/graphql/schemas/analytics";

/**
 * The one served series a TestOps tile or trend reads for `measureId`. The web never makes a series
 * from other series: no mean, no sum.
 *
 * - One team selected: that team's series.
 * - Otherwise the ORG series: the org rate, or with several teams selected the rate the API reads
 *   under the request's team filter.
 * - No ORG series (P95 durations, queue time): the one served team series, when exactly one is served.
 *   Two or more is no value; `needsOneTeamPick` names that state.
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
    const org = matching.find((s) => s.scope === "ORG");
    if (org) return org;
    const teams = matching.filter((s) => s.scope !== "ORG");
    return teams.length === 1 ? teams[0] : undefined;
}

/**
 * True when the scope has no one served series for `measureId`: no ORG series and two or more team
 * series. The tile and the trend then ask for one team, never show a number.
 */
export function needsOneTeamPick(
    timeseries: TimeseriesResult[],
    measureId: string,
    teamIds?: readonly string[],
): boolean {
    if (teamIds?.length === 1) return false;
    const matching = timeseries.filter((s) => s.measure === measureId);
    return !matching.some((s) => s.scope === "ORG") && matching.length >= 2;
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
