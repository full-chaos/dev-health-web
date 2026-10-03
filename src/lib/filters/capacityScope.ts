import type { MetricFilter } from "./types";

/**
 * The team ids a capacity forecast reads: every id of a team scope, each once,
 * in the order given; nothing for any other scope level or an empty selection
 * (the org-wide forecast). The server hydration and the client hook both build
 * their input from this, so they share one urql cache key.
 */
export function teamIdsForScope(filters: MetricFilter): string[] | undefined {
    if (filters.scope.level !== "team") return undefined;
    const ids = [...new Set(filters.scope.ids)];
    return ids.length > 0 ? ids : undefined;
}
