import type {
  AggregatedFlameMode,
  AggregatedFlameResponse,
  DrilldownResponse,
  ExplainResponse,
  HealthResponse,
  HomeResponse,
  HeatmapResponse,
  InvestmentResponse,
  InvestmentMixExplanation,
  MetaResponse,
  OpportunitiesResponse,
  PeopleSearchResult,
  PersonDrilldownResponse,
  PersonMetricResponse,
  PersonSummary,
  SankeyMode,
  SankeyResponse,
  FlameResponse,
  QuadrantResponse,
  WorkUnitInvestment,
  WorkUnitExplanation,
} from "@/lib/types";
import type { MetricFilter } from "@/lib/filters/types";
import { AuthErrors } from "@/lib/constants/errors";
import { encodeFilterParam } from "@/lib/filters/encode";
import { applyWindowToFilters } from "@/lib/filters/time";
import { apiClient } from "@/lib/apiClient";
import {
  getInvestmentViaGraphQL,
  getInvestmentFlowViaGraphQL,
  getInvestmentRepoTeamFlowViaGraphQL,
} from "@/lib/graphql/investmentFetchers";
import { getCapacityForecastViaGraphQL } from "@/lib/graphql/capacityFetchers";
import type {
  CapacityForecast,
  CapacityForecastInput,
} from "@/lib/graphql/types";
import { runtimeConfig } from "@/lib/runtimeConfig";
// auth is imported dynamically inside server-only functions to avoid pulling
// @/lib/auth into the client bundle (it reads process.env.AUTH_SECRET which
// doesn't exist in the browser).
async function getAuth() {
  const { auth } = await import("@/lib/auth");
  return auth;
}

const normalizeFilters = (filters: MetricFilter): MetricFilter => {
  if (filters.scope.level === "team" && !filters.scope.ids.length) {
    return { ...filters, scope: { ...filters.scope, level: "org" } };
  }
  return filters;
};

const postJson = async <T>(
  path: string,
  body: unknown,
  revalidate = 60,
  params?: Record<string, string | number>
) => {
  return apiClient.postJson<T>(
    path,
    body,
    { next: { revalidate } },
    params
  );
};



export async function getHomeData(filters: MetricFilter) {
  const normalized = normalizeFilters(filters);
  return postJson<HomeResponse>(
    "/api/v1/home",
    { filters: normalized },
    60,
    { f: encodeFilterParam(normalized) }
  );
}

export async function getExplainData(params: {
  metric: string;
  filters: MetricFilter;
}) {
  const normalized = normalizeFilters(params.filters);
  return postJson<ExplainResponse>(
    "/api/v1/explain",
    { metric: params.metric, filters: normalized },
    60,
    { metric: params.metric, f: encodeFilterParam(normalized) }
  );
}

export async function getOpportunities(filters: MetricFilter) {
  const normalized = normalizeFilters(filters);
  return postJson<OpportunitiesResponse>(
    "/api/v1/opportunities",
    { filters: normalized },
    120,
    { f: encodeFilterParam(normalized) }
  );
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

  return postJson<InvestmentResponse>(
    "/api/v1/investment",
    { filters: normalized },
    300,
    { f: encodeFilterParam(normalized) }
  );
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
    }
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
  const withWindow = applyWindowToFilters(
    normalized,
    params.window_start,
    params.window_end
  );
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
    { mode: params.mode, f: encodeFilterParam(withWindow) }
  );
}

export async function getInvestmentFlow(params: {
  filters: MetricFilter;
  theme?: string | null;
  flow_mode?:
  | "team_category_repo"
  | "team_subcategory_repo"
  | "team_category_subcategory_repo";
  drill_category?: string | null;
  top_n_repos?: number;
}) {
  const normalized = normalizeFilters(params.filters);

  // Feature flag: use GraphQL transport when enabled
  if (runtimeConfig.useGraphQLAnalytics()) {
    const auth = await getAuth();
    const session = await auth();
    const orgId = session?.user?.org_id as string | undefined;
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
    { f: encodeFilterParam(normalized) }
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
    const orgId = session?.user?.org_id as string | undefined;
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
    { f: encodeFilterParam(normalized) }
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
    }
  );
}

export async function getDrilldown(
  path: "/api/v1/drilldown/prs" | "/api/v1/drilldown/issues",
  filters: MetricFilter,
  limit = 50
) {
  const normalized = normalizeFilters(filters);
  return postJson<DrilldownResponse>(
    path,
    { filters: normalized, limit },
    30
  );
}

export async function checkApiHealth() {
   try {
     const data = await apiClient.getJson<HealthResponse>(
       "/health",
       undefined,
       { cache: "no-store" }
     );
     return { ok: data.status === "ok", data };
   } catch {
     return { ok: false, data: null as HealthResponse | null };
   }
 }

export async function getApiMeta(): Promise<MetaResponse | null> {
   try {
     return await apiClient.getJson<MetaResponse>("/api/v1/meta", undefined, {
       cache: "no-store",
     });
   } catch {
     return null;
   }
 }

export async function searchPeople(query: string, limit = 20) {
  return apiClient.getJson<PeopleSearchResult[]>(
    "/api/v1/people",
    { q: query, limit },
    { cache: "no-store" }
  );
}

