import Link from "next/link";

import { FilterBar } from "@/components/filters/FilterBar";
import { InvestmentChart } from "@/components/investment/InvestmentChart";
import { MetricCard } from "@/components/metrics/MetricCard";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth, getExplainData, getHomeData, getInvestment } from "@/lib/api";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { formatDelta, formatNumber, formatPercent } from "@/lib/formatters";
import { FALLBACK_DELTAS } from "@/lib/metrics/catalog";
import { mapInvestmentToNestedPie } from "@/lib/mappers";
import type { MetricDelta } from "@/lib/types";

type WorkPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

const getMetric = (deltas: MetricDelta[], metric: string) =>
  deltas.find((item) => item.metric === metric) ??
  FALLBACK_DELTAS.find((item) => item.metric === metric);

const findCategory = (
  categories: Array<{ key: string; name: string; value: number }>,
  tokens: string[]
) =>
  categories.find((category) =>
    tokens.some((token) =>
      `${category.key} ${category.name}`.toLowerCase().includes(token)
    )
  );

export default async function WorkPage({ searchParams }: WorkPageProps) {
  const health = await checkApiHealth();
  if (!health.ok) {
    return <ServiceUnavailable />;
  }

  const params = (await searchParams) ?? {};
  const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
  const filters = encodedFilter
    ? decodeFilter(encodedFilter)
    : filterFromQueryParams(params);

  const home = await getHomeData(filters).catch(() => null);
  const deltas = home?.deltas?.length ? home.deltas : FALLBACK_DELTAS;
  const placeholderDeltas = !home?.deltas?.length;

  const investment = await getInvestment(filters).catch(() => null);
  const nested = investment ? mapInvestmentToNestedPie(investment) : { categories: [], subtypes: [] };

  const wipMetric = getMetric(deltas, "wip_saturation");
  const blockedMetric = getMetric(deltas, "blocked_work");
  const throughputMetric = getMetric(deltas, "throughput");

  const wipExplain = await getExplainData({ metric: "wip_saturation", filters }).catch(() => null);
  const blockedExplain = await getExplainData({ metric: "blocked_work", filters }).catch(() => null);

  const planned = investment
    ? findCategory(investment.categories, ["planned", "roadmap", "feature"])
    : null;
  const unplanned = investment
    ? findCategory(investment.categories, [
        "unplanned",
        "interrupt",
        "incident",
        "support",
        "ops",
        "run",
      ])
    : null;
  const plannedTotal = planned && unplanned ? planned.value + unplanned.value : 0;
  const plannedPct = plannedTotal ? (planned?.value ?? 0) / plannedTotal : null;
  const unplannedPct = plannedTotal ? (unplanned?.value ?? 0) / plannedTotal : null;

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="work" />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                Work
              </p>
              <h1 className="mt-2 font-[var(--font-display)] text-3xl">
                Investment and Flow
              </h1>
              <p className="mt-2 text-sm text-[var(--ink-muted)]">
                Planned vs unplanned, WIP pressure, and blocked effort.
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

          <section className="grid gap-4 lg:grid-cols-3">
            <MetricCard
              label={wipMetric?.label ?? "WIP"}
              href={buildExploreUrl({ metric: "wip_saturation", filters })}
              value={placeholderDeltas ? undefined : wipMetric?.value}
              unit={wipMetric?.unit}
              delta={placeholderDeltas ? undefined : wipMetric?.delta_pct}
              spark={wipMetric?.spark}
              caption="WIP saturation"
            />
            <MetricCard
              label={blockedMetric?.label ?? "Blocked"}
              href={buildExploreUrl({ metric: "blocked_work", filters })}
              value={placeholderDeltas ? undefined : blockedMetric?.value}
              unit={blockedMetric?.unit}
              delta={placeholderDeltas ? undefined : blockedMetric?.delta_pct}
              spark={blockedMetric?.spark}
              caption="Blocked work"
            />
            <MetricCard
              label={throughputMetric?.label ?? "Throughput"}
              href={buildExploreUrl({ metric: "throughput", filters })}
              value={placeholderDeltas ? undefined : throughputMetric?.value}
              unit={throughputMetric?.unit}
              delta={placeholderDeltas ? undefined : throughputMetric?.delta_pct}
              spark={throughputMetric?.spark}
              caption="Delivery volume"
            />
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card)] p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-[var(--font-display)] text-xl">Investment Mix</h2>
                <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.2em] text-[var(--accent-2)]">
                  <Link href={withFilterParam("/investment", filters)}>
                    View investment
                  </Link>
                  <Link href={buildExploreUrl({ metric: "throughput", filters })}>
                    Open in Explore
                  </Link>
                </div>
              </div>
              <div className="mt-4">
                {nested.categories.length ? (
                  <InvestmentChart categories={nested.categories} subtypes={nested.subtypes} />
                ) : (
                  <div className="flex h-[280px] items-center justify-center rounded-3xl border border-dashed border-[var(--card-stroke)] bg-[var(--card-60)] text-sm text-[var(--ink-muted)]">
                    Investment data unavailable.
                  </div>
                )}
              </div>
              <div className="mt-4 grid gap-2 text-sm">
                {nested.categories.slice(0, 6).map((category) => (
                  <Link
                    key={category.key}
                    href={withFilterParam(`/explore?metric=throughput&category=${category.key}`, filters)}
                    className="flex items-center justify-between rounded-2xl border border-[var(--card-stroke)] bg-[var(--card-70)] px-4 py-2"
                  >
                    <span>{category.name}</span>
                    <span className="text-xs text-[var(--ink-muted)]">
                      {formatNumber(category.value)} units
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card-80)] p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-[var(--font-display)] text-xl">Planned vs Unplanned</h2>
                <Link
                  href={withFilterParam("/investment", filters)}
                  className="text-xs uppercase tracking-[0.2em] text-[var(--accent-2)]"
                >
                  Details
                </Link>
              </div>
              {planned && unplanned ? (
                <div className="mt-4 space-y-4">
                  <div className="rounded-2xl border border-[var(--card-stroke)] bg-[var(--card)] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                      Planned
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                      {formatPercent((plannedPct ?? 0) * 100)}
                    </p>
                    <p className="mt-2 text-xs text-[var(--ink-muted)]">
                      {formatNumber(planned.value)} units
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[var(--card-stroke)] bg-[var(--card)] px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                      Unplanned
                    </p>
                    <p className="mt-2 text-2xl font-semibold">
                      {formatPercent((unplannedPct ?? 0) * 100)}
                    </p>
                    <p className="mt-2 text-xs text-[var(--ink-muted)]">
                      {formatNumber(unplanned.value)} units
                    </p>
                  </div>
                  <p className="text-xs text-[var(--ink-muted)]">
                    Derived from investment tags in the current window.
                  </p>
                </div>
              ) : (
                <div className="mt-4 rounded-2xl border border-dashed border-[var(--card-stroke)] bg-[var(--card-70)] px-4 py-4 text-sm text-[var(--ink-muted)]">
                  Planned vs unplanned requires tagged work categories.
                </div>
              )}
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card)] p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-[var(--font-display)] text-xl">WIP Drivers</h2>
                <Link
                  href={buildExploreUrl({ metric: "wip_saturation", filters })}
                  className="text-xs uppercase tracking-[0.2em] text-[var(--accent-2)]"
                >
                  Evidence
                </Link>
              </div>
              <div className="mt-4 space-y-2 text-sm">
                {(wipExplain?.drivers ?? []).slice(0, 5).map((driver) => (
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
                {!wipExplain?.drivers?.length && (
                  <p className="text-sm text-[var(--ink-muted)]">
                    WIP driver detail will appear once data is ingested.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card)] p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-[var(--font-display)] text-xl">Blocked Drivers</h2>
                <Link
                  href={buildExploreUrl({ metric: "blocked_work", filters })}
                  className="text-xs uppercase tracking-[0.2em] text-[var(--accent-2)]"
                >
                  Evidence
                </Link>
              </div>
              <div className="mt-4 space-y-2 text-sm">
                {(blockedExplain?.drivers ?? []).slice(0, 5).map((driver) => (
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
                {!blockedExplain?.drivers?.length && (
                  <p className="text-sm text-[var(--ink-muted)]">
                    Blocked driver detail will appear once data is ingested.
                  </p>
                )}
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
