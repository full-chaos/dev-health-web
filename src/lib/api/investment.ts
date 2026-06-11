import { resolveActiveOrgId } from "@/lib/impersonation";
import type {
    DrilldownResponse,
    InvestmentResponse,
    InvestmentMixExplanation,
    SankeyMode,
    SankeyResponse,
    WorkUnitInvestment,
    WorkUnitExplanation,
} from "@/lib/types";
import type { MetricFilter } from "@/lib/filters/types";
import { encodeFilterParam } from "@/lib/filters/encode";
import { applyWindowToFilters } from "@/lib/filters/time";
import { apiClient } from "@/lib/apiClient";
import {
    getInvestmentViaGraphQL,
    getInvestmentFlowViaGraphQL,
    getInvestmentRepoTeamFlowViaGraphQL,
} from "@/lib/graphql/investmentFetchers";
import { runtimeConfig } from "@/lib/runtimeConfig";
import { getAuth, normalizeFilters, postJson } from "./_shared";

export async function getInvestment(filters: MetricFilter) {
    const normalized = normalizeFilters(filters);

    // Feature flag: use GraphQL transport when enabled
    if (runtimeConfig.useGraphQLAnalytics()) {
        const auth = await getAuth();
        const session = await auth();
        const orgId = resolveActiveOrgId(session?.user);
        return getInvestmentViaGraphQL(normalized, orgId);
    }

    return postJson<InvestmentResponse>("/api/v1/investment", { filters: normalized }, 300, {
        f: encodeFilterParam(normalized),
    });
}

export async function explainInvestmentMix(params: {
    filters: MetricFilter;
    theme?: string | null;
    subcategory?: string | null;
    llm_provider?: string;
}) {
    const normalized = normalizeFilters(params.filters);
    return postJson<InvestmentMixExplanation>(
        "/api/v1/investment/explain",
        {
            filters: normalized,
            theme: params.theme ?? null,
            subcategory: params.subcategory ?? null,
        },
        0,
        {
            f: encodeFilterParam(normalized),
            llm_provider: params.llm_provider ?? "auto",
        },
    );
}

export async function getSankey(params: {
    mode: SankeyMode;
    filters: MetricFilter;
    context?: { entity_id?: string; entity_label?: string };
    window_start?: string;
    window_end?: string;
}) {
    const normalized = normalizeFilters(params.filters);
    const withWindow = applyWindowToFilters(normalized, params.window_start, params.window_end);
    return postJson<SankeyResponse>(
        "/api/v1/sankey",
        {
            mode: params.mode,
            filters: withWindow,
            context: params.context,
            window_start: params.window_start,
            window_end: params.window_end,
        },
        60,
        { mode: params.mode, f: encodeFilterParam(withWindow) },
    );
}

export async function getInvestmentFlow(params: {
    filters: MetricFilter;
    theme?: string | null;
    flow_mode?: "team_category_repo" | "team_subcategory_repo" | "team_category_subcategory_repo";
    drill_category?: string | null;
    top_n_repos?: number;
}) {
    const normalized = normalizeFilters(params.filters);

    // Feature flag: use GraphQL transport when enabled
    if (runtimeConfig.useGraphQLAnalytics()) {
        const auth = await getAuth();
        const session = await auth();
        const orgId = resolveActiveOrgId(session?.user);
        return getInvestmentFlowViaGraphQL({
            ...params,
            filters: normalized,
            contextOrgId: orgId,
        });
    }

    const response = await postJson<SankeyResponse>(
        "/api/v1/investment/flow",
        {
            filters: normalized,
            theme: params.theme ?? null,
            flow_mode: params.flow_mode ?? null,
            drill_category: params.drill_category ?? null,
            top_n_repos: params.top_n_repos,
        },
        60,
        { f: encodeFilterParam(normalized) },
    );

    // Clean labels (strip prefixes) to match frontend expectations
    // This mirrors the logic in adaptSankeyResult
    if (response && Array.isArray(response.nodes)) {
        response.nodes.forEach((node) => {
            if (node.name) {
                node.name = node.name.replace(/^(TEAM|REPO|THEME|SUBCATEGORY):\s*/i, "");
            }
        });
    }

    return response;
}

export async function getInvestmentRepoTeamFlow(params: {
    filters: MetricFilter;
    theme?: string | null;
}) {
    const normalized = normalizeFilters(params.filters);

    // Feature flag: use GraphQL transport when enabled
    if (runtimeConfig.useGraphQLAnalytics()) {
        const auth = await getAuth();
        const session = await auth();
        const orgId = resolveActiveOrgId(session?.user);
        return getInvestmentRepoTeamFlowViaGraphQL({
            ...params,
            filters: normalized,
            contextOrgId: orgId,
        });
    }

    return postJson<SankeyResponse>(
        "/api/v1/investment/flow/repo-team",
        { filters: normalized, theme: params.theme ?? null },
        60,
        { f: encodeFilterParam(normalized) },
    );
}

export async function getWorkUnits(params: {
    filters: MetricFilter;
    limit?: number;
    include_textual?: boolean;
}) {
    const normalized = normalizeFilters(params.filters);
    return postJson<WorkUnitInvestment[]>(
        "/api/v1/work-units",
        {
            filters: normalized,
            limit: params.limit,
            include_textual: params.include_textual,
        },
        30,
        {
            f: encodeFilterParam(normalized),
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
