import Link from "next/link";

import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { FilterBar } from "@/components/filters/FilterBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth, getDrilldown, getExplainData, getHomeData } from "@/lib/api";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { formatDelta, formatMetricValue } from "@/lib/formatters";
import { getMetricLabel } from "@/lib/metrics/catalog";

const getItemTitle = (item: Record<string, unknown>, index: number) => {
  const title =
    item.title ??
    item.name ??
    item.work_item_id ??
    item.number ??
    item.id ??
    `Item ${index + 1}`;
  return String(title);
};

const getItemHref = (
  item: Record<string, unknown>,
  fallback: string
) => {
  const candidates = [
    item.url,
    item.link,
    item.html_url,
    item.web_url,
    item.api_url,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length) {
      return candidate;
    }
  }
  return fallback;
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
  const sourceLabel = apiParam || `/api/v1/explain?metric=${metricFromApi}`;

  let view: "explain" | "drilldown" | "home" | "unknown" = "explain";
  let data: Awaited<ReturnType<typeof getExplainData>> | null = null;
  let drilldown: Awaited<ReturnType<typeof getDrilldown>> | null = null;
  let home: Awaited<ReturnType<typeof getHomeData>> | null = null;

  if (endpoint === "/api/v1/drilldown/prs" || endpoint === "/api/v1/drilldown/issues") {
    view = "drilldown";
    drilldown = await getDrilldown(
      endpoint as "/api/v1/drilldown/prs" | "/api/v1/drilldown/issues",
      filters
    ).catch(() => null);
  } else if (endpoint === "/api/v1/home") {
    view = "home";
    home = await getHomeData(filters).catch(() => null);
  } else if (endpoint === "/api/v1/explain") {
    view = "explain";
    data = await getExplainData({ metric: metricFromApi, filters }).catch(() => null);
  } else {
    view = "unknown";
  }

  const metricLabel = data?.label ?? getMetricLabel(metricFromApi);
  const scopeDetail = filters.scope.ids.length
    ? filters.scope.ids.join(", ")
    : `all ${filters.scope.level}s`;
  const categoryParam = Array.isArray(params.category) ? params.category[0] : params.category;
  const streamParam = Array.isArray(params.stream) ? params.stream[0] : params.stream;
  const breakdownParam = Array.isArray(params.breakdown) ? params.breakdown[0] : params.breakdown;

  const developers = filters.who.developers ?? [];
  const roles = filters.who.roles ?? [];
  const repos = filters.what.repos ?? [];
  const artifacts = filters.what.artifacts ?? [];
  const workCategory = filters.why.work_category ?? [];
  const issueType = filters.why.issue_type ?? [];
  const flowStage = filters.how.flow_stage ?? [];

  const chips = [
    `Scope: ${filters.scope.level}`,
    filters.scope.ids.length ? `IDs: ${filters.scope.ids.join(", ")}` : "All IDs",
    `Range: ${filters.time.range_days}d`,
    `Compare: ${filters.time.compare_days}d`,
    developers.length
      ? `Devs: ${developers.join(", ")}`
      : null,
    roles.length ? `Roles: ${roles.join(", ")}` : null,
    repos.length ? `Repos: ${repos.join(", ")}` : null,
    artifacts.length ? `Artifacts: ${artifacts.join(", ")}` : null,
    workCategory.length ? `Work type: ${workCategory.join(", ")}` : null,
    issueType.length ? `Issue type: ${issueType.join(", ")}` : null,
    categoryParam ? `Category: ${categoryParam}` : null,
    streamParam ? `Stream: ${streamParam}` : null,
    breakdownParam ? `Breakdown: ${breakdownParam}` : null,
    flowStage.length ? `Flow: ${flowStage.join(", ")}` : null,
    filters.how.blocked ? "Blocked only" : null,
  ].filter(Boolean) as string[];

  const drivers = (data?.drivers ?? []).slice(0, 5);
  const contributors = (data?.contributors ?? []).slice(0, 5);
  const explanation =
    view === "drilldown"
      ? `Evidence table for ${metricLabel} in ${scopeDetail}.`
      : view === "home"
        ? "Snapshot of the cockpit payload for this scope."
        : `This view explains ${metricLabel} for ${scopeDetail} over the last ${filters.time.range_days} days.`;
  const breakdownNote = breakdownParam ? `Breakdown: ${breakdownParam}.` : null;

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={filters} />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                Explore
              </p>
              <h1 className="mt-2 font-[var(--font-display)] text-3xl">
                {metricLabel}
              </h1>
              <p className="mt-2 text-sm text-[var(--ink-muted)]">
                Drill-down inspector. Monitor in Metrics, return here for evidence.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={withFilterParam("/explore/landscape", filters)}
                className="rounded-full border border-[var(--card-stroke)] px-4 py-2 text-xs uppercase tracking-[0.2em]"
              >
                Landscape
              </Link>
              <Link
                href={withFilterParam("/metrics", filters)}
                className="rounded-full border border-[var(--card-stroke)] px-4 py-2 text-xs uppercase tracking-[0.2em]"
              >
                Back to Metrics view
              </Link>
              <Link
                href={withFilterParam("/", filters)}
                className="rounded-full border border-[var(--card-stroke)] px-4 py-2 text-xs uppercase tracking-[0.2em]"
              >
                Back to cockpit
              </Link>
            </div>
          </header>

          <FilterBar condensed view="explore" />

          <section className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card-80)] p-5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                  Context
                </p>
                <p className="mt-1 text-sm font-semibold">{metricLabel}</p>
              </div>
              <span className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                {view.toUpperCase()}
              </span>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
              <div>
                <p className="text-sm text-[var(--ink-muted)]">{explanation}</p>
                <p className="mt-2 text-xs text-[var(--ink-muted)]">
                  Source: {sourceLabel}
                </p>
                {breakdownNote ? (
                  <p className="mt-2 text-xs text-[var(--ink-muted)]">
                    {breakdownNote}
                  </p>
                ) : null}
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                  Active filters
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {chips.map((chip) => (
                    <span
                      key={chip}
                      className="rounded-full border border-[var(--card-stroke)] bg-[var(--card-70)] px-3 py-1"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card-80)] p-5">
            <details>
              <summary className="cursor-pointer text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                Debug filters
              </summary>
              <pre className="mt-3 max-h-64 overflow-auto rounded-2xl border border-[var(--card-stroke)] bg-[var(--card)] px-4 py-3 text-xs text-[var(--ink-muted)]">
                {JSON.stringify(filters, null, 2)}
              </pre>
            </details>
          </section>

          {view === "explain" && (
            <section className="grid gap-6 lg:grid-cols-3">
              <div className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card)] p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                  Signal snapshot
                </p>
                <div className="mt-3 flex flex-wrap items-baseline gap-3">
                  <span className="text-3xl font-semibold">
                    {data ? formatMetricValue(data.value, data.unit) : "--"}
                  </span>
                  <span className="text-sm text-[var(--ink-muted)]">
                    {data ? formatDelta(data.delta_pct) : "--"} vs previous window
                  </span>
                </div>
                <p className="mt-3 text-xs text-[var(--ink-muted)]">
                  Evidence links below stay in this scope.
                </p>
              </div>

              <div className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card)] p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-[var(--font-display)] text-xl">Top Drivers</h2>
                  <Link
                    href={buildExploreUrl({ metric: metricFromApi, filters })}
                    className="text-xs uppercase tracking-[0.2em] text-[var(--accent-2)]"
                  >
                    Open evidence
                  </Link>
                </div>
                {drivers.length ? (
                  <div className="mt-4 space-y-4">
                    <HorizontalBarChart
                      categories={drivers.map((driver) => driver.label)}
                      values={drivers.map((driver) => Math.abs(driver.delta_pct))}
                    />
                    <div className="space-y-2 text-sm">
                      {drivers.map((driver) => (
                        <Link
                          key={driver.id}
                          href={buildExploreUrl({ api: driver.evidence_link, filters })}
                          className="flex items-center justify-between rounded-2xl border border-[var(--card-stroke)] bg-[var(--card-70)] px-3 py-2"
                        >
                          <span>{driver.label}</span>
                          <span className="text-xs text-[var(--ink-muted)]">
                            {formatDelta(driver.delta_pct)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-[var(--ink-muted)]">
                    Driver analysis will appear once data is ingested.
                  </p>
                )}
              </div>

              <div className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card)] p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-[var(--font-display)] text-xl">Contributors</h2>
                  <Link
                    href={buildExploreUrl({ metric: metricFromApi, filters })}
                    className="text-xs uppercase tracking-[0.2em] text-[var(--accent-2)]"
                  >
                    Open evidence
                  </Link>
                </div>
                {contributors.length ? (
                  <div className="mt-4 space-y-4">
                    <HorizontalBarChart
                      categories={contributors.map((contributor) => contributor.label)}
                      values={contributors.map((contributor) => contributor.value)}
                    />
                    <div className="space-y-2 text-sm">
                      {contributors.map((contributor) => (
                        <Link
                          key={contributor.id}
                          href={buildExploreUrl({ api: contributor.evidence_link, filters })}
                          className="flex items-center justify-between rounded-2xl border border-[var(--card-stroke)] bg-[var(--card-70)] px-3 py-2"
                        >
                          <span>{contributor.label}</span>
                          <span className="text-xs text-[var(--ink-muted)]">
                            {data
                              ? formatMetricValue(contributor.value, data.unit)
                              : "--"}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-[var(--ink-muted)]">
                    Contributor detail will appear once data is ingested.
                  </p>
                )}
              </div>
            </section>
          )}

          {view === "drilldown" && (
            <section className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card-80)] p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-[var(--font-display)] text-xl">Evidence Table</h2>
                <span className="text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                  {drilldown?.items?.length ?? 0} items
                </span>
              </div>
              <p className="mt-2 text-xs text-[var(--ink-muted)]">
                Rows link to source artifacts when available.
              </p>
              <div className="mt-4 overflow-auto text-xs">
                <table className="min-w-full border-collapse">
                  <thead className="text-left text-[var(--ink-muted)]">
                    <tr>
                      <th className="border-b border-[var(--card-stroke)] pb-2">Item</th>
                      <th className="border-b border-[var(--card-stroke)] pb-2">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(drilldown?.items ?? []).map((item, idx) => {
                      const fallbackHref = buildExploreUrl({
                        metric: metricFromApi,
                        filters,
                      });
                      const href = getItemHref(item, fallbackHref);
                      const prFlameHref =
                        typeof item.repo_id === "string" &&
                        typeof item.number === "number"
                          ? `/prs/${item.repo_id}:${item.number}`
                          : null;
                      const issueFlameHref =
                        typeof item.work_item_id === "string"
                          ? `/issues/${item.work_item_id}`
                          : null;
                      const flameHref = prFlameHref ?? issueFlameHref;
                      return (
                        <tr
                          key={`item-${idx}`}
                          className="border-b border-[var(--card-stroke)]"
                        >
                          <td className="py-2 pr-4 font-medium">
                            <a
                              href={href}
                              className="block text-[var(--foreground)]"
                            >
                              {getItemTitle(item, idx)}
                            </a>
                          </td>
                          <td className="py-2 text-[var(--ink-muted)]">
                            <div className="space-y-2">
                              <a href={href} className="block">
                                {JSON.stringify(item)}
                              </a>
                              {flameHref ? (
                                <Link
                                  href={flameHref}
                                  className="inline-flex items-center rounded-full border border-[var(--card-stroke)] bg-[var(--card)] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-[var(--accent-2)]"
                                >
                                  Open flame
                                </Link>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {view === "home" && (
            <section className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card-80)] p-5">
              <h2 className="font-[var(--font-display)] text-xl">Home Snapshot</h2>
              <p className="mt-3 text-sm text-[var(--ink-muted)]">
                This endpoint powers the cockpit. Open Home for the curated summary.
              </p>
              <pre className="mt-4 max-h-64 overflow-auto rounded-2xl border border-[var(--card-stroke)] bg-[var(--card)] px-4 py-3 text-xs text-[var(--ink-muted)]">
                {JSON.stringify(home ?? {}, null, 2)}
              </pre>
            </section>
          )}

          {view === "unknown" && (
            <section className="rounded-3xl border border-dashed border-[var(--card-stroke)] bg-[var(--card-70)] p-5 text-sm text-[var(--ink-muted)]">
              Unsupported endpoint. Provide a metric or a supported drilldown API.
            </section>
          )}

          {view === "explain" && (
            <section className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card-80)] p-5">
              <h2 className="font-[var(--font-display)] text-xl">Evidence shortcuts</h2>
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
                {!Object.keys(data?.drilldown_links ?? {}).length && (
                  <p className="text-sm text-[var(--ink-muted)]">
                    Evidence links will appear once data is ingested.
                  </p>
                )}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
