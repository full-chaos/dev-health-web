import type {
  AggregatedFlameMode,
  AggregatedFlameResponse,
  DrilldownResponse,
  ExplainResponse,
  HealthResponse,
  HomeResponse,
  HeatmapResponse,
  InvestmentResponse,
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
  WorkUnitSignal,
} from "@/lib/types";
import type { MetricFilter } from "@/lib/filters/types";
import { encodeFilterParam } from "@/lib/filters/encode";
import { applyWindowToFilters } from "@/lib/filters/time";
import { apiClient } from "@/lib/apiClient";

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
  return postJson<InvestmentResponse>(
    "/api/v1/investment",
    { filters: normalized },
    300,
    { f: encodeFilterParam(normalized) }
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

export async function getWorkUnits(params: {
  filters: MetricFilter;
  limit?: number;
  include_textual?: boolean;
}) {
  const normalized = normalizeFilters(params.filters);
  return postJson<WorkUnitSignal[]>(
    "/api/v1/work-units",
    {
      filters: normalized,
      limit: params.limit,
      include_textual: params.include_textual,
    },
    30,
    {
      f: encodeFilterParam(normalized),
      include_textual: params.include_textual,
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
  if (process.env.DEV_HEALTH_TEST_MODE === "true") {
    return {
      ok: true,
      data: { status: "ok", services: { api: "mock" } } as HealthResponse,
    };
  }
  try {
    const data = await apiClient.getJson<HealthResponse>(
      "/api/v1/health",
      undefined,
      { cache: "no-store" }
    );
    return { ok: data.status === "ok", data };
  } catch {
    return { ok: false, data: null as HealthResponse | null };
  }
}

export async function getApiMeta(): Promise<MetaResponse | null> {
  if (process.env.DEV_HEALTH_TEST_MODE === "true") {
    return {
      backend: "sqlite",
      version: "test",
      last_ingest_at: new Date().toISOString(),
      coverage: { repos: 10 },
      limits: { drilldown_max: 200 },
      supported_endpoints: ["/api/v1/home", "/api/v1/meta"],
    };
  }
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

  let lastError: unknown;
  for (const scopeType of candidates) {
    const response = await apiClient.request(
      "/api/v1/heatmap",
      { cache: "no-store" },
      {
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
      }
    );
    if (response.ok) {
      return (await response.json()) as HeatmapResponse;
    }
    lastError = response;
    if (candidates.length === 1) {
      break;
    }
    if (response.status !== 400 && response.status !== 404 && response.status !== 422) {
      break;
    }
  }
  if (lastError instanceof Response) {
    throw new Error(`API error: ${lastError.status}`);
  }
  throw lastError ?? new Error("API error");
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

  let lastError: unknown;
  for (const scopeType of candidates) {
    const response = await apiClient.request(
      "/api/v1/quadrant",
      { cache: "no-store" },
      {
        type: params.type,
        scope_type: scopeType,
        scope_id: params.scope_id ?? "",
        range_days: params.range_days,
        start_date: params.start_date ?? "",
        end_date: params.end_date ?? "",
        bucket: params.bucket,
      }
    );
    if (response.ok) {
      return (await response.json()) as QuadrantResponse;
    }
    lastError = response;
    if (candidates.length === 1) {
      break;
    }
    if (response.status !== 400 && response.status !== 404 && response.status !== 422) {
      break;
    }
  }
  if (lastError instanceof Response) {
    throw new Error(`API error: ${lastError.status}`);
  }
  throw lastError ?? new Error("API error");
}
