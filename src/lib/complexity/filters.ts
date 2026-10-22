import type { MetricFilter } from "@/lib/filters/types";
import { buildDateRange } from "@/lib/filters/window";

export type ComplexityScopeInput = {
    repoIds?: string[] | null;
    teamIds?: string[] | null;
};

export function complexityWindowFromFilter(time: MetricFilter["time"]): {
    sinceUtc: string;
    untilUtc: string;
} {
    const { startDate, endDate } = buildDateRange({ time } as MetricFilter);
    return {
        sinceUtc: `${startDate}T00:00:00Z`,
        untilUtc: `${endDate}T23:59:59Z`,
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
