import type { MetricFilter } from "@/lib/filters/types";

export type ComplexityScopeInput = {
    repoIds?: string[] | null;
    teamIds?: string[] | null;
};

export function complexityWindowFromFilter(time: MetricFilter["time"]): {
    sinceUtc: string;
    untilUtc: string;
} {
    if (time.start_date && time.end_date) {
        return {
            sinceUtc: `${time.start_date}T00:00:00Z`,
            untilUtc: `${time.end_date}T23:59:59Z`,
        };
    }
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - (time.range_days - 1));
    const isoDate = (d: Date) => d.toISOString().slice(0, 10);
    return {
        sinceUtc: `${isoDate(start)}T00:00:00Z`,
        untilUtc: `${isoDate(end)}T23:59:59Z`,
    };
}

export function complexityScopeInputFromFilter(filters: MetricFilter): ComplexityScopeInput {
    const repoIds =
        filters.scope.level === "repo" && filters.scope.ids.length > 0
            ? filters.scope.ids
            : filters.what.repos && filters.what.repos.length > 0
              ? filters.what.repos
              : null;
    const teamIds =
        filters.scope.level === "team" && filters.scope.ids.length > 0 ? filters.scope.ids : null;
    return { repoIds, teamIds };
}
