import Link from "next/link";

import { InvestmentPreview } from "@/components/home/InvestmentPreview";
import { DataStatusBanner } from "@/components/home/DataStatusBanner";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { FilterBar } from "@/components/filters/FilterBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { checkApiHealth, getHomeData } from "@/lib/api";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { formatDelta, formatMetricValue, formatPercent, formatTimestamp } from "@/lib/formatters";
import { FALLBACK_DELTAS } from "@/lib/metrics/catalog";
import type { HomeResponse } from "@/lib/types";

const deltaAccent = (value: number) =>
  value > 0
    ? "text-[var(--accent-3)]"
    : value < 0
      ? "text-[var(--accent-negative)]"
      : "text-[var(--ink-muted)]";

const MONITORING_VIEWS = [
  {
    id: "dora",
    label: "DORA",
    description: "Release speed and stability.",
    focus: "Deploy frequency, cycle time, failure rate.",
    href: "/metrics?tab=dora",
  },
  {
    id: "flow",
    label: "Flow",
    description: "Idea to merge signal.",
    focus: "Review latency, throughput, WIP.",
    href: "/metrics?tab=flow",
  },
  {
    id: "quality",
    label: "Quality",
    description: "Reliability and rework.",
    focus: "Change failure, churn, blocked work.",
    href: "/metrics?tab=quality",
  },
  {
    id: "throughput",
    label: "Throughput",
    description: "Delivery volume and pacing.",
    focus: "Throughput, WIP saturation, blocked work.",
    href: "/metrics?tab=throughput",
  },
];

const loadHome = async (filters: Parameters<typeof getHomeData>[0]): Promise<HomeResponse | null> => {
  try {
    return await getHomeData(filters);
  } catch {
    return null;
  }
};

type HomePageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function Home({ searchParams }: HomePageProps) {
  const health = await checkApiHealth();
  if (!health.ok) {
    return <ServiceUnavailable />;
  }

  const params = (await searchParams) ?? {};
  const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
  const filters = encodedFilter
    ? decodeFilter(encodedFilter)
    : filterFromQueryParams(params);

  const home = await loadHome(filters);
  const coverage = home?.freshness.coverage;
  const coverageLow = coverage ? coverage.repos_covered_pct < 70 : false;
  const lastIngestedAt = home?.freshness.last_ingested_at ?? null;
  const deltas = home?.deltas?.length ? home.deltas : FALLBACK_DELTAS;
  const placeholderDeltas = !home?.deltas?.length;
  const scopeDetail = filters.scope.ids.length
    ? filters.scope.ids.join(", ")
    : `all ${filters.scope.level}s`;

  return (
    <div className="min-h-screen bg-[image:var(--hero-gradient)] text-[var(--foreground)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-20 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="home" />
        <main className="flex min-w-0 flex-1 flex-col gap-10">
          <header className="rounded-[32px] border border-[var(--card-stroke)] bg-[var(--card-80)] p-6 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.4)]">
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.4em] text-[var(--ink-muted)]">
                    Good morning
                  </p>
                  <h1 className="mt-3 font-[var(--font-display)] text-3xl leading-tight sm:text-4xl">
                    Developer Health Ops Cockpit
                  </h1>
                  <p className="mt-3 max-w-xl text-sm text-[var(--ink-muted)]">
                    System status, risks, and recommended moves for {scopeDetail} over
                    the last {filters.time.range_days} days.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded-full border border-[var(--card-stroke)] bg-[var(--card-70)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em]">
                    {filters.scope.level} scope
                  </div>
                  <div className="rounded-full border border-[var(--card-stroke)] bg-[var(--card-70)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em]">
                    {filters.time.range_days}d view
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[1.4fr_0.6fr]">
                <div className="rounded-3xl border border-dashed border-[var(--card-stroke)] bg-[var(--card-70)] p-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[var(--ink-muted)]">
                      Latest ingest: {formatTimestamp(lastIngestedAt)}
                    </span>
                    <span className="rounded-full bg-[var(--accent-3)]/40 px-3 py-1 text-xs font-semibold">
                      System status
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-[var(--ink-muted)]">
                    {home?.freshness.sources ? (
                      Object.entries(home.freshness.sources).map(([key, value]) => (
                        <div
                          key={key}
                          className="flex items-center justify-between rounded-2xl bg-[var(--card-70)] px-3 py-2"
                        >
                          <span className="uppercase tracking-[0.2em]">{key}</span>
                          <span className="font-semibold text-[var(--foreground)]">
                            {value}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="col-span-2 rounded-2xl border border-dashed border-[var(--card-stroke)] bg-[var(--card-60)] px-3 py-2">
                        Source signals pending.
                      </div>
                    )}
                  </div>
                </div>
                <div className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--accent-2)]/10 p-4 text-xs text-[var(--ink-muted)]">
                  <p className="text-[var(--accent-2)]/90">Setup coverage</p>
                  <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
                    {coverage ? formatPercent(coverage.repos_covered_pct) : "--"}
                  </p>
                  <p className="mt-2">
                    PR to issue links: {coverage ? formatPercent(coverage.prs_linked_to_issues_pct) : "--"}
                  </p>
                  <p>
                    Cycle states: {coverage ? formatPercent(coverage.issues_with_cycle_states_pct) : "--"}
                  </p>
                </div>
              </div>
            </div>
          </header>

          <FilterBar view="home" />

          <DataStatusBanner
            isUnavailable={!home}
            lastIngestedAt={lastIngestedAt}
            coverageLow={coverageLow}
            filters={filters}
          />

          <section className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card-80)] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                  Monitoring views
                </p>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">
                  Opinionated tabs for steady trend monitoring.
                </p>
              </div>
              <Link
                href={withFilterParam("/metrics?tab=dora", filters)}
                className="text-xs uppercase tracking-[0.2em] text-[var(--accent-2)]"
              >
                Open metrics
              </Link>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {MONITORING_VIEWS.map((view) => (
                <Link
                  key={view.id}
                  href={withFilterParam(view.href, filters)}
                  className="group rounded-2xl border border-[var(--card-stroke)] bg-[var(--card)] px-4 py-3 transition hover:-translate-y-1"
                >
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                    <span>{view.label}</span>
                    <span className="text-[var(--accent-2)]">Open</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-[var(--foreground)]">
                    {view.description}
                  </p>
                  <p className="mt-2 text-xs text-[var(--ink-muted)]">
                    {view.focus}
                  </p>
                </Link>
              ))}
            </div>
          </section>

          <section>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                  Key signals
                </p>
                <p className="mt-1 text-sm text-[var(--ink-muted)]">
                  Small shifts worth inspecting.
                </p>
              </div>
              <Link
                href={withFilterParam("/metrics?tab=flow", filters)}
                className="text-xs uppercase tracking-[0.2em] text-[var(--accent-2)]"
              >
                View metrics
              </Link>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-4">
              {deltas.map((delta) => (
                <Link
                  key={delta.metric}
                  href={buildExploreUrl({ metric: delta.metric, filters })}
                  data-testid="delta-tile"
                  className="group rounded-3xl border border-[var(--card-stroke)] bg-[var(--card)] p-4 transition hover:-translate-y-1 hover:shadow-lg"
                >
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                    <span>{delta.label}</span>
                    <span className={deltaAccent(delta.delta_pct)}>
                      {formatDelta(delta.delta_pct)}
                    </span>
                  </div>
                  <p className="mt-4 text-2xl font-semibold">
                    {placeholderDeltas ? "--" : formatMetricValue(delta.value, delta.unit)}
                  </p>
                  <p className="mt-3 text-xs text-[var(--ink-muted)]">
                    Open evidence
                  </p>
                </Link>
              ))}
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card-80)] p-6">
              <h2 className="font-[var(--font-display)] text-2xl">Alerts and risks</h2>
              <p className="mt-2 text-sm text-[var(--ink-muted)]">
                Short signals that deserve a quick drill-down.
              </p>
              <div className="mt-4 space-y-3 text-sm text-[var(--ink-muted)]">
                {(home?.summary ?? []).map((sentence) => (
                  <Link
                    key={sentence.id}
                    href={buildExploreUrl({ api: sentence.evidence_link, filters })}
                    className="block rounded-2xl border border-transparent bg-[var(--card-60)] px-4 py-3 transition hover:border-[var(--card-stroke)]"
                  >
                    {sentence.text}
                  </Link>
                ))}
                {!home?.summary?.length && (
                  <p className="rounded-2xl border border-dashed border-[var(--card-stroke)] bg-[var(--card-60)] px-4 py-3">
                    Summary will appear once data is ingested.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card-80)] p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-[var(--font-display)] text-xl">Recommended actions</h3>
                <Link
                  href={withFilterParam("/opportunities", filters)}
                  className="text-xs uppercase tracking-[0.2em] text-[var(--accent-2)]"
                >
                  View all
                </Link>
              </div>
              <div className="mt-4 grid gap-3">
                {home?.tiles
                  ? Object.entries(home.tiles).map(([key, tile]) => (
                      <Link
                        key={key}
                        href={withFilterParam(tile.link, filters)}
                        className="group rounded-2xl border border-[var(--card-stroke)] bg-[var(--card)] px-4 py-3 transition hover:-translate-y-1"
                      >
                        <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-muted)]">
                          {tile.title}
                        </p>
                        <p className="mt-2 text-base font-semibold text-[var(--foreground)]">
                          {tile.subtitle}
                        </p>
                        <p className="mt-3 text-xs text-[var(--ink-muted)]">
                          Evidence
                        </p>
                      </Link>
                    ))
                  : null}
                <Link
                  href={withFilterParam("/opportunities", filters)}
                  className="rounded-2xl border border-[var(--card-stroke)] bg-[var(--accent)]/15 px-4 py-3"
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                    Execute focus
                  </p>
                  <p className="mt-2 text-base font-semibold">
                    {home?.constraint.title ?? "Constraint pending"}
                  </p>
                  <p className="mt-2 text-sm text-[var(--ink-muted)]">
                    {home?.constraint.claim ?? "Capture the limiting factor."}
                  </p>
                </Link>
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card)] p-6">
              <div className="flex items-center justify-between">
                <h3 className="font-[var(--font-display)] text-xl">Focus constraint</h3>
                <Link
                  href={buildExploreUrl({ metric: "review_latency", filters })}
                  className="text-xs uppercase tracking-[0.2em] text-[var(--accent-2)]"
                >
                  Open evidence
                </Link>
              </div>
              <p className="mt-3 text-sm text-[var(--ink-muted)]">
                {home?.constraint.claim ?? "Evidence will appear once data is ingested."}
              </p>
              <div className="mt-4 space-y-3 text-sm">
                {(home?.constraint.evidence ?? []).map((item, idx) => (
                  <Link
                    key={`${item.label}-${idx}`}
                    href={buildExploreUrl({ api: item.link, filters })}
                    className="block rounded-2xl border border-[var(--card-stroke)] bg-[var(--card-70)] px-4 py-3"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs text-[var(--ink-muted)]">
                {(home?.constraint.experiments ?? []).map((experiment) => (
                  <span
                    key={experiment}
                    className="rounded-full border border-[var(--card-stroke)] bg-[var(--card-70)] px-3 py-1"
                  >
                    {experiment}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-[var(--card-stroke)] bg-[var(--card-80)] p-6">
              <div className="flex items-center justify-between">
                <h3 className="font-[var(--font-display)] text-xl">Recent events</h3>
                <Link
                  href={buildExploreUrl({ filters })}
                  className="text-xs uppercase tracking-[0.2em] text-[var(--accent-2)]"
                >
                  Open in Explore
                </Link>
              </div>
              <div className="mt-4 space-y-4 text-sm">
                {(home?.events ?? []).map((event, idx) => (
                  <Link
                    key={`${event.type}-${idx}`}
                    href={buildExploreUrl({ api: event.link, filters })}
                    className="block rounded-2xl border border-[var(--card-stroke)] bg-[var(--card)] px-4 py-3"
                  >
                    <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                      <span>{event.type}</span>
                      <span>{formatTimestamp(event.ts)}</span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--foreground)]">
                      {event.text}
                    </p>
                  </Link>
                ))}
                {!home?.events?.length && (
                  <p className="rounded-2xl border border-dashed border-[var(--card-stroke)] bg-[var(--card)] px-4 py-3 text-[var(--ink-muted)]">
                    No major shifts detected in the current window.
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <h3 className="font-[var(--font-display)] text-xl">Investment mix</h3>
              <p className="mt-2 text-sm text-[var(--ink-muted)]">
                Live work allocation preview for the current scope.
              </p>
              <div className="mt-4 flex flex-wrap gap-4 text-xs uppercase tracking-[0.2em]">
                <Link
                  href={withFilterParam("/work", filters)}
                  className="text-[var(--accent-2)]"
                >
                  Open Work view
                </Link>
                <Link
                  href={buildExploreUrl({ metric: "throughput", filters })}
                  className="text-[var(--accent-2)]"
                >
                  Open in Explore
                </Link>
              </div>
            </div>
            <InvestmentPreview filters={filters} />
          </section>
        </main>
      </div>
    </div>
  );
}
