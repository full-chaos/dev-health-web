import type { MetricFilter } from "@/lib/filters/types";
import { apiClient } from "@/lib/apiClient";

// auth is imported dynamically inside server-only functions to avoid pulling
// @/lib/auth into the client bundle (it reads process.env.AUTH_SECRET which
// doesn't exist in the browser).
export async function getAuth() {
    const { auth } = await import("@/lib/auth");
    return auth;
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
    // a read, so it gets the read deadline (CHAOS-9103).
    return apiClient.postJson<T>(path, body, { next: { revalidate }, deadline: "read" }, params);
};
