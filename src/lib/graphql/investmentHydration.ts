/**
 * RSC → client hydration fetchers for the Investment view (CHAOS-1276 Phase C).
 *
 * Mirrors the variable-building logic of `useInvestmentMix` in
 * `./hooks/useInvestment.ts` so the server-issued urql operation has the same
 * cache key as the client-issued one. Any drift here silently breaks
 * hydration — keep the two in sync.
 */

import type { SSRData } from "@urql/core";
import type { MetricFilter } from "@/lib/filters/types";
import type { InvestmentResponse } from "@/lib/types";
import { INVESTMENT_BREAKDOWN_QUERY } from "./queries";
import { graphqlFetchForHydration } from "./server";
import type {
    AnalyticsQueryResponse,
    AnalyticsRequestInput,
    DimensionInput,
    FilterInput,
    MeasureInput,
    ScopeLevelInput,
} from "./types";

function buildDateRange(filters: MetricFilter): {
    startDate: string;
    endDate: string;
} {
    const { start_date, end_date, range_days } = filters.time;
    if (start_date && end_date) {
        return { startDate: start_date, endDate: end_date };
    }
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - range_days * 24 * 60 * 60 * 1000);
    return {
        startDate: startDate.toISOString().split("T")[0],
        endDate: endDate.toISOString().split("T")[0],
    };
}

function translateFilters(filters: MetricFilter): FilterInput {
    return {
        scope: {
            level: filters.scope.level.toUpperCase() as ScopeLevelInput,
            ids: filters.scope.ids,
        },
        who: filters.who.developers?.length ? { developers: filters.who.developers } : undefined,
        what: filters.what.repos?.length ? { repos: filters.what.repos } : undefined,
        why:
            filters.why.work_category?.length || filters.why.issue_type?.length
                ? {
                      workCategory: filters.why.work_category,
                      issueType: filters.why.issue_type,
                  }
                : undefined,
        how: filters.how.flow_stage?.length ? { flowStage: filters.how.flow_stage } : undefined,
    };
}

/**
 * Build the exact variables used by `useInvestmentMix`'s client-side query.
 *
 * Exported so tests can assert parity against the client hook without
 * reimplementing the shape; keep the two in sync.
 */
export function buildInvestmentMixVariables(
    filters: MetricFilter,
    orgId: string,
): { orgId: string; batch: AnalyticsRequestInput } {
    const dateRange = buildDateRange(filters);
    const batch: AnalyticsRequestInput = {
        breakdowns: [
            {
                dimension: "THEME" as DimensionInput,
                measure: "COUNT" as MeasureInput,
                dateRange,
                topN: 50,
            },
            {
                dimension: "SUBCATEGORY" as DimensionInput,
                measure: "COUNT" as MeasureInput,
                dateRange,
                topN: 100,
            },
        ],
        useInvestment: true,
        filters: translateFilters(filters),
    };
    return { orgId, batch };
}

function adaptBreakdown(response: AnalyticsQueryResponse): InvestmentResponse {
    const themeBreakdown = response.analytics.breakdowns.find(
        (b) => b.dimension.toLowerCase() === "theme",
    );
    const subcategoryBreakdown = response.analytics.breakdowns.find(
        (b) => b.dimension.toLowerCase() === "subcategory",
    );

    const theme_distribution: Record<string, number> = {};
    const subcategory_distribution: Record<string, number> = {};

    if (themeBreakdown) {
        for (const item of themeBreakdown.items) {
            theme_distribution[item.key] = item.value;
        }
    }
    if (subcategoryBreakdown) {
        for (const item of subcategoryBreakdown.items) {
            subcategory_distribution[item.key] = item.value;
        }
    }

    return {
        theme_distribution,
        subcategory_distribution,
        unit: "delivery_units",
        evidence_quality_distribution:
            (response.analytics.evidenceQualityDistribution as
                Record<string, number> | undefined) ?? undefined,
        evidence_quality_stats: response.analytics.evidenceQualityStats
            ? {
                  mean: response.analytics.evidenceQualityStats.mean ?? null,
                  stddev: response.analytics.evidenceQualityStats.stddev ?? null,
                  band_counts:
                      (response.analytics.evidenceQualityStats.bandCounts as Record<
                          string,
                          number
                      >) ?? {},
                  quality_drivers: [],
              }
            : undefined,
    };
}

/**
 * Server-side investment mix fetch that returns both the adapted REST-shape
 * data (for page-level summary calculations) AND the urql `SSRData` payload
 * keyed to the client hook's cache entry. Pair with `<HydrateUrqlResults>`
 * on a client boundary to eliminate the RSC → client double-fetch.
 */
export async function getInvestmentMixForHydration(
    filters: MetricFilter,
    orgId: string,
): Promise<{ data: InvestmentResponse; hydrationPayload: SSRData }> {
    const variables = buildInvestmentMixVariables(filters, orgId);
    const { data, hydrationPayload } = await graphqlFetchForHydration<AnalyticsQueryResponse>(
        INVESTMENT_BREAKDOWN_QUERY,
        variables,
        { orgId },
    );
    return { data: adaptBreakdown(data), hydrationPayload };
}
