import type {
    BlockedWorkIssuesResponse,
    DrilldownResponse,
    InvestmentResponse,
    InvestmentMixExplanation,
    WorkUnitInvestment,
    WorkUnitExplanation,
} from "@/lib/types";
import type { MetricFilter } from "@/lib/filters/types";
import { encodeFilterParam } from "@/lib/filters/encode";
import { apiClient } from "@/lib/apiClient";
import { buildDateRange, getInvestmentViaGraphQL } from "@/lib/graphql/investmentFetchers";
import { runtimeConfig } from "@/lib/runtimeConfig";
import { getAuth, normalizeFilters, postJson } from "./_shared";

// The REST investment readers name their window: the one investment range (ends yesterday, UTC), never the
// server's own default and never today. The named range also keys the cache, so a day change is a new key.
function withInvestmentWindow(
    filters: MetricFilter,
    dateRange: { startDate: string; endDate: string } = buildDateRange(filters),
): MetricFilter {
    return {
        ...filters,
        time: { ...filters.time, start_date: dateRange.startDate, end_date: dateRange.endDate },
    };
}

export async function getInvestment(filters: MetricFilter) {
    const normalized = normalizeFilters(filters);

    // Feature flag: use GraphQL transport when enabled
    if (runtimeConfig.useGraphQLAnalytics()) {
        const auth = await getAuth();
        const session = await auth();
        const orgId = session?.user?.org_id as string | undefined;
        return getInvestmentViaGraphQL(normalized, orgId);
    }

    const windowed = withInvestmentWindow(normalized);
    return postJson<InvestmentResponse>("/api/v1/investment", { filters: windowed }, 300, {
        f: encodeFilterParam(windowed),
    });
}

export async function explainInvestmentMix(params: {
    filters: MetricFilter;
    theme?: string | null;
    subcategory?: string | null;
    llm_provider?: string;
    dateRange?: { startDate: string; endDate: string };
}) {
    const normalized = normalizeFilters(params.filters);
    // The window of the mix on screen, named by the caller that reads it: the explanation's shares are the mix's
    // shares only over the same range. Without one the server derives its own window.
    const chartWindow = params.dateRange ?? null;
    return postJson<InvestmentMixExplanation>(
        "/api/v1/investment/explain",
        {
            filters: normalized,
            theme: params.theme ?? null,
            subcategory: params.subcategory ?? null,
            measure: "ISSUE_SIZE",
            ...(chartWindow
                ? {
                      date_range: {
                          start_date: chartWindow.startDate,
                          end_date: chartWindow.endDate,
                      },
                  }
                : {}),
        },
        0,
        {
            f: encodeFilterParam(normalized),
            llm_provider: params.llm_provider ?? "auto",
        },
    );
}

export async function getWorkUnits(params: {
    filters: MetricFilter;
    limit?: number;
    include_textual?: boolean;
    dateRange?: { startDate: string; endDate: string };
}) {
    const normalized = normalizeFilters(params.filters);
    const windowed = withInvestmentWindow(normalized, params.dateRange);
    return postJson<WorkUnitInvestment[]>(
        "/api/v1/work-units",
        {
            filters: windowed,
            limit: params.limit,
            include_textual: params.include_textual,
        },
        30,
        {
            f: encodeFilterParam(windowed),
            include_textual: params.include_textual ? "true" : "false",
        },
    );
}

export async function getDrilldown(
    path: "/api/v1/drilldown/prs" | "/api/v1/drilldown/issues",
    filters: MetricFilter,
    limit = 50,
) {
    const normalized = normalizeFilters(filters);
    return postJson<DrilldownResponse>(path, { filters: normalized, limit }, 30);
}

/**
 * Read the persisted blocked-work items. `blocked` deliberately exists only
 * in this POST body: the shared MetricFilter and its URL encoding must not
 * carry this endpoint-specific selector.
 */
export async function getBlockedWorkIssues(filters: MetricFilter, limit = 50) {
    const normalized = normalizeFilters(filters);
    const blockedFilters = {
        ...normalized,
        how: { ...normalized.how, blocked: true as const },
    };
    return postJson<BlockedWorkIssuesResponse>(
        "/api/v1/drilldown/issues",
        { filters: blockedFilters, limit },
        30,
    );
}

export async function getWorkUnitExplanation(params: {
    workUnitId: string;
    filters: MetricFilter;
    llmProvider?: string;
}) {
    const normalized = normalizeFilters(params.filters);
    return apiClient.postJson<WorkUnitExplanation>(
        `/api/v1/work-units/${params.workUnitId}/explain`,
        {},
        { next: { revalidate: 60 } },
        {
            scope_type: normalized.scope.level,
            scope_id: normalized.scope.ids[0] ?? "",
            range_days: normalized.time.range_days,
            llm_provider: params.llmProvider ?? "auto",
        },
    );
}
