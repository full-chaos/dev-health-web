import type { MetricFilter } from "@/lib/filters/types";

/**
 * The evidence reference of a Home thread: the API path plus the page's scope and window.
 * Without `thread` it is the reference of the page as a whole (the "View evidence" header action).
 *
 * No "use client": the Home server page and the client thread rows build the same reference.
 */
export const buildThreadApiUrl = (path: string, filters: MetricFilter, thread?: string) => {
    const params = new URLSearchParams({
        scope_type: filters.scope.level,
        range_days: String(filters.time.range_days),
        compare_days: String(filters.time.compare_days),
    });
    if (thread) params.set("thread", thread);

    const [scopeId] = filters.scope.ids;
    if (scopeId) params.set("scope_id", scopeId);
    if (filters.time.start_date) params.set("start_date", filters.time.start_date);
    if (filters.time.end_date) params.set("end_date", filters.time.end_date);

    return `${path}?${params.toString()}`;
};
