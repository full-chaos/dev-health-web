import type { MetricFilter } from "@/lib/filters/types";

/**
 * Metrics the Home query does NOT narrow by repository (CHAOS-9089).
 *
 * Source of this set: the ops Home reader, `internal/queryapi/home/metricspec.go`, field `Scope`.
 * A metric with `Scope: "team"` is read from work-item tables, which have no repository key, so a
 * repository filter cannot reach it; it follows the team scope only. The four keys below are those
 * metrics. This is a copy, kept in ONE place: when ops serves the scope of each metric, read the
 * served value in `isRepoUnscopedMetric` and delete this set.
 */
export const REPO_UNSCOPED_METRICS: ReadonlySet<string> = new Set([
    "cycle_time",
    "throughput",
    "wip_saturation",
    "blocked_work",
]);

/** The note on a value that a selected repository does not narrow. */
export const NOT_FILTERED_BY_REPOSITORY = "Not filtered by repository";

/** A repository is selected: in the filter bar (`what.repos`) or as the scope itself. */
export const hasRepositoryFilter = (filters: MetricFilter): boolean =>
    (filters.what.repos?.length ?? 0) > 0 ||
    (filters.scope.level === "repo" && filters.scope.ids.length > 0);

/**
 * True when a repository is selected AND the metric is one the repository filter does not reach.
 * Its value stays as served (it is true for the team or organization scope); only the note is added.
 */
export const isRepoUnscopedMetric = (metric: string, filters: MetricFilter): boolean =>
    hasRepositoryFilter(filters) && REPO_UNSCOPED_METRICS.has(metric);

/** A tile caption with the note appended ("<caption> · <note>") when the repository filter does not reach the metric. */
export const withRepoScopeNote = (
    caption: string | undefined,
    metric: string,
    filters: MetricFilter,
): string | undefined =>
    isRepoUnscopedMetric(metric, filters)
        ? [caption, NOT_FILTERED_BY_REPOSITORY].filter(Boolean).join(" · ")
        : caption;
