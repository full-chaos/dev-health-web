import { cache } from "react";
import type { ExplainResponse, HomeResponse, OpportunitiesResponse } from "@/lib/types";
import type { MetricFilter } from "@/lib/filters/types";
import { encodeFilterParam } from "@/lib/filters/encode";
import { explainAnswerIsForOtherMetric, isExplainClientError } from "@/lib/metrics/explainAnswer";
import { normalizeFilters, postJson } from "./_shared";

/**
 * Per-request memoized home data fetch. React.cache() deduplicates calls
 * within a single RSC render tree so the Work/page and getDiagnoseSignals
 * resolver share one POST instead of issuing two identical requests per render.
 */
export const getHomeData = cache(async function getHomeData(filters: MetricFilter) {
    const normalized = normalizeFilters(filters);
    return postJson<HomeResponse>("/api/v1/home", { filters: normalized }, 0, {
        f: encodeFilterParam(normalized),
    });
});

/**
 * The explain answer for `params.metric`, or `null` when there is none to draw (CHAOS-9137):
 * the answer is for another metric (see `explainAnswerIsForOtherMetric`), or the route refused
 * the metric with a client error (400/404/422). Every caller already draws its "no explain
 * data" state for `null`; any other failure still throws.
 */
export async function getExplainData(params: {
    metric: string;
    filters: MetricFilter;
}): Promise<ExplainResponse | null> {
    const normalized = normalizeFilters(params.filters);
    let answer: ExplainResponse;
    try {
        answer = await postJson<ExplainResponse>(
            "/api/v1/explain",
            { metric: params.metric, filters: normalized },
            60,
            { metric: params.metric, f: encodeFilterParam(normalized) },
        );
    } catch (err) {
        if (isExplainClientError(err)) return null;
        throw err;
    }
    return explainAnswerIsForOtherMetric(params.metric, answer) ? null : answer;
}

/**
 * Per-request memoized opportunities fetch. React.cache() deduplicates calls
 * within a single RSC render tree so the /opportunities page and the Improve
 * area-signal resolver (getImproveSignals) share ONE POST instead of issuing two
 * identical requests per render — and read from the same list/count snapshot.
 * Safe to memoize: getOpportunities is only ever called server-side (RSC).
 */
export const getOpportunities = cache(async function getOpportunities(filters: MetricFilter) {
    const normalized = normalizeFilters(filters);
    return postJson<OpportunitiesResponse>("/api/v1/opportunities", { filters: normalized }, 120, {
        f: encodeFilterParam(normalized),
    });
});
