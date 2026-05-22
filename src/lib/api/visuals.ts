import type {
  AggregatedFlameMode,
  AggregatedFlameResponse,
  HeatmapResponse,
  FlameResponse,
  QuadrantResponse,
} from "@/lib/types";
import { apiClient } from "@/lib/apiClient";

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
  const normalizedScopeType = params.scope_type === "developer" ? "person" : params.scope_type;
  const candidates =
    normalizedScopeType === "person" ? ["person", "developer"] : [normalizedScopeType];

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
    candidates,
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
    { cache: "no-store" },
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
    { cache: "no-store" },
  );
}

export async function getQuadrant(params: {
  type: "churn_throughput" | "cycle_throughput" | "wip_throughput" | "review_load_latency";
  scope_type: "org" | "team" | "repo" | "developer" | "person";
  scope_id?: string;
  range_days: number;
  bucket: "week" | "month";
  start_date?: string;
  end_date?: string;
}) {
  const normalizedScopeType = params.scope_type === "developer" ? "person" : params.scope_type;
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
    candidates,
  );
}
