import type { FilterInput, ScopeLevelInput } from "@/lib/graphql/schemas/analytics";
import type { MetricFilter } from "@/lib/filters/types";

export type TestOpsScope = {
    repoIds?: string[];
    teamIds?: string[];
    analytics: FilterInput;
};

/**
 * The TestOps scope bar writes teams to `scope` and repositories to `what.repos`.
 * Keep the two API forms aligned so every TestOps read describes the same selected scope.
 */
export function testOpsScopeFromFilters(filters: MetricFilter): TestOpsScope {
    const repoIds = filters.what.repos?.length
        ? filters.what.repos
        : filters.scope.level === "repo" && filters.scope.ids.length
          ? filters.scope.ids
          : undefined;
    const teamIds =
        filters.scope.level === "team" && filters.scope.ids.length ? filters.scope.ids : undefined;

    return {
        ...(repoIds ? { repoIds } : {}),
        ...(teamIds ? { teamIds } : {}),
        analytics: {
            scope: {
                level: filters.scope.level.toUpperCase() as ScopeLevelInput,
                ids: filters.scope.ids,
            },
            ...(filters.what.repos?.length ? { what: { repos: filters.what.repos } } : {}),
        },
    };
}
