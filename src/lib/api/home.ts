import { cache } from "react";
import type { ExplainResponse, HomeResponse, OpportunitiesResponse } from "@/lib/types";
import type { MetricFilter } from "@/lib/filters/types";
import { encodeFilterParam } from "@/lib/filters/encode";
import { normalizeFilters, postJson } from "./_shared";

/**
 * Per-request memoized home data fetch. React.cache() deduplicates calls
 * within a single RSC render tree so the Work/page and getDiagnoseSignals
 * resolver share one POST instead of issuing two identical requests per render.
 */
export const getHomeData = cache(async function getHomeData(filters: MetricFilter) {
    const normalized = normalizeFilters(filters);
    return postJson<HomeResponse>("/api/v1/home", { filters: normalized }, 60, {
        f: encodeFilterParam(normalized),
    });
});

export async function getExplainData(params: { metric: string; filters: MetricFilter }) {
    const normalized = normalizeFilters(params.filters);
    return postJson<ExplainResponse>(
        "/api/v1/explain",
        { metric: params.metric, filters: normalized },
        60,
        { metric: params.metric, f: encodeFilterParam(normalized) },
    );
}

export async function getOpportunities(filters: MetricFilter) {
    const normalized = normalizeFilters(filters);
    return postJson<OpportunitiesResponse>("/api/v1/opportunities", { filters: normalized }, 120, {
        f: encodeFilterParam(normalized),
    });
}
