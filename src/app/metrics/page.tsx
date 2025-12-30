import Link from "next/link";

import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { QuadrantPanel } from "@/components/charts/QuadrantPanel";
import { FilterBar } from "@/components/filters/FilterBar";
import { MetricCard } from "@/components/metrics/MetricCard";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth, getExplainData, getHomeData, getQuadrant } from "@/lib/api";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { formatDelta, formatMetricValue } from "@/lib/formatters";
import { FALLBACK_DELTAS } from "@/lib/metrics/catalog";
import type { MetricDelta } from "@/lib/types";

type MetricsPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

type MetricTab = {
  id: string;
  label: string;
  description: string;
  metrics: string[];
  highlight: string;
};

const METRIC_TABS: MetricTab[] = [
  {
    id: "dora",
    label: "DORA",
    description: "Release speed and stability.",
    metrics: [
      "deploy_freq",
      "cycle_time",
      "change_failure_rate",
      "review_latency",
    ],
    highlight: "deploy_freq",
  },
  {
    id: "flow",
    label: "Flow",
    description: "From idea to merge.",
    metrics: [
      "cycle_time",
      "review_latency",
      "throughput",
      "wip_saturation",
    ],
    highlight: "cycle_time",
  },
  {
    id: "quality",
    label: "Quality",
    description: "Reliability and rework.",
    metrics: [
      "change_failure_rate",
      "churn",
      "blocked_work",
      "review_latency",
    ],
    highlight: "change_failure_rate",
  },
  {
    id: "throughput",
    label: "Throughput",
    description: "Delivery volume and pacing.",
    metrics: [
      "throughput",
      "deploy_freq",
      "wip_saturation",
      "blocked_work",
    ],
    highlight: "throughput",
  },
];

const getMetric = (deltas: MetricDelta[], metric: string) =>
  deltas.find((item) => item.metric === metric) ??
  FALLBACK_DELTAS.find((item) => item.metric === metric);

