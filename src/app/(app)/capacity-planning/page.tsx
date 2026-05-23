import Link from "next/link";

import { VerticalBarChart } from "@/components/charts/VerticalBarChart";
import { FilterBar } from "@/components/filters/FilterBar";
import { ContextStrip } from "@/components/navigation/ContextStrip";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { requireSession } from "@/lib/auth";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";
import { getThroughputForecastViaGraphQL } from "@/lib/graphql/capacityFetchers";
import type { ThroughputRiskOverlay } from "@/lib/graphql/types";

type CapacityPlanningPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatWeeks(value: number | null | undefined) {
  return typeof value === "number" ? `${value} weeks` : "Not enough throughput";
}

function riskValue(risk: ThroughputRiskOverlay) {
  if (risk.kind === "review") return `${risk.value.toFixed(1)}h`;
  if (risk.kind === "wip") return `${risk.value.toFixed(2)}×`;
  if (risk.kind === "incident_load") return `${risk.value.toFixed(1)}/week`;
  return "—";
}

function RiskCard({ risk }: { risk: ThroughputRiskOverlay }) {
  return (
    <div className="rounded-2xl border border-(--card-stroke) bg-(--card-80) p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{risk.label}</h3>
        <span
          className={`rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${
            risk.active ? "bg-amber-500/15 text-amber-200" : "bg-emerald-500/10 text-emerald-200"
          }`}
        >
          {risk.active ? "Elevated" : "Normal"}
        </span>
      </div>
      <p className="mt-4 text-3xl font-semibold">{riskValue(risk)}</p>
      <p className="mt-2 text-xs text-(--ink-muted)">
        Threshold {risk.threshold > 0 ? riskValue({ ...risk, value: risk.threshold }) : "—"}
      </p>
    </div>
  );
}

function EmptyForecastState({ scopeLabel }: { scopeLabel: string }) {
  return (
    <section className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-8">
      <h2 className="text-xl font-semibold">No forecast available</h2>
      <p className="mt-2 text-sm text-(--ink-muted)">
        Scope: <span className="text-foreground">{scopeLabel}</span>
      </p>
      <p className="mt-4 text-sm text-(--ink-muted)">
        Not enough throughput history to generate a forecast for this scope. Try widening the date
        range, selecting a different team, or syncing more work-item history.
      </p>
    </section>
  );
}

export default async function CapacityPlanningPage({ searchParams }: CapacityPlanningPageProps) {
  const params = (await searchParams) ?? {};
  const encodedFilter = firstParam(params.f);
  const roleParam = firstParam(params.role);
  const originParam = firstParam(params.origin);
  const workScopeId = firstParam(params.scope);
  const activeRole = typeof roleParam === "string" ? roleParam : undefined;
  const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);
  const team = filters.scope.level === "team" ? filters.scope.ids[0] : undefined;

  const [health, session] = await Promise.all([checkApiHealth(), requireSession()]);
  if (!health.ok) return <ServiceUnavailable />;

  const orgId = session.user.org_id ?? "default-org";
  // CHAOS-1783: always fetch. When team is undefined the resolver aggregates
  // org-wide; when backlogSize is omitted the resolver derives it from the
  // latest work_item_metrics_daily rows. No more SAMPLE_FORECAST.
  const forecast = await fetchOrNull(
    getThroughputForecastViaGraphQL(orgId, {
      teamId: team ?? null,
      workScopeId: workScopeId ?? null,
      historyWeeks: 12,
    }),
    "capacity-planning/throughput-forecast",
  );

  const scopeLabel = team ? `Team ${team}` : "All teams";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="capacity-planning" role={activeRole} />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                Capacity planning
              </p>
              <h1 className="mt-2 font-(--font-display) text-3xl">Throughput forecast</h1>
              <p className="mt-2 text-sm text-(--ink-muted)">
                Forecast — not a commitment. Uses rolling 4/8/12-week throughput and risk overlays.
                Backlog and scope are derived from the filter bar.
              </p>
            </div>
            <Link
              href={withFilterParam("/capacity", filters, activeRole)}
              className="rounded-full border border-(--card-stroke) px-4 py-2 text-xs uppercase tracking-[0.2em]"
            >
              Monte Carlo view
            </Link>
          </header>

          <FilterBar view="capacity-planning" />

          <ContextStrip filters={filters} origin={originParam} />

          {forecast ? (
            <>
              <section className="grid gap-4 rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6 md:grid-cols-[auto_1fr]">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-(--ink-muted)">Backlog</p>
                  <p className="mt-2 text-3xl font-semibold">
                    {forecast.backlogSize}{" "}
                    <span className="text-base font-normal text-(--ink-muted)">open items</span>
                  </p>
                </div>
                <div className="self-center text-xs text-(--ink-muted) md:text-right">
                  Derived from current filter scope — adjust filters above to refocus.
                </div>
              </section>

              <section className="grid gap-4 md:grid-cols-3">
                {[
                  ["P50", forecast.p50Weeks],
                  ["P75", forecast.p75Weeks],
                  ["P90", forecast.p90Weeks],
                ].map(([label, weeks]) => (
                  <div
                    key={label as string}
                    className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6"
                  >
                    <p className="text-xs uppercase tracking-[0.18em] text-(--ink-muted)">
                      {label}
                    </p>
                    <p className="mt-3 text-3xl font-semibold">
                      {formatWeeks(weeks as number | null)}
                    </p>
                    <p className="mt-2 text-xs text-(--ink-muted)">Weeks to complete backlog</p>
                  </div>
                ))}
              </section>

              <section className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">Rolling throughput</h2>
                    <p className="mt-1 text-sm text-(--ink-muted)">
                      Mean weekly completed items by historical window.
                    </p>
                  </div>
                  <span className="rounded-full bg-foreground/10 px-3 py-1 text-xs">
                    Backlog {forecast.backlogSize}
                  </span>
                </div>
                <VerticalBarChart
                  categories={forecast.rollingWindows.map((window) => `${window.windowWeeks}w`)}
                  series={[
                    {
                      name: "Items/week",
                      data: forecast.rollingWindows.map((window) => window.meanWeeklyThroughput),
                    },
                  ]}
                  height={300}
                />
              </section>

              <section className="grid gap-4 md:grid-cols-3">
                <RiskCard risk={forecast.wipCongestion} />
                <RiskCard risk={forecast.reviewBottleneck} />
                <RiskCard risk={forecast.incidentLoad} />
              </section>

              <section className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6">
                <p className="text-xs uppercase tracking-[0.18em] text-(--ink-muted)">
                  Primary risk callout
                </p>
                <h2 className="mt-3 text-2xl font-semibold">{forecast.primaryRisk.label}</h2>
                <p className="mt-2 text-sm text-(--ink-muted)">
                  This is the most elevated current overlay for the forecast, selected from WIP
                  congestion, review bottleneck, and incident load.
                </p>
              </section>
            </>
          ) : (
            <EmptyForecastState scopeLabel={scopeLabel} />
          )}
        </main>
      </div>
    </div>
  );
}
