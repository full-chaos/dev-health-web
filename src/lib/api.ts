import type {
  DrilldownResponse,
  ExplainResponse,
  HealthResponse,
  HomeResponse,
  InvestmentResponse,
  OpportunitiesResponse,
} from "@/lib/types";
import type { MetricFilter } from "@/lib/filters/types";

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

const postJson = async <T>(path: string, body: unknown, revalidate = 60) => {
  const url = buildUrl(path);
  return fetchJson<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    next: { revalidate },
  });
};

export async function getHomeData(filters: MetricFilter) {
  return postJson<HomeResponse>("/api/v1/home", { filters }, 60);
}

export async function getExplainData(params: {
  metric: string;
  filters: MetricFilter;
}) {
  return postJson<ExplainResponse>(
    "/api/v1/explain",
    { metric: params.metric, filters: params.filters },
    60
  );
}

export async function getOpportunities(filters: MetricFilter) {
  return postJson<OpportunitiesResponse>(
    "/api/v1/opportunities",
    { filters },
    120
  );
}

export async function getInvestment(filters: MetricFilter) {
  return postJson<InvestmentResponse>(
    "/api/v1/investment",
    { filters },
    300
  );
}

export async function getDrilldown(
  path: "/api/v1/drilldown/prs" | "/api/v1/drilldown/issues",
  filters: MetricFilter,
  limit = 50
) {
  return postJson<DrilldownResponse>(path, { filters, limit }, 30);
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
