import type { MetricFilter } from "@/lib/filters/types";
import { apiClient } from "@/lib/apiClient";
import { readServerSession } from "#server-session";

// The session read goes through `#server-session`: a server module graph gets the real read, every
// other graph gets a variant with no import of the auth module (it is server-only).
export async function getAuth() {
    return readServerSession;
}

export const normalizeFilters = (filters: MetricFilter): MetricFilter => {
    if (filters.scope.level === "team" && !filters.scope.ids.length) {
        return { ...filters, scope: { ...filters.scope, level: "org" } };
    }
    return filters;
};

export const postJson = async <T>(
    path: string,
    body: unknown,
    revalidate = 60,
    params?: Record<string, string | number>,
) => {
    // Every caller posts filters to a query endpoint (home, explain, investment, work units):
    // a read, so it gets the read deadline (CHAOS-9114).
    return apiClient.postJson<T>(path, body, { next: { revalidate }, deadline: "read" }, params);
};
