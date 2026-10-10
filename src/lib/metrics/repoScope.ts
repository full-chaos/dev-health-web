import type { MetricFilter } from "@/lib/filters/types";

/**
 * FALLBACK ONLY (CHAOS-9078): metrics the Home query does NOT narrow by repository, for a row with
 * no served `repo_filter_applied`. The served flag decides everywhere it exists.
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
 * A repository is named in the filter bar (`what.repos`). A repository that IS the scope is not
 * this case: the quadrant and heatmap routes take it as `scope_type=repo`, so it reaches the chart.
 */
export const hasSelectedRepos = (filters: MetricFilter): boolean =>
    (filters.what.repos?.length ?? 0) > 0;

/** The served flag of a row (`MetricDelta` or `HomeSignal`): null = no repository named. */
export type RepoFilterServed = { repo_filter_applied?: boolean | null };

/**
 * True when the repository filter does NOT narrow this metric's value, so the tile needs the note.
 *
 * The SERVED flag decides (CHAOS-9078): `repo_filter_applied === false` is a note; `true` (the
 * filter reached the metric, also when it matched nothing: the row then has no data) and `null`
 * (no repository named) are none. The hardcoded set is only the fallback for a row with no served
 * flag (the field is undefined: an older backend, or a surface that reads another endpoint, such
 * as Explore). Its value stays as served; only the note is added.
 */
export const isRepoUnscopedMetric = (
    metric: string,
    filters: MetricFilter,
    served?: RepoFilterServed | null,
): boolean => {
    if (served && served.repo_filter_applied !== undefined) {
        return served.repo_filter_applied === false;
    }
    return hasRepositoryFilter(filters) && REPO_UNSCOPED_METRICS.has(metric);
};

/** A tile caption with the note appended ("<caption> · <note>") when the repository filter does not reach the metric. */
export const withRepoScopeNote = (
    caption: string | undefined,
    metric: string,
    filters: MetricFilter,
    served?: RepoFilterServed | null,
): string | undefined =>
    isRepoUnscopedMetric(metric, filters, served)
        ? [caption, NOT_FILTERED_BY_REPOSITORY].filter(Boolean).join(" · ")
        : caption;

/**
 * The note on a quadrant or heatmap. The SERVED `repo_filter_applied` decides: `false` = note;
 * `true` (narrowed) and `null` (nothing selected) = none. Only when the key is ABSENT (an ops
 * without CHAOS-9159) does the old rule hold: a repository named in the filter = note.
 */
export const showChartRepoNote = (
    filters: MetricFilter | undefined,
    served?: RepoFilterServed | null,
): boolean => {
    if (served && served.repo_filter_applied !== undefined) {
        return served.repo_filter_applied === false;
    }
    return filters ? hasSelectedRepos(filters) : false;
};

/** Query params the quadrant and heatmap routes take beside the scope: repeatable lists. */
export const repoFilterParams = (
    filters?: MetricFilter,
): { team_ids: string[]; repo_ids: string[] } => ({
    team_ids: filters && filters.scope.level === "team" ? filters.scope.ids : [],
    repo_ids: filters?.what.repos ?? [],
});
