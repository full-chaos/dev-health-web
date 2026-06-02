import Link from "next/link";

import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { HeatmapPanel } from "@/components/charts/HeatmapPanel";
import { QuadrantPanel } from "@/components/charts/QuadrantPanel";
import { FilterBar } from "@/components/filters/FilterBar";
import { MetricCard } from "@/components/metrics/MetricCard";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { getBusFactorData } from "@/lib/api/code";
import { checkApiHealth } from "@/lib/api/system";
import { getExplainData, getHomeData } from "@/lib/api/home";
import { getHeatmap, getQuadrant } from "@/lib/api/visuals";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { formatMetricValue } from "@/lib/formatters";
import { resolveEntityLabel } from "@/lib/labels/entityLabel";
import { FALLBACK_DELTAS } from "@/lib/metrics/catalog";
import type { MetricDelta } from "@/lib/types";

type CodePageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

const getMetric = (deltas: MetricDelta[], metric: string) =>
  deltas.find((item) => item.metric === metric) ??
  FALLBACK_DELTAS.find((item) => item.metric === metric);

export default async function CodePage({ searchParams }: CodePageProps) {
  const params = (await searchParams) ?? {};
  const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
  const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
  const activeRole = typeof roleParam === "string" ? roleParam : undefined;

  const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);
  const scopeId = filters.scope.ids[0] ?? "";
  const quadrantScope: "org" | "team" | "repo" | "developer" =
    filters.scope.level === "developer"
      ? "developer"
      : filters.scope.level === "team" || filters.scope.level === "repo"
        ? filters.scope.level
        : "org";

  // Run health check in parallel with all data fetches to eliminate the waterfall.
  const [health, home, churnExplain, hotspotHeatmap, churnThroughput, busFactor] =
    await Promise.all([
      checkApiHealth(),
      fetchOrNull(getHomeData(filters), "code/home-data"),
      fetchOrNull(getExplainData({ metric: "churn", filters }), "code/explain-churn"),
      fetchOrNull(
        getHeatmap({
          type: "risk",
          metric: "hotspot_risk",
          scope_type: filters.scope.level,
          scope_id: scopeId,
          range_days: filters.time.range_days,
          start_date: filters.time.start_date,
          end_date: filters.time.end_date,
        }),
        "code/hotspot-heatmap",
      ),
      fetchOrNull(
        getQuadrant({
          type: "churn_throughput",
          scope_type: quadrantScope,
          scope_id: scopeId,
          range_days: filters.time.range_days,
          bucket: "week",
          start_date: filters.time.start_date,
          end_date: filters.time.end_date,
        }),
        "code/churn-throughput-quadrant",
      ),
      fetchOrNull(getBusFactorData(filters), "code/bus-factor"),
    ]);

  if (!health.ok) {
    return <ServiceUnavailable />;
  }

  const deltas = home?.deltas?.length ? home.deltas : FALLBACK_DELTAS;
  const placeholderDeltas = !home?.deltas?.length;

  const churnMetric = getMetric(deltas, "churn");
  const hotspots = (churnExplain?.contributors ?? []).slice(0, 6);
  const hotspotHighlights = hotspots
    .slice(0, 3)
    .map((item) => resolveEntityLabel(item.id, { name: item.label }).label);
  const hotspotSummary = hotspotHighlights.length
    ? `Leading hotspots: ${hotspotHighlights.join(", ")}. Higher values lean toward concentrated change and ownership load — open a cell to trace the files, PRs, and commits behind it.`
    : undefined;
  const hasBusFactorEvidence = (busFactor?.evidenceSampleCount ?? 0) > 0;
  const topMaintainers = (busFactor?.topMaintainers ?? []).slice(0, 5);
  const riskyRepos = (busFactor?.repos ?? [])
    .toSorted(
      (left, right) => left.value - right.value || left.repoName.localeCompare(right.repoName),
    )
    .slice(0, 10);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="code" role={activeRole} />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">Code</p>
              <h1 className="mt-2 font-(--font-display) text-3xl">Churn and Ownership</h1>
              <p className="mt-2 text-sm text-(--ink-muted)">
                Hotspots and ownership concentration in the selected window.
              </p>
              <p className="mt-2 text-sm text-(--ink-muted)">Open a card to investigate.</p>
            </div>
            <Link
              href={withFilterParam("/", filters, activeRole)}
              className="rounded-full border border-(--card-stroke) px-4 py-2 text-xs uppercase tracking-[0.2em]"
            >
              Back to cockpit
            </Link>
          </header>

          <FilterBar view="code" />

          <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <MetricCard
              label={churnMetric?.label ?? "Code Churn"}
              href={buildExploreUrl({
                metric: "churn",
                filters,
                role: activeRole,
              })}
              value={placeholderDeltas ? undefined : churnMetric?.value}
              unit={churnMetric?.unit}
              delta={placeholderDeltas ? undefined : churnMetric?.delta_pct}
              spark={churnMetric?.spark}
              caption="Churn over the active window"
            />
            <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-(--font-display) text-xl">Ownership Patterns</h2>
                <span className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                  Manual
                </span>
              </div>
              <p className="mt-3 text-sm text-(--ink-muted)">
                Ownership concentration shows who carries the most-changed code in this view.
              </p>
              <div className="mt-4 rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) px-4 py-3 text-sm text-(--ink-muted)">
                Connect a Git provider with commit history to surface ownership concentration here.
              </div>
            </div>
          </section>

          <section>
            <HeatmapPanel
              title="Hotspot concentration"
              description="Where churn and ownership load accumulate over time."
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
              emptyState="Hotspot heatmap unavailable."
              evidenceTitle="Hotspot evidence"
              defaultSummary={hotspotSummary}
              flatStateLabel="No hotspot variance in this window — churn is evenly spread, so no single area stands out yet."
            />
          </section>

          <section>
            <QuadrantPanel
              title="Churn × Throughput landscape"
              description="Operating modes under change volume and delivery pace."
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
            <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-(--font-display) text-xl">Hotspots</h2>
                <Link
                  href={buildExploreUrl({
                    metric: "ownership",
                    filters,
                    role: activeRole,
                  })}
                  className="text-xs uppercase tracking-[0.2em] text-(--accent-2)"
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
                        href={buildExploreUrl({
                          api: item.evidence_link,
                          filters,
                          role: activeRole,
                        })}
                        className="flex items-center justify-between rounded-2xl border border-(--card-stroke) bg-(--card-70) px-4 py-2"
                      >
                        <span>{item.label}</span>
                        <span className="text-xs text-(--ink-muted)">
                          {churnExplain ? formatMetricValue(item.value, churnExplain.unit) : "--"}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-(--ink-muted)">
                  Hotspot detail will appear once data is ingested.
                </p>
              )}
            </div>

            <div className="rounded-3xl border border-(--card-stroke) bg-(--card) p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-(--font-display) text-xl">Bus Factor</h2>
                <Link
                  href={buildExploreUrl({
                    metric: "churn",
                    filters,
                    role: activeRole,
                  })}
                  className="text-xs uppercase tracking-[0.2em] text-(--accent-2)"
                >
                  Explore
                </Link>
              </div>
              <p className="mt-3 text-sm text-(--ink-muted)">
                Small values suggest fewer people account for most recent code churn.
              </p>
              {hasBusFactorEvidence ? (
                <div className="mt-4 space-y-4 text-sm">
                  <div className="rounded-2xl border border-(--card-stroke) bg-(--card-70) px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                      Scope-wide bus factor
                    </p>
                    <p className="mt-2 font-(--font-display) text-4xl">{busFactor?.value ?? 0}</p>
                    <p className="mt-1 text-xs text-(--ink-muted)">
                      {busFactor?.evidenceSampleCount ?? 0} file-change samples
                    </p>
                  </div>

                  <div>
                    <h3 className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                      Maintainer concentration
                    </h3>
                    <div className="mt-2 space-y-2">
                      {topMaintainers.map((maintainer) => (
                        <div
                          key={maintainer.author}
                          className="flex items-center justify-between rounded-2xl border border-(--card-stroke) bg-(--card-70) px-4 py-2"
                        >
                          <span className="truncate pr-4">{maintainer.author}</span>
                          <span className="shrink-0 text-xs text-(--ink-muted)">
                            {maintainer.sharePercent.toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {riskyRepos.length ? (
                    <div>
                      <h3 className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                        Repository detail
                      </h3>
                      <div className="mt-2 space-y-2">
                        {riskyRepos.map((repo) => (
                          <div
                            key={repo.repoId}
                            className="rounded-2xl border border-(--card-stroke) bg-(--card-70) px-4 py-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-medium">{repo.repoName}</span>
                              <span className="rounded-full bg-(--accent-soft) px-2 py-1 text-xs text-(--accent)">
                                BF {repo.value}
                              </span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {repo.topMaintainers.length ? (
                                repo.topMaintainers.slice(0, 3).map((maintainer) => (
                                  <span
                                    key={`${repo.repoId}-${maintainer.author}`}
                                    className="rounded-full border border-(--card-stroke) px-2 py-1 text-xs text-(--ink-muted)"
                                  >
                                    {maintainer.author} · {maintainer.sharePercent.toFixed(1)}%
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs text-(--ink-muted)">
                                  No maintainer evidence
                                </span>
                              )}
                            </div>
                            <p className="mt-2 text-xs text-(--ink-muted)">
                              {repo.evidenceSampleCount} samples
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-4 space-y-2 text-sm">
                  <div className="rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) px-4 py-3 text-(--ink-muted)">
                    Connect a Git provider with commit history to surface bus-factor risk for this
                    view.
                  </div>
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
