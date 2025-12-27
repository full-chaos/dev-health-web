import Link from "next/link";

import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { FilterBar } from "@/components/filters/FilterBar";
import { MetricCard } from "@/components/metrics/MetricCard";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth, getExplainData, getHomeData } from "@/lib/api";
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

  const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const activeTab =
    METRIC_TABS.find((tab) => tab.id === tabParam) ?? METRIC_TABS[0];

  const home = await getHomeData(filters).catch(() => null);
  const deltas = home?.deltas?.length ? home.deltas : FALLBACK_DELTAS;
  const placeholderDeltas = !home?.deltas?.length;

  const highlight = await getExplainData({
    metric: activeTab.highlight,
    filters,
  }).catch(() => null);

  const drivers = (highlight?.drivers ?? []).slice(0, 5);
  const contributors = (highlight?.contributors ?? []).slice(0, 5);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="metrics" />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                Metrics
              </p>
              <h1 className="mt-2 font-[var(--font-display)] text-3xl">
                Monitoring Views
              </h1>
              <p className="mt-2 text-sm text-[var(--ink-muted)]">
                Track trends, then drill into evidence when something moves.
              </p>
            </div>
            <Link
              href={withFilterParam("/", filters)}
              className="rounded-full border border-[var(--card-stroke)] px-4 py-2 text-xs uppercase tracking-[0.2em]"
            >
              Back to Home
            </Link>
          </header>

          <FilterBar />

          <nav className="flex flex-wrap gap-2">
            {METRIC_TABS.map((tab) => {
              const isActive = tab.id === activeTab.id;
              return (
                <Link
                  key={tab.id}
                  href={withFilterParam(`/metrics?tab=${tab.id}`, filters)}
                  className={`rounded-full border px-4 py-2 text-xs uppercase tracking-[0.2em] transition ${
                    isActive
                      ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--foreground)]"
                      : "border-[var(--card-stroke)] text-[var(--ink-muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>

          <section className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card-80)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                  {activeTab.label} Focus
                </p>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">
                  {activeTab.description}
                </p>
              </div>
              <Link
                href={buildExploreUrl({ metric: activeTab.highlight, filters })}
                className="text-xs uppercase tracking-[0.2em] text-[var(--accent-2)]"
              >
                Open in Explore
              </Link>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-4">
            {activeTab.metrics.map((metric) => {
              const data = getMetric(deltas, metric);
              return (
                <MetricCard
                  key={metric}
                  label={data?.label ?? metric}
                  href={buildExploreUrl({ metric, filters })}
                  value={placeholderDeltas ? undefined : data?.value}
                  unit={data?.unit}
                  delta={placeholderDeltas ? undefined : data?.delta_pct}
                  spark={data?.spark}
                />
              );
            })}
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card)] p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-[var(--font-display)] text-xl">Top Drivers</h2>
                <Link
                  href={buildExploreUrl({ metric: activeTab.highlight, filters })}
                  className="text-xs uppercase tracking-[0.2em] text-[var(--accent-2)]"
                >
                  Evidence
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
                        className="flex items-center justify-between rounded-2xl border border-[var(--card-stroke)] bg-[var(--card-70)] px-4 py-2"
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
                  href={buildExploreUrl({ metric: activeTab.highlight, filters })}
                  className="text-xs uppercase tracking-[0.2em] text-[var(--accent-2)]"
                >
                  Evidence
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
                        className="flex items-center justify-between rounded-2xl border border-[var(--card-stroke)] bg-[var(--card-70)] px-4 py-2"
                      >
                        <span>{contributor.label}</span>
                        <span className="text-xs text-[var(--ink-muted)]">
                          {highlight
                            ? formatMetricValue(contributor.value, highlight.unit)
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

          <section className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card-80)] p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-[var(--font-display)] text-xl">Summary</h2>
              <span className="text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                Active window
              </span>
            </div>
            <div className="mt-4 overflow-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead className="text-left text-[var(--ink-muted)]">
                  <tr>
                    <th className="border-b border-[var(--card-stroke)] pb-2">Metric</th>
                    <th className="border-b border-[var(--card-stroke)] pb-2">Current</th>
                    <th className="border-b border-[var(--card-stroke)] pb-2">Delta</th>
                    <th className="border-b border-[var(--card-stroke)] pb-2">Explore</th>
                  </tr>
                </thead>
                <tbody>
                  {activeTab.metrics.map((metric) => {
                    const data = getMetric(deltas, metric);
                    const href = buildExploreUrl({ metric, filters });
                    return (
                      <tr
                        key={metric}
                        className="border-b border-[var(--card-stroke)]"
                      >
                        <td className="py-3 pr-4 font-medium">
                          <Link href={href} className="block">
                            {data?.label ?? metric}
                          </Link>
                        </td>
                        <td className="py-3 pr-4 text-[var(--ink-muted)]">
                          <Link href={href} className="block">
                            {placeholderDeltas || !data
                              ? "--"
                              : formatMetricValue(data.value, data.unit)}
                          </Link>
                        </td>
                        <td className="py-3 pr-4 text-[var(--ink-muted)]">
                          <Link href={href} className="block">
                            {placeholderDeltas || !data
                              ? "--"
                              : formatDelta(data.delta_pct)}
                          </Link>
                        </td>
                        <td className="py-3 text-xs uppercase tracking-[0.2em] text-[var(--accent-2)]">
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
      </div>
    </div>
  );
}
