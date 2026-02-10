import Link from "next/link";

import { BackendBanner } from "@/components/home/BackendBanner";
import { CockpitClient } from "@/components/home/CockpitClient";
import { InvestmentPreview } from "@/components/home/InvestmentPreview";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { FilterBar } from "@/components/filters/FilterBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { RoleSelectorWithSuspense, RoleFraming } from "@/components/RoleSelectorWrapper";
import { checkApiHealth, getApiMeta, getHomeData } from "@/lib/api";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import { ClientTimestamp } from "@/components/ClientTimestamp";
import { FALLBACK_DELTAS } from "@/lib/metrics/catalog";
import { getRoleConfig, isValidRole, DEFAULT_ROLE } from "@/lib/roleContext";
import type { HomeResponse } from "@/lib/types";

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
    description: "Idea to merge insight.",
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

  const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
  const activeRole = isValidRole(roleParam) ? roleParam : DEFAULT_ROLE;
  const roleConfig = getRoleConfig(activeRole);

  const [home, meta] = await Promise.all([loadHome(filters), getApiMeta()]);
  const lastIngestedAt = home?.freshness.last_ingested_at ?? null;
  const rawDeltas = home?.deltas?.length ? home.deltas : FALLBACK_DELTAS;
  const placeholderDeltas = !home?.deltas?.length;
  // Reorder Monitoring Views based on role
  const viewPriority: Record<string, string[]> = {
    ic: ["flow", "quality", "throughput", "dora"],
    em: ["flow", "throughput", "dora", "quality"],
    pm: ["quality", "flow", "throughput", "dora"],
    leadership: ["quality", "throughput", "dora", "flow"],
  };
  const prioritizedViews = [...MONITORING_VIEWS].sort((a, b) => {
    const priority = viewPriority[activeRole] || viewPriority.ic;
    return priority.indexOf(a.id) - priority.indexOf(b.id);
  });

  // Reorder key shifts (deltas) based on role investigationOrder
  const metricTypeMap: Record<string, string> = {
    review: "review_latency",
    cycle: "cycle_time",
    wip: "wip",
    churn: "churn",
    investment: "throughput",
  };
  const prioritizedDeltas = [...rawDeltas].sort((a, b) => {
    const order = roleConfig.investigationOrder.map(t => metricTypeMap[t] || t);
    const indexA = order.indexOf(a.metric);
    const indexB = order.indexOf(b.metric);
    if (indexA === -1 && indexB === -1) return 0;
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  return (
    <div className="min-h-screen bg-(image:--hero-gradient) text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-20 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="home" role={activeRole} />
        <main className="flex min-w-0 flex-1 flex-col gap-10">
          <header className="rounded-[32px] border border-(--card-stroke) bg-(--card-80) p-6 shadow-[0_20px_60px_-40px_rgba(0,0,0,0.4)]">
            <div className="flex flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.4em] text-(--ink-muted)">
                    Status
                  </p>
                  <div className="mt-4">
                    <RoleSelectorWithSuspense />
                  </div>
                  <h1 className="mt-6 font-(--font-display) text-3xl leading-tight sm:text-4xl">
                    Developer Health Ops Cockpit
                  </h1>
                  <RoleFraming />
                  <p className="mt-3 max-w-xl text-sm text-(--ink-muted)">
                    System patterns over the last {filters.time.range_days} days.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="rounded-full border border-(--card-stroke) bg-(--card-70) px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em]">
                    {filters.scope.level} scope
                  </div>
                  <div className="rounded-full border border-(--card-stroke) bg-(--card-70) px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em]">
                    {filters.time.range_days}d view
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <BackendBanner meta={meta} />
                <p className="text-sm text-(--ink-muted)">
                  <ClientTimestamp value={lastIngestedAt} prefix="Last updated: " />
                </p>
              </div>
            </div>
          </header>

          <FilterBar view="home" />

          {/* Minimal freshness indicator only — no integration status UI */}

          <section className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-(--ink-muted)">
                  Monitoring views
                </p>
                <p className="mt-1 text-sm text-(--ink-muted)">
                  Tabs for steady trend monitoring.
                </p>
              </div>
              <Link
                href={withFilterParam("/metrics?tab=dora", filters, activeRole)}
                className="text-xs uppercase tracking-[0.2em] text-(--accent-2)"
              >
                Open metrics
              </Link>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {prioritizedViews.map((view) => (
                <Link
                  key={view.id}
                  href={withFilterParam(view.href, filters, activeRole)}
                  className="group rounded-2xl border border-(--card-stroke) bg-(--card) px-4 py-3 transition hover:-translate-y-1"
                >
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                    <span>{view.label}</span>
                    <span className="text-(--accent-2)">Open</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-foreground">
                    {view.description}
                  </p>
                  <p className="mt-2 text-xs text-(--ink-muted)">
                    {view.focus}
                  </p>
                </Link>
              ))}
            </div>
          </section>

          <CockpitClient
            home={home}
            filters={filters}
            activeRole={activeRole}
            prioritizedDeltas={prioritizedDeltas}
            placeholderDeltas={placeholderDeltas}
          />

          <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <h3 className="font-(--font-display) text-xl">Investment mix</h3>
              <p className="mt-2 text-sm text-(--ink-muted)">
                Work allocation snapshot for the selected window.
              </p>
              <div className="mt-4 flex flex-wrap gap-4 text-xs uppercase tracking-[0.2em]">
                <Link
                  href={withFilterParam("/work", filters, activeRole)}
                  className="text-(--accent-2)"
                >
                  Open Work view
                </Link>
                <Link
                  href={buildExploreUrl({ metric: "throughput", filters, role: activeRole })}
                  className="text-(--accent-2)"
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
