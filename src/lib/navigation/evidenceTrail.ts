import { getMetricLabel } from "@/lib/metrics/catalog";

type EvidenceTrailParams = {
    /** The `metric` query value (page default `cycle_time`). */
    metric?: string | null;
    /** The `api` query value: the served endpoint the page reads, with its own `metric`. */
    api?: string | null;
};

/**
 * The last crumb of a metric evidence page ("Blocked Work evidence"), read from the URL so the
 * top bar and the page header name the same metric. `null` for any other route or for a
 * drilldown / home read, which are not about one metric.
 */
export function metricEvidenceLeaf(pathname: string, params: EvidenceTrailParams): string | null {
    if (pathname !== "/explore") return null;
    // A malformed `api` value must not throw inside the shell top bar (the page reports it).
    let api: URL | null = null;
    if (params.api) {
        try {
            api = new URL(params.api, "http://localhost");
        } catch {
            return null;
        }
    }
    if (api && api.pathname !== "/api/v1/explain") return null;
    const metric = api?.searchParams.get("metric") ?? params.metric ?? "cycle_time";
    return `${getMetricLabel(metric)} evidence`;
}
