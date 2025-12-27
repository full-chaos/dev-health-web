import type {
  ExplainResponse,
  HealthResponse,
  HomeResponse,
  InvestmentResponse,
  OpportunitiesResponse,
} from "@/lib/types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";

const buildUrl = (path: string, params?: Record<string, string | number>) => {
  const url = new URL(path, API_BASE);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === "" || value === undefined || value === null) {
        return;
      }
      url.searchParams.set(key, String(value));
    });
  }
  return url.toString();
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return (await response.json()) as T;
}

export async function getHomeData(params: {
  scopeType?: string;
  scopeId?: string;
  rangeDays?: number;
  compareDays?: number;
}) {
  const url = buildUrl("/api/v1/home", {
    scope_type: params.scopeType ?? "org",
    scope_id: params.scopeId ?? "",
    range_days: params.rangeDays ?? 14,
    compare_days: params.compareDays ?? 14,
  });
  return fetchJson<HomeResponse>(url, { next: { revalidate: 60 } });
}

export async function getExplainData(params: {
  metric: string;
  scopeType?: string;
  scopeId?: string;
  rangeDays?: number;
  compareDays?: number;
}) {
  const url = buildUrl("/api/v1/explain", {
    metric: params.metric,
    scope_type: params.scopeType ?? "org",
    scope_id: params.scopeId ?? "",
    range_days: params.rangeDays ?? 14,
    compare_days: params.compareDays ?? 14,
  });
  return fetchJson<ExplainResponse>(url, { next: { revalidate: 60 } });
}

export async function getOpportunities(params: {
  scopeType?: string;
  scopeId?: string;
  rangeDays?: number;
  compareDays?: number;
}) {
  const url = buildUrl("/api/v1/opportunities", {
    scope_type: params.scopeType ?? "org",
    scope_id: params.scopeId ?? "",
    range_days: params.rangeDays ?? 14,
    compare_days: params.compareDays ?? 14,
  });
  return fetchJson<OpportunitiesResponse>(url, { next: { revalidate: 120 } });
}

export async function getInvestment(params: {
  scopeType?: string;
  scopeId?: string;
  rangeDays?: number;
}) {
  const url = buildUrl("/api/v1/investment", {
    scope_type: params.scopeType ?? "org",
    scope_id: params.scopeId ?? "",
    range_days: params.rangeDays ?? 30,
  });
  return fetchJson<InvestmentResponse>(url, { next: { revalidate: 300 } });
}

export async function checkApiHealth() {
  const url = buildUrl("/api/v1/health");
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      return { ok: false, data: null as HealthResponse | null };
    }
    const data = (await response.json()) as HealthResponse;
    return { ok: data.status === "ok", data };
  } catch {
    return { ok: false, data: null as HealthResponse | null };
  }
}
