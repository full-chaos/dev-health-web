/**
 * /bottleneck — Delivery Bottleneck Summary (CHAOS-1742).
 *
 * RSC entry. Pre-fetches WIP saturation + review latency data and renders
 * KPI tiles, WIP × Throughput quadrant, Review Load × Latency quadrant,
 * review wait density heatmap, and the WIP/blocked evidence panel.
 *
 * Mirrors the structure of /work (work/page.tsx) and /risk/compounding.
 */

import Link from "next/link";

import { FilterBar } from "@/components/filters/FilterBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { ContextStrip } from "@/components/navigation/ContextStrip";
import { QuadrantPanel } from "@/components/charts/QuadrantPanel";
import { HeatmapPanel } from "@/components/charts/HeatmapPanel";
import { EvidenceView } from "@/components/work/EvidenceView";
import { MetricCard } from "@/components/metrics/MetricCard";
import { checkApiHealth } from "@/lib/api/system";
import { getExplainData, getHomeData } from "@/lib/api/home";
import { getHeatmap, getQuadrant } from "@/lib/api/visuals";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { FALLBACK_DELTAS } from "@/lib/metrics/catalog";
import { fetchOrNull } from "@/lib/fetchOrNull";

type BottleneckPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function BottleneckPage({
  searchParams,
}: BottleneckPageProps) {
  const params = (await searchParams) ?? {};
  const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
  const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
  const originParam = Array.isArray(params.origin)
    ? params.origin[0]
    : params.origin;

  const activeRole = typeof roleParam === "string" ? roleParam : undefined;
  const activeOrigin =
    typeof originParam === "string" ? originParam : undefined;

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

  const [
    health,
    home,
    wipExplain,
    blockedExplain,
    wipQuadrant,
    reviewQuadrant,
    reviewHeatmap,
  ] = await Promise.all([
    checkApiHealth(),
    fetchOrNull(getHomeData(filters), "bottleneck/home-data"),
    fetchOrNull(
      getExplainData({ metric: "wip_saturation", filters }),
      "bottleneck/explain-wip_saturation",
    ),
    fetchOrNull(
      getExplainData({ metric: "blocked_work", filters }),
      "bottleneck/explain-blocked_work",
    ),
    fetchOrNull(
      getQuadrant({
        type: "wip_throughput",
        scope_type: quadrantScope,
        scope_id: scopeId,
        range_days: filters.time.range_days,
        bucket: "week",
        start_date: filters.time.start_date,
        end_date: filters.time.end_date,
      }),
      "bottleneck/wip-throughput-quadrant",
    ),
    fetchOrNull(
      getQuadrant({
        type: "review_load_latency",
        scope_type: quadrantScope,
        scope_id: scopeId,
        range_days: filters.time.range_days,
        bucket: "week",
        start_date: filters.time.start_date,
        end_date: filters.time.end_date,
      }),
      "bottleneck/review-load-latency-quadrant",
    ),
    fetchOrNull(
      getHeatmap({
        type: "temporal_load",
        metric: "review_wait_density",
        scope_type: filters.scope.level,
        scope_id: scopeId,
        range_days: filters.time.range_days,
        start_date: filters.time.start_date,
        end_date: filters.time.end_date,
      }),
      "bottleneck/review-heatmap",
    ),
  ]);

  if (!health.ok) {
    return <ServiceUnavailable />;
  }

  const deltas = home?.deltas?.length ? home.deltas : FALLBACK_DELTAS;
  const placeholderDeltas = !home?.deltas?.length;

  const getMetric = (metric: string) =>
    deltas.find((item) => item.metric === metric);

  const wipMetric = getMetric("wip_saturation");
  const blockedMetric = getMetric("blocked_work");
  const reviewLatencyMetric = getMetric("review_latency");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="bottleneck" role={activeRole} />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                Bottlenecks
              </p>
              <h1 className="mt-2 font-(--font-display) text-3xl">
                Delivery Bottleneck Summary
              </h1>
              <p className="mt-2 text-sm text-(--ink-muted)">
                WIP saturation, review latency, and blocked work in one view.
              </p>
              <p className="mt-2 text-sm text-(--ink-muted)">
                Where work is piling up and review is slowing delivery.
              </p>
            </div>
            <Link
              href={withFilterParam("/", filters, activeRole)}
              className="rounded-full border border-(--card-stroke) px-4 py-2 text-xs uppercase tracking-[0.2em]"
            >
              Back to cockpit
            </Link>
          </header>

          <FilterBar view="work" />

          <ContextStrip filters={filters} origin={activeOrigin} />

          {/* KPI tiles */}
          <section className="grid gap-4 lg:grid-cols-3">
            <MetricCard
              label={wipMetric?.label ?? "WIP Saturation"}
              href={buildExploreUrl({
                metric: "wip_saturation",
                filters,
                role: activeRole,
              })}
              value={placeholderDeltas ? undefined : wipMetric?.value}
              unit={wipMetric?.unit}
              delta={placeholderDeltas ? undefined : wipMetric?.delta_pct}
              spark={wipMetric?.spark}
              caption="Work in progress"
            />
            <MetricCard
              label={blockedMetric?.label ?? "Blocked Work"}
              href={buildExploreUrl({
                metric: "blocked_work",
                filters,
                role: activeRole,
              })}
              value={placeholderDeltas ? undefined : blockedMetric?.value}
              unit={blockedMetric?.unit}
              delta={placeholderDeltas ? undefined : blockedMetric?.delta_pct}
              spark={blockedMetric?.spark}
              caption="Blocked items"
            />
            <MetricCard
              label={reviewLatencyMetric?.label ?? "Review Latency"}
              href={buildExploreUrl({
                metric: "review_latency",
                filters,
                role: activeRole,
              })}
              value={
                placeholderDeltas ? undefined : reviewLatencyMetric?.value
              }
              unit={reviewLatencyMetric?.unit}
              delta={
                placeholderDeltas ? undefined : reviewLatencyMetric?.delta_pct
              }
              spark={reviewLatencyMetric?.spark}
              caption="Time to first review"
            />
          </section>

          {/* Quadrant panels */}
          <section className="grid gap-6">
            <QuadrantPanel
              title="WIP × Throughput"
              description="Operating modes under work in flight and delivery pace."
              data={wipQuadrant}
              filters={filters}
              relatedLinks={[
                {
                  label: "Explore work",
                  href: withFilterParam("/work", filters, activeRole),
                },
              ]}
              emptyState="WIP saturation data will appear once work items are ingested."
            />
            <QuadrantPanel
              title="Review Load × Review Latency"
              description="Operating modes under review demand and turnaround."
              data={reviewQuadrant}
              filters={filters}
              relatedLinks={[
                {
                  label: "Explore work",
                  href: withFilterParam("/work", filters, activeRole),
                },
              ]}
              emptyState="Review load data will appear once PR data is ingested."
            />
          </section>

          {/* Review wait density heatmap */}
          <HeatmapPanel
            title="Review wait density"
            description="Find the hours and weekdays where PRs accumulate review wait time."
            request={{
              type: "temporal_load",
              metric: "review_wait_density",
              scope_type: filters.scope.level,
              scope_id: scopeId,
              range_days: filters.time.range_days,
              start_date: filters.time.start_date,
              end_date: filters.time.end_date,
            }}
            initialData={reviewHeatmap}
            emptyState="Review wait heatmap will appear once PR data is ingested."
            evidenceTitle="PR evidence"
          />

          {/* WIP and blocked work evidence panel */}
          <EvidenceView
            filters={filters}
            activeRole={activeRole}
            wipExplain={wipExplain}
            blockedExplain={blockedExplain}
          />
        </main>
      </div>
    </div>
  );
}
