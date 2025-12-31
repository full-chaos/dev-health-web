import Link from "next/link";

import { FilterBar } from "@/components/filters/FilterBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import {
  checkApiHealth,
  getExplainData,
  getHeatmap,
  getHomeData,
  getInvestment,
  getQuadrant,
} from "@/lib/api";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";
import { FALLBACK_DELTAS } from "@/lib/metrics/catalog";
import { mapInvestmentToNestedPie } from "@/lib/mappers";
import { LandscapeView } from "@/components/work/LandscapeView";
import { HeatmapView } from "@/components/work/HeatmapView";
import { reviewHeatmapSample } from "@/data/devHealthOpsSample";
import { FlowView } from "@/components/work/FlowView";
import { FlameView } from "@/components/work/FlameView";
import { EvidenceView } from "@/components/work/EvidenceView";
import { ContextStrip } from "@/components/navigation/ContextStrip";
import { WorkTabNav, type WorkTab } from "@/components/navigation/WorkTabNav";

type WorkPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};


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
  const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
  const originParam = Array.isArray(params.origin) ? params.origin[0] : params.origin;
  const activeRole = typeof roleParam === "string" ? roleParam : undefined;
  const activeOrigin = typeof originParam === "string" ? originParam : undefined;

  const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const activeTab: WorkTab = (typeof tabParam === "string" && ["landscape", "heatmap", "flow", "flame", "evidence"].includes(tabParam))
    ? (tabParam as WorkTab)
    : "landscape";

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

  const investment = await getInvestment(filters).catch(() => null);
  const nested = investment ? mapInvestmentToNestedPie(investment) : { categories: [], subtypes: [] };


  const wipExplain = await getExplainData({ metric: "wip_saturation", filters }).catch(() => null);
  const blockedExplain = await getExplainData({ metric: "blocked_work", filters }).catch(() => null);
  let reviewHeatmap = await getHeatmap({
    type: "temporal_load",
    metric: "review_wait_density",
    scope_type: filters.scope.level,
    scope_id: scopeId,
    range_days: filters.time.range_days,
    start_date: filters.time.start_date,
    end_date: filters.time.end_date,
  }).catch(() => null);

  // In test/dev mode provide sample heatmap data so client views render predictably
  // (Playwright sets DEV_HEALTH_TEST_MODE when running the dev server).
  if (process.env.DEV_HEALTH_TEST_MODE === "true" && !reviewHeatmap) {
    // cast to any to avoid importing types here
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    reviewHeatmap = reviewHeatmapSample;
  }
  const cycleThroughput = await getQuadrant({
    type: "cycle_throughput",
    scope_type: quadrantScope,
    scope_id: scopeId,
    range_days: filters.time.range_days,
    bucket: "week",
    start_date: filters.time.start_date,
    end_date: filters.time.end_date,
  }).catch(() => null);
  const wipThroughput = await getQuadrant({
    type: "wip_throughput",
    scope_type: quadrantScope,
    scope_id: scopeId,
    range_days: filters.time.range_days,
    bucket: "week",
    start_date: filters.time.start_date,
    end_date: filters.time.end_date,
  }).catch(() => null);
  const reviewLoadLatency = await getQuadrant({
    type: "review_load_latency",
    scope_type: quadrantScope,
    scope_id: scopeId,
    range_days: filters.time.range_days,
    bucket: "week",
    start_date: filters.time.start_date,
    end_date: filters.time.end_date,
  }).catch(() => null);

  const planned = investment
    ? (findCategory(investment.categories, ["planned", "roadmap", "feature"]) ?? null)
    : null;
  const unplanned = investment
    ? (findCategory(investment.categories, [
      "unplanned",
      "interrupt",
      "incident",
      "support",
      "ops",
      "run",
    ]) ?? null)
    : null;
  const plannedTotal = planned && unplanned ? planned.value + unplanned.value : 0;
  const plannedPct = plannedTotal ? (planned?.value ?? 0) / plannedTotal : null;
  const unplannedPct = plannedTotal ? (unplanned?.value ?? 0) / plannedTotal : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="work" role={activeRole} />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-(--ink-muted)">
                Work
              </p>
              <h1 className="mt-2 font-(--font-display) text-3xl">
                Work Investment and Flow
              </h1>
              <p className="mt-2 text-sm text-(--ink-muted)">
                Work allocation, WIP pressure, and blocked effort.
              </p>
              <p className="mt-2 text-sm text-(--ink-muted)">
                Select a tab to investigate.
              </p>
            </div>
            <Link
              href={withFilterParam("/", filters, activeRole)}
              className="rounded-full border border-(--card-stroke) px-4 py-2 text-xs uppercase tracking-[0.2em]"
            >
              Re-orient in cockpit
            </Link>
          </header>

          <FilterBar view="work" />

          <WorkTabNav activeTab={activeTab} filters={filters} role={activeRole} />

          <ContextStrip filters={filters} origin={activeOrigin} />

          {activeTab === "landscape" && (
            <LandscapeView
              filters={filters}
              activeRole={activeRole}
              deltas={deltas}
              placeholderDeltas={placeholderDeltas}
              investment={investment}
              nested={nested}
              cycleThroughput={cycleThroughput}
              wipThroughput={wipThroughput}
              reviewLoadLatency={reviewLoadLatency}
              planned={planned}
              unplanned={unplanned}
              plannedPct={plannedPct}
              unplannedPct={unplannedPct}
            />
          )}

          {activeTab === "heatmap" && (
            <HeatmapView
              filters={filters}
              scopeId={scopeId}
              reviewHeatmap={reviewHeatmap}
            />
          )}

          {activeTab === "flow" && (
            <FlowView
              filters={filters}
              activeRole={activeRole}
            />
          )}

          {activeTab === "flame" && (
            <FlameView
              filters={filters}
            />
          )}

          {activeTab === "evidence" && (
            <EvidenceView
              filters={filters}
              activeRole={activeRole}
              wipExplain={wipExplain}
              blockedExplain={blockedExplain}
            />
          )}
        </main>
      </div>
    </div>
  );
}
