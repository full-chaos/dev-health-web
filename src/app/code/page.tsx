import Link from "next/link";

import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { HeatmapPanel } from "@/components/charts/HeatmapPanel";
import { QuadrantPanel } from "@/components/charts/QuadrantPanel";
import { FilterBar } from "@/components/filters/FilterBar";
import { MetricCard } from "@/components/metrics/MetricCard";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import {
  checkApiHealth,
  getExplainData,
  getHeatmap,
  getHomeData,
  getQuadrant,
} from "@/lib/api";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { formatMetricValue } from "@/lib/formatters";
import { FALLBACK_DELTAS } from "@/lib/metrics/catalog";
import type { MetricDelta } from "@/lib/types";

type CodePageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

const getMetric = (deltas: MetricDelta[], metric: string) =>
  deltas.find((item) => item.metric === metric) ??
  FALLBACK_DELTAS.find((item) => item.metric === metric);

export default async function CodePage({ searchParams }: CodePageProps) {
  const health = await checkApiHealth();
  if (!health.ok) {
    return <ServiceUnavailable />;
  }

  const params = (await searchParams) ?? {};
  const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
  const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
  const activeRole = typeof roleParam === "string" ? roleParam : undefined;

  const filters = encodedFilter
    ? decodeFilter(encodedFilter)
    : filterFromQueryParams(params);
  const scopeId = filters.scope.ids[0] ?? "";
  const quadrantScope: "org" | "team" | "repo" | "developer" =
    filters.scope.level === "developer"
      ? "developer"
      : filters.scope.level === "team" || filters.scope.level === "repo"
        ? filters.scope.level
        : "org";

  const home = await getHomeData(filters).catch(() => null);
  const deltas = home?.deltas?.length ? home.deltas : FALLBACK_DELTAS;
  const placeholderDeltas = !home?.deltas?.length;

  const churnMetric = getMetric(deltas, "churn");
  const churnExplain = await getExplainData({ metric: "churn", filters }).catch(() => null);
  const hotspots = (churnExplain?.contributors ?? []).slice(0, 6);
  const hotspotHeatmap = await getHeatmap({
    type: "risk",
    metric: "hotspot_risk",
    scope_type: filters.scope.level,
    scope_id: scopeId,
    range_days: filters.time.range_days,
    start_date: filters.time.start_date,
    end_date: filters.time.end_date,
  }).catch(() => null);
  const churnThroughput = await getQuadrant({
    type: "churn_throughput",
    scope_type: quadrantScope,
    scope_id: scopeId,
    range_days: filters.time.range_days,
    bucket: "week",
    start_date: filters.time.start_date,
    end_date: filters.time.end_date,
  }).catch(() => null);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="code" role={activeRole} />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                Code
              </p>
              <h1 className="mt-2 font-[var(--font-display)] text-3xl">
                Churn and Ownership
              </h1>
              <p className="mt-2 text-sm text-[var(--ink-muted)]">
                Identify hotspots and areas with fragile ownership.
              </p>
            </div>
            <Link
              href={withFilterParam("/", filters, activeRole)}
              className="rounded-full border border-[var(--card-stroke)] px-4 py-2 text-xs uppercase tracking-[0.2em]"
            >
              Back to cockpit
            </Link>
          </header>

          <FilterBar view="code" />

          <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <MetricCard
              label={churnMetric?.label ?? "Code Churn"}
              href={buildExploreUrl({ metric: "churn", filters, role: activeRole })}
              value={placeholderDeltas ? undefined : churnMetric?.value}
              unit={churnMetric?.unit}
              delta={placeholderDeltas ? undefined : churnMetric?.delta_pct}
              spark={churnMetric?.spark}
              caption="Churn over the active window"
            />
            <div className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card-80)] p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-[var(--font-display)] text-xl">Ownership Coverage</h2>
                <span className="text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                  Manual
                </span>
              </div>
              <p className="mt-3 text-sm text-[var(--ink-muted)]">
                Connect CODEOWNERS or review roles to surface bus factor risk.
              </p>
              <div className="mt-4 rounded-2xl border border-dashed border-[var(--card-stroke)] bg-[var(--card-70)] px-4 py-3 text-sm text-[var(--ink-muted)]">
                Ownership telemetry not yet configured.
              </div>
            </div>
          </section>

          <section>
            <HeatmapPanel
              title="Hotspot risk accumulation"
              description="Track where churn and ownership load stack over time."
              request={{
                type: "risk",
                metric: "hotspot_risk",
                scope_type: filters.scope.level,
                scope_id: scopeId,
                range_days: filters.time.range_days,
                start_date: filters.time.start_date,
                end_date: filters.time.end_date,
              }}
              initialData={hotspotHeatmap}
              emptyState="Hotspot risk heatmap unavailable."
              evidenceTitle="Hotspot evidence"
            />
          </section>

          <section>
            <QuadrantPanel
              title="Churn × Throughput landscape"
              description="Differentiate refactor-heavy and delivery-heavy operating modes without ranking teams or repos."
              data={churnThroughput}
              filters={filters}
              relatedLinks={[
                {
                  label: "Open landscapes",
                  href: withFilterParam("/explore/landscape", filters, activeRole),
                },
              ]}
              emptyState="Quadrant data unavailable for this scope."
            />
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card)] p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-[var(--font-display)] text-xl">Hotspots</h2>
                <Link
                  href={buildExploreUrl({ metric: "churn", filters, role: activeRole })}
                  className="text-xs uppercase tracking-[0.2em] text-[var(--accent-2)]"
                >
                  Evidence
                </Link>
              </div>
              {hotspots.length ? (
                <div className="mt-4 space-y-4">
                  <HorizontalBarChart
                    categories={hotspots.map((item) => item.label)}
                    values={hotspots.map((item) => item.value)}
                  />
                  <div className="space-y-2 text-sm">
                    {hotspots.map((item) => (
                      <Link
                        key={item.id}
                        href={buildExploreUrl({ api: item.evidence_link, filters, role: activeRole })}
                        className="flex items-center justify-between rounded-2xl border border-[var(--card-stroke)] bg-[var(--card-70)] px-4 py-2"
                      >
                        <span>{item.label}</span>
                        <span className="text-xs text-[var(--ink-muted)]">
                          {churnExplain
                            ? formatMetricValue(item.value, churnExplain.unit)
                            : "--"}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-[var(--ink-muted)]">
                  Hotspot detail will appear once data is ingested.
                </p>
              )}
            </div>

            <div className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card)] p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-[var(--font-display)] text-xl">Bus Factor</h2>
                <Link
                  href={buildExploreUrl({ metric: "churn", filters, role: activeRole })}
                  className="text-xs uppercase tracking-[0.2em] text-[var(--accent-2)]"
                >
                  Explore
                </Link>
              </div>
              <p className="mt-3 text-sm text-[var(--ink-muted)]">
                Once ownership signals are connected, this view highlights single maintainer risks.
              </p>
              <div className="mt-4 space-y-2 text-sm">
                <div className="rounded-2xl border border-dashed border-[var(--card-stroke)] bg-[var(--card-70)] px-4 py-3 text-[var(--ink-muted)]">
                  Add ownership metadata to unlock bus factor scoring.
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