export async function getPersonSummary(params: {
  personId: string;
  range_days: number;
  compare_days: number;
}) {
  return apiClient.getJson<PersonSummary>(
    `/api/v1/people/${params.personId}/summary`,
    {
      range_days: params.range_days,
      compare_days: params.compare_days,
    },
    { cache: "no-store" }
  );
}

export async function getPersonMetric(params: {
  personId: string;
  metric: string;
  range_days: number;
  compare_days: number;
}) {
  return apiClient.getJson<PersonMetricResponse>(
    `/api/v1/people/${params.personId}/metric`,
    {
      metric: params.metric,
      range_days: params.range_days,
      compare_days: params.compare_days,
    },
    { cache: "no-store" }
  );
}

export async function getPersonDrilldown(params: {
  personId: string;
  type: "prs" | "issues";
  limit?: number;
  cursor?: string;
  metric?: string;
  range_days?: number;
  compare_days?: number;
}) {
  return apiClient.getJson<PersonDrilldownResponse>(
    `/api/v1/people/${params.personId}/drilldown/${params.type}`,
    {
      limit: params.limit ?? 50,
      cursor: params.cursor ?? "",
      metric: params.metric ?? "",
      range_days: params.range_days ?? "",
      compare_days: params.compare_days ?? "",
    },
    { cache: "no-store" }
  );
}

export async function getHeatmap(params: {
  type: "temporal_load" | "context_switch" | "risk" | "individual";
  metric: string;
  scope_type: "org" | "team" | "repo" | "person" | "developer" | string;
  scope_id?: string;
  range_days: number;
  start_date?: string;
  end_date?: string;
  x?: string;
  y?: string;
  limit?: number;
}) {
  const normalizedScopeType =
    params.scope_type === "developer" ? "person" : params.scope_type;
  const candidates =
    normalizedScopeType === "person"
      ? ["person", "developer"]
      : [normalizedScopeType];

  return apiClient.fetchWithFallback<HeatmapResponse, string>(
    "/api/v1/heatmap",
    { cache: "no-store" },
    (scopeType) => ({
      type: params.type,
      metric: params.metric,
      scope_type: scopeType,
      scope_id: params.scope_id ?? "",
      range_days: params.range_days,
      start_date: params.start_date ?? "",
      end_date: params.end_date ?? "",
      x: params.x ?? "",
      y: params.y ?? "",
      limit: params.limit ?? 50,
    }),
    candidates
  );
}

export async function getFlame(params: {
  entity_type: "issue" | "pr" | "deployment";
  entity_id: string;
}) {
  return apiClient.getJson<FlameResponse>(
    "/api/v1/flame",
    {
      entity_type: params.entity_type,
      entity_id: params.entity_id,
    },
    { cache: "no-store" }
  );
}

export async function getAggregatedFlame(params: {
  mode: AggregatedFlameMode;
  range_days?: number;
  start_date?: string;
  end_date?: string;
  team_id?: string;
  repo_id?: string;
  limit?: number;
  min_value?: number;
}) {
  return apiClient.getJson<AggregatedFlameResponse>(
    "/api/v1/flame/aggregated",
    {
      mode: params.mode,
      range_days: params.range_days ?? 30,
      start_date: params.start_date ?? "",
      end_date: params.end_date ?? "",
      team_id: params.team_id ?? "",
      repo_id: params.repo_id ?? "",
      limit: params.limit ?? 500,
      min_value: params.min_value ?? 1,
    },
    { cache: "no-store" }
  );
}

export async function getQuadrant(params: {
  type:
  | "churn_throughput"
  | "cycle_throughput"
  | "wip_throughput"
  | "review_load_latency";
  scope_type: "org" | "team" | "repo" | "developer" | "person";
  scope_id?: string;
  range_days: number;
  bucket: "week" | "month";
  start_date?: string;
  end_date?: string;
}) {
  const normalizedScopeType =
    params.scope_type === "developer" ? "person" : params.scope_type;
  const candidates =
    normalizedScopeType === "person"
      ? ["person", "developer"]
      : !params.scope_id && normalizedScopeType === "team"
        ? ["team", "org"]
        : !params.scope_id && normalizedScopeType === "repo"
          ? ["repo", "org"]
          : [normalizedScopeType];

  return apiClient.fetchWithFallback<QuadrantResponse, string>(
    "/api/v1/quadrant",
    { cache: "no-store" },
    (scopeType) => ({
      type: params.type,
      scope_type: scopeType,
      scope_id: params.scope_id ?? "",
      range_days: params.range_days,
      start_date: params.start_date ?? "",
      end_date: params.end_date ?? "",
      bucket: params.bucket,
    }),
    candidates
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
    }
  );
}

export async function getCapacityForecast(params: {
  orgId?: string;
  input?: CapacityForecastInput;
}): Promise<CapacityForecast | null> {
  let orgId = params.orgId;
  if (!orgId) {
    const auth = await getAuth();
    const session = await auth();
    orgId = session?.user?.org_id;
  }
  if (!orgId) {
    throw new Error(AuthErrors.OrgIdRequiredFromSession);
  }
  return getCapacityForecastViaGraphQL(orgId, params.input);
}
