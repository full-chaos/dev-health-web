import Link from "next/link";

import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { FilterBar } from "@/components/filters/FilterBar";
import { checkApiHealth, getDrilldown, getExplainData, getHomeData } from "@/lib/api";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { formatDelta, formatMetricValue } from "@/lib/formatters";

const FILTERS = {
  Who: ["Org", "Team", "Repo"],
  What: ["Cycle Time", "Review Latency", "Throughput"],
  Why: ["WIP", "Churn", "Quality"],
  How: ["Deploys", "Incidents", "Coverage"],
};

type ExplorePageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Explore({ searchParams }: ExplorePageProps) {
  const health = await checkApiHealth();
  if (!health.ok) {
    return <ServiceUnavailable />;
  }

  const params = (await searchParams) ?? {};
  const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
  const filters = encodedFilter
    ? decodeFilter(encodedFilter)
    : filterFromQueryParams(params);

  const metric = (params.metric as string) ?? "cycle_time";
  const apiParam = (Array.isArray(params.api) ? params.api[0] : params.api) ?? "";
  const apiUrl = apiParam
    ? new URL(apiParam, "http://localhost")
    : new URL("/api/v1/explain", "http://localhost");
  const endpoint = apiUrl.pathname || "/api/v1/explain";
  const metricFromApi = apiUrl.searchParams.get("metric") ?? metric;
  const endpointLabel = apiParam || `/api/v1/explain?metric=${metricFromApi}`;

  let view: "explain" | "drilldown" | "home" | "unknown" = "explain";
  let data: Awaited<ReturnType<typeof getExplainData>> | null = null;
  let drilldown: Awaited<ReturnType<typeof getDrilldown>> | null = null;
  let home: Awaited<ReturnType<typeof getHomeData>> | null = null;

  if (endpoint === "/api/v1/drilldown/prs" || endpoint === "/api/v1/drilldown/issues") {
    view = "drilldown";
    drilldown = await getDrilldown(endpoint as "/api/v1/drilldown/prs" | "/api/v1/drilldown/issues", filters).catch(() => null);
  } else if (endpoint === "/api/v1/home") {
    view = "home";
    home = await getHomeData(filters).catch(() => null);
  } else if (endpoint === "/api/v1/explain") {
    view = "explain";
    data = await getExplainData({ metric: metricFromApi, filters }).catch(() => null);
  } else {
    view = "unknown";
  }

  const payload =
    view === "explain"
      ? { metric: metricFromApi, filters }
      : { filters };
  const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000";
  const curl = `curl -X POST \"${apiBase}${endpoint}\" -H \"Content-Type: application/json\" -d '${JSON.stringify(payload)}'`;

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 pb-16 pt-12">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
              Explorer
            </p>
            <h1 className="mt-2 font-[var(--font-display)] text-3xl">
              {data?.label ?? (view === "drilldown" ? "Drilldown" : "Explore")}
            </h1>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">
              Drivers, contributors, and evidence links.
            </p>
          </div>
          <Link
            href={withFilterParam("/", filters)}
            className="rounded-full border border-[var(--card-stroke)] px-4 py-2 text-xs uppercase tracking-[0.2em]"
          >
            Back to Home
          </Link>
        </header>

        <FilterBar condensed />

        <section className="rounded-3xl border border-[var(--card-stroke)] bg-white/80 p-5 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                Endpoint
              </p>
              <p className="mt-1 text-sm font-semibold">{endpointLabel}</p>
            </div>
            <div className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
              {view.toUpperCase()}
            </div>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                Payload
              </p>
              <pre className="mt-2 max-h-48 overflow-auto rounded-2xl border border-[var(--card-stroke)] bg-[var(--card)] px-4 py-3 text-xs text-[var(--ink-muted)]">
                {JSON.stringify(payload, null, 2)}
              </pre>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                Curl
              </p>
              <pre className="mt-2 max-h-48 overflow-auto rounded-2xl border border-[var(--card-stroke)] bg-[var(--card)] px-4 py-3 text-xs text-[var(--ink-muted)]">
                {curl}
              </pre>
              <p className="mt-3 text-xs text-[var(--ink-muted)]">
                Freshness: {home?.freshness?.last_ingested_at ?? "Not provided"}
              </p>
              <p className="text-xs text-[var(--ink-muted)]">
                Coverage: {home?.freshness?.coverage?.repos_covered_pct ?? "Not provided"}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[0.28fr_0.72fr]">
          <aside className="space-y-4 rounded-3xl border border-[var(--card-stroke)] bg-[var(--card)] p-5">
            {Object.entries(FILTERS).map(([label, items]) => (
              <div key={label}>
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                  {label}
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {items.map((item) => (
                    <span
                      key={item}
                      className="rounded-full border border-[var(--card-stroke)] bg-white/60 px-3 py-1"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </aside>

          <div className="space-y-6">
            <div className="rounded-3xl border border-[var(--card-stroke)] bg-white/80 p-6">
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                Current Window
              </p>
              <div className="mt-3 flex flex-wrap items-baseline gap-3">
                <span className="text-3xl font-semibold">
                  {data ? formatMetricValue(data.value, data.unit) : "--"}
                </span>
                <span className="text-sm text-[var(--ink-muted)]">
                  {data ? formatDelta(data.delta_pct) : "--"} vs previous window
                </span>
              </div>
            </div>

            {view === "explain" && (
              <div className="grid gap-6 md:grid-cols-2">
                <div className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card)] p-5">
                  <h2 className="font-[var(--font-display)] text-xl">Top Drivers</h2>
                  <div className="mt-3 space-y-3 text-sm">
                    {(data?.drivers ?? []).map((driver) => (
                      <Link
                        key={driver.id}
                        href={buildExploreUrl({ api: driver.evidence_link, filters })}
                        className="flex items-center justify-between rounded-2xl border border-[var(--card-stroke)] bg-white/70 px-4 py-3"
                      >
                        <span>{driver.label}</span>
                        <span className="text-xs text-[var(--ink-muted)]">
                          {formatDelta(driver.delta_pct)}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card)] p-5">
                  <h2 className="font-[var(--font-display)] text-xl">Contributors</h2>
                  <div className="mt-3 space-y-3 text-sm">
                    {(data?.contributors ?? []).map((contributor) => (
                      <Link
                        key={contributor.id}
                        href={buildExploreUrl({ api: contributor.evidence_link, filters })}
                        className="flex items-center justify-between rounded-2xl border border-[var(--card-stroke)] bg-white/70 px-4 py-3"
                      >
                        <span>{contributor.label}</span>
                        <span className="text-xs text-[var(--ink-muted)]">
                          {data ? formatMetricValue(contributor.value, data.unit) : "--"}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {view === "drilldown" && (
              <div className="rounded-3xl border border-[var(--card-stroke)] bg-white/80 p-5">
                <h2 className="font-[var(--font-display)] text-xl">Drilldown</h2>
                <div className="mt-4 overflow-auto text-xs">
                  <table className="min-w-full border-collapse">
                    <thead className="text-left text-[var(--ink-muted)]">
                      <tr>
                        <th className="border-b border-[var(--card-stroke)] pb-2">Item</th>
                        <th className="border-b border-[var(--card-stroke)] pb-2">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(drilldown?.items ?? []).map((item, idx) => (
                        <tr key={`item-${idx}`} className="border-b border-[var(--card-stroke)]">
                          <td className="py-2 pr-4 font-medium">{item.title ?? item.work_item_id ?? item.number ?? `#${idx + 1}`}</td>
                          <td className="py-2 text-[var(--ink-muted)]">{JSON.stringify(item)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="rounded-3xl border border-[var(--card-stroke)] bg-white/80 p-5">
              <h2 className="font-[var(--font-display)] text-xl">Evidence Links</h2>
              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                {Object.entries(data?.drilldown_links ?? {}).map(([label, link]) => (
                  <Link
                    key={label}
                    href={buildExploreUrl({ api: link, filters })}
                    className="rounded-full border border-[var(--card-stroke)] bg-[var(--card)] px-4 py-2"
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