export default async function MetricsPage({ searchParams }: MetricsPageProps) {
  const health = await checkApiHealth();
  if (!health.ok) {
    return <ServiceUnavailable />;
  }

  const params = (await searchParams) ?? {};
  const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
  const filters = encodedFilter
    ? decodeFilter(encodedFilter)
    : filterFromQueryParams(params);

  const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
  const activeRole = typeof roleParam === "string" ? roleParam : undefined;

  const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const activeTab =
    METRIC_TABS.find((tab) => tab.id === tabParam) ?? METRIC_TABS[0];

  const home = await getHomeData(filters).catch(() => null);
  const deltas = home?.deltas?.length ? home.deltas : FALLBACK_DELTAS;
  const placeholderDeltas = !home?.deltas?.length;
  const highlightMetric = getMetric(deltas, activeTab.highlight);
  const highlightLabel = highlightMetric?.label ?? activeTab.highlight;

  const highlight = await getExplainData({
    metric: activeTab.highlight,
    filters,
  }).catch(() => null);
  const quadrantScope: "org" | "team" | "repo" | "developer" =
    filters.scope.level === "developer"
      ? "developer"
      : filters.scope.level === "team" || filters.scope.level === "repo"
        ? filters.scope.level
        : "org";
  const quadrant = await getQuadrant({
    type: "churn_throughput",
    scope_type: quadrantScope,
    scope_id: filters.scope.ids[0] ?? "",
    range_days: filters.time.range_days,
    bucket: "week",
    start_date: filters.time.start_date,
    end_date: filters.time.end_date,
  }).catch(() => null);

  const drivers = (highlight?.drivers ?? []).slice(0, 5);
  const contributors = (highlight?.contributors ?? []).slice(0, 5);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="metrics" role={activeRole} />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-(--ink-muted)">
                Metrics
              </p>
              <h1 className="mt-2 font-(--font-display) text-3xl">
                Monitoring view
              </h1>
              <p className="mt-2 text-sm text-(--ink-muted)">
                Track trends over time. Use Explore only for evidence.
              </p>
            </div>
            <Link
              href={withFilterParam("/", filters, activeRole)}
              className="rounded-full border border-(--card-stroke) px-4 py-2 text-xs uppercase tracking-[0.2em]"
            >
              Back to cockpit
            </Link>
          </header>

          <FilterBar view="metrics" tab={activeTab.id} />

          <nav className="flex flex-wrap gap-2">
            {METRIC_TABS.map((tab) => {
              const isActive = tab.id === activeTab.id;
              return (
                <Link
                  key={tab.id}
                  href={withFilterParam(`/metrics?tab=${tab.id}`, filters, activeRole)}
                  className={`rounded-full border px-4 py-2 text-xs uppercase tracking-[0.2em] transition ${isActive
                    ? "border-(--accent) bg-(--accent)/15 text-foreground"
                    : "border-(--card-stroke) text-(--ink-muted) hover:text-foreground"
                    }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>

          <section className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-(--ink-muted)">
                  {activeTab.label} monitoring
                </p>
                <p className="mt-1 text-sm text-(--ink-muted)">
                  {activeTab.description}
                </p>
              </div>
              <Link
                href={buildExploreUrl({ metric: activeTab.highlight, filters, role: activeRole })}
                className="text-xs uppercase tracking-[0.2em] text-(--accent-2)"
                title={`Open evidence for ${highlightLabel}`}
              >
                Open evidence
              </Link>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              {activeTab.metrics.map((metric) => {
                const data = getMetric(deltas, metric);
                return (
                  <Link
                    key={`chip-${metric}`}
                    href={buildExploreUrl({ metric, filters, role: activeRole })}
                    className="rounded-full border border-(--card-stroke) bg-(--card) px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-(--ink-muted) transition hover:text-foreground"
                  >
                    {data?.label ?? metric}
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-4">
            {activeTab.metrics.map((metric) => {
              const data = getMetric(deltas, metric);
              return (
                <MetricCard
                  key={metric}
                  label={data?.label ?? metric}
                  href={buildExploreUrl({ metric, filters, role: activeRole })}
                  value={placeholderDeltas ? undefined : data?.value}
                  unit={data?.unit}
                  delta={placeholderDeltas ? undefined : data?.delta_pct}
                  spark={data?.spark}
                />
              );
            })}
          </section>

          <section>
            <QuadrantPanel
              title="Churn × Throughput landscape"
              description="Classify system modes without ranking or scoring."
              data={quadrant}
              filters={filters}
              relatedLinks={[
                { label: "Open landscapes", href: withFilterParam("/explore/landscape", filters, activeRole) },
              ]}
              emptyState="Quadrant data unavailable for this scope."
            />
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-(--font-display) text-xl">Likely drivers</h2>
                <Link
                  href={buildExploreUrl({ metric: activeTab.highlight, filters, role: activeRole })}
                  className="text-xs uppercase tracking-[0.2em] text-(--accent-2)"
                >
                  Open evidence
                </Link>
              </div>
              <p className="mt-2 text-xs text-(--ink-muted)">
                Preview of the active window. Select a driver for drill-down.
              </p>
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
                        href={buildExploreUrl({ api: driver.evidence_link, filters, role: activeRole })}
                        className="flex items-center justify-between rounded-2xl border border-(--card-stroke) bg-(--card-70) px-4 py-2"
                      >
                        <span>{driver.label}</span>
                        <span className="text-xs text-(--ink-muted)">
                          {formatDelta(driver.delta_pct)}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-(--ink-muted)">
                  Driver analysis will appear once data is ingested.
                </p>
              )}
            </div>

            <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-(--font-display) text-xl">Primary contributors</h2>
                <Link
                  href={buildExploreUrl({ metric: activeTab.highlight, filters, role: activeRole })}
                  className="text-xs uppercase tracking-[0.2em] text-(--accent-2)"
                >
                  Open evidence
                </Link>
              </div>
              <p className="mt-2 text-xs text-(--ink-muted)">
                Where the impact concentrates in this window.
              </p>
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
                        href={buildExploreUrl({ api: contributor.evidence_link, filters, role: activeRole })}
                        className="flex items-center justify-between rounded-2xl border border-(--card-stroke) bg-(--card-70) px-4 py-2"
                      >
                        <span>{contributor.label}</span>
                        <span className="text-xs text-(--ink-muted)">
                          {highlight
                            ? formatMetricValue(contributor.value, highlight.unit)
                            : "--"}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-(--ink-muted)">
                  Contributor detail will appear once data is ingested.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-(--font-display) text-xl">Summary</h2>
              <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                Active window
              </span>
            </div>
            <div className="mt-4 overflow-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead className="text-left text-(--ink-muted)">
                  <tr>
                    <th className="border-b border-(--card-stroke) pb-2">Metric</th>
                    <th className="border-b border-(--card-stroke) pb-2">Current</th>
                    <th className="border-b border-(--card-stroke) pb-2">Delta</th>
                    <th className="border-b border-(--card-stroke) pb-2">Explore</th>
                  </tr>
                </thead>
                <tbody>
                  {activeTab.metrics.map((metric) => {
                    const data = getMetric(deltas, metric);
                    const href = buildExploreUrl({ metric, filters, role: activeRole });
                    return (
                      <tr
                        key={metric}
                        className="border-b border-(--card-stroke)"
                      >
                        <td className="py-3 pr-4 font-medium">
                          <Link href={href} className="block">
                            {data?.label ?? metric}
                          </Link>
                        </td>
                        <td className="py-3 pr-4 text-(--ink-muted)">
                          <Link href={href} className="block">
                            {placeholderDeltas || !data
                              ? "--"
                              : formatMetricValue(data.value, data.unit)}
                          </Link>
                        </td>
                        <td className="py-3 pr-4 text-(--ink-muted)">
                          <Link href={href} className="block">
                            {placeholderDeltas || !data
                              ? "--"
                              : formatDelta(data.delta_pct)}
                          </Link>
                        </td>
                        <td className="py-3 text-xs uppercase tracking-[0.2em] text-(--accent-2)">
                          <Link href={href} className="block">
                            Open
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div >
    </div >
  );
}
