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

type QualityPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

const getMetric = (deltas: MetricDelta[], metric: string) =>
  deltas.find((item) => item.metric === metric) ??
  FALLBACK_DELTAS.find((item) => item.metric === metric);

export default async function QualityPage({ searchParams }: QualityPageProps) {
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

  const home = await getHomeData(filters).catch(() => null);
  const deltas = home?.deltas?.length ? home.deltas : FALLBACK_DELTAS;
  const placeholderDeltas = !home?.deltas?.length;

  const changeFailureMetric = getMetric(deltas, "change_failure_rate");
  const ciMetric = getMetric(deltas, "ci_success");
  const reworkMetric = getMetric(deltas, "rework_ratio");
  
  const explain = await getExplainData({ metric: "change_failure_rate", filters }).catch(() => null);
  const drivers = (explain?.drivers ?? []).slice(0, 5);
  const contributors = (explain?.contributors ?? []).slice(0, 5);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="quality" role={activeRole} />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-(--ink-muted)">
                Quality
              </p>
              <h1 className="mt-2 font-(--font-display) text-3xl">
                Reliability Signals
              </h1>
              <p className="mt-2 text-sm text-(--ink-muted)">
                Change failure, CI stability, and rework signals.
              </p>
              <p className="mt-2 text-sm text-(--ink-muted)">
                Open a signal to investigate.
              </p>
            </div>
            <Link
              href={withFilterParam("/", filters, activeRole)}
              className="rounded-full border border-(--card-stroke) px-4 py-2 text-xs uppercase tracking-[0.2em]"
            >
              Back to cockpit
            </Link>
          </header>

          <FilterBar view="quality" />

          <section className="grid gap-4 lg:grid-cols-3">
            <MetricCard
              label={changeFailureMetric?.label ?? "Change Failure Rate"}
              href={buildExploreUrl({ metric: "change_failure_rate", filters, role: activeRole })}
              value={placeholderDeltas ? undefined : changeFailureMetric?.value}
              unit={changeFailureMetric?.unit}
              delta={placeholderDeltas ? undefined : changeFailureMetric?.delta_pct}
              spark={changeFailureMetric?.spark}
              caption="Change failure rate"
            />
            <MetricCard
              label={ciMetric?.label ?? "CI Success Rate"}
              href={buildExploreUrl({ metric: "ci_success", filters, role: activeRole })}
              value={placeholderDeltas ? undefined : ciMetric?.value}
              unit={ciMetric?.unit}
              delta={placeholderDeltas ? undefined : ciMetric?.delta_pct}
              spark={ciMetric?.spark}
              caption="Pipeline success"
            />
            <MetricCard
              label={reworkMetric?.label ?? "Rework Ratio"}
              href={buildExploreUrl({ metric: "rework_ratio", filters, role: activeRole })}
              value={placeholderDeltas ? undefined : reworkMetric?.value}
              unit={reworkMetric?.unit}
              delta={placeholderDeltas ? undefined : reworkMetric?.delta_pct}
              spark={reworkMetric?.spark}
              caption="Churn from rework"
            />
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-(--font-display) text-xl">Change Failure Associations</h2>
                <Link
                  href={buildExploreUrl({ metric: "change_failure_rate", filters, role: activeRole })}
                  className="text-xs uppercase tracking-[0.2em] text-(--accent-2)"
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
                  Association detail will appear once data is ingested.
                </p>
              )}
            </div>

            <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-(--font-display) text-xl">Contributors</h2>
                <Link
                  href={buildExploreUrl({ metric: "change_failure_rate", filters, role: activeRole })}
                  className="text-xs uppercase tracking-[0.2em] text-(--accent-2)"
                >
                  Evidence
                </Link>
              </div>
              {contributors.length ? (
                <div className="mt-4 space-y-2 text-sm">
                  {contributors.map((contributor) => (
                    <Link
                      key={contributor.id}
                      href={buildExploreUrl({ api: contributor.evidence_link, filters, role: activeRole })}
                      className="flex items-center justify-between rounded-2xl border border-(--card-stroke) bg-(--card-70) px-4 py-2"
                    >
                      <span>{contributor.label}</span>
                      <span className="text-xs text-(--ink-muted)">
                        {explain
                          ? formatMetricValue(contributor.value, explain.unit)
                          : "--"}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-(--ink-muted)">
                  Contributor detail will appear once data is ingested.
                </p>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
