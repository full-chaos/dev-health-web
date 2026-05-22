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
import type { ThroughputForecast, ThroughputRiskOverlay } from "@/lib/graphql/types";

type CapacityPlanningPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

const SAMPLE_FORECAST: ThroughputForecast = {
  forecastId: "sample",
  computedAt: new Date(0).toISOString(),
  teamId: "sample-team",
  backlogSize: 42,
  historyWeeks: 12,
  p50Weeks: 5,
  p75Weeks: 7,
  p90Weeks: 9,
  insufficientHistory: false,
  rollingWindows: [
    { windowWeeks: 4, meanWeeklyThroughput: 9.2, sampleCount: 57, insufficientHistory: false },
    { windowWeeks: 8, meanWeeklyThroughput: 7.8, sampleCount: 29, insufficientHistory: false },
    { windowWeeks: 12, meanWeeklyThroughput: 6.4, sampleCount: 1, insufficientHistory: false },
  ],
  primaryRisk: {
    kind: "review",
    score: 1.45,
    label: "Review bottleneck",
    value: 69.6,
    threshold: 48,
    active: true,
  },
  wipCongestion: {
    kind: "wip",
    score: 1.08,
    label: "WIP congestion",
    value: 1.35,
    threshold: 1.25,
    active: true,
  },
  reviewBottleneck: {
    kind: "review",
    score: 1.45,
    label: "Review bottleneck",
    value: 69.6,
    threshold: 48,
    active: true,
  },
  incidentLoad: {
    kind: "incident_load",
    score: 0.25,
    label: "Incident load",
    value: 0.25,
    threshold: 1,
    active: false,
  },
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseBacklog(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
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
            risk.active
              ? "bg-amber-500/15 text-amber-200"
              : "bg-emerald-500/10 text-emerald-200"
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

export default async function CapacityPlanningPage({ searchParams }: CapacityPlanningPageProps) {
  const params = (await searchParams) ?? {};
  const encodedFilter = firstParam(params.f);
  const roleParam = firstParam(params.role);
  const originParam = firstParam(params.origin);
  const workScopeId = firstParam(params.scope);
  const backlog = parseBacklog(firstParam(params.backlog));
  const activeRole = typeof roleParam === "string" ? roleParam : undefined;
  const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);
  const team = filters.scope.level === "team" ? filters.scope.ids[0] : undefined;

  const [health, session] = await Promise.all([checkApiHealth(), requireSession()]);
  if (!health.ok) return <ServiceUnavailable />;

  const orgId = session.user.org_id ?? "default-org";
  const forecast =
    team && backlog !== null
      ? await fetchOrNull(
          getThroughputForecastViaGraphQL(orgId, {
            teamId: team,
            workScopeId,
            backlogSize: backlog,
            historyWeeks: 12,
          }),
          "capacity-planning/throughput-forecast"
        )
      : null;
  const renderedForecast = forecast ?? SAMPLE_FORECAST;
  const isSample = !forecast;

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
              <h1 className="mt-2 font-(--font-display) text-3xl">
                Throughput forecast
              </h1>
              <p className="mt-2 text-sm text-(--ink-muted)">
                Forecast — not a commitment. Uses rolling 4/8/12-week throughput and risk overlays.
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

          <form className="grid gap-4 rounded-3xl border border-(--card-stroke) bg-(--card-80) p-5 md:grid-cols-[1fr_auto]">
            <label className="text-sm">
              <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-(--ink-muted)">
                Backlog items
              </span>
              <input
                name="backlog"
                type="number"
                min="0"
                defaultValue={backlog ?? ""}
                placeholder="42"
                className="w-full rounded-xl border border-(--card-stroke) bg-background px-4 py-3"
              />
            </label>
            <button className="self-end rounded-xl bg-foreground px-5 py-3 text-sm font-semibold text-background">
              Update forecast
            </button>
            {encodedFilter ? <input type="hidden" name="f" value={encodedFilter} /> : null}
            {activeRole ? <input type="hidden" name="role" value={activeRole} /> : null}
            {workScopeId ? <input type="hidden" name="scope" value={workScopeId} /> : null}
          </form>

          {isSample ? (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
              Showing sample data. Select a <strong>team</strong> in the scope bar above and set a backlog size to fetch a live forecast.
            </div>
          ) : null}

          <section className="grid gap-4 md:grid-cols-3">
            {[
              ["P50", renderedForecast.p50Weeks],
              ["P75", renderedForecast.p75Weeks],
              ["P90", renderedForecast.p90Weeks],
            ].map(([label, weeks]) => (
              <div key={label} className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6">
                <p className="text-xs uppercase tracking-[0.18em] text-(--ink-muted)">{label}</p>
                <p className="mt-3 text-3xl font-semibold">{formatWeeks(weeks as number | null)}</p>
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
                Backlog {renderedForecast.backlogSize}
              </span>
            </div>
            <VerticalBarChart
              categories={renderedForecast.rollingWindows.map((window) => `${window.windowWeeks}w`)}
              series={[
                {
                  name: "Items/week",
                  data: renderedForecast.rollingWindows.map((window) => window.meanWeeklyThroughput),
                },
              ]}
              height={300}
            />
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            <RiskCard risk={renderedForecast.wipCongestion} />
            <RiskCard risk={renderedForecast.reviewBottleneck} />
            <RiskCard risk={renderedForecast.incidentLoad} />
          </section>

          <section className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6">
            <p className="text-xs uppercase tracking-[0.18em] text-(--ink-muted)">Primary risk callout</p>
            <h2 className="mt-3 text-2xl font-semibold">{renderedForecast.primaryRisk.label}</h2>
            <p className="mt-2 text-sm text-(--ink-muted)">
              This is the most elevated current overlay for the forecast, selected from WIP congestion,
              review bottleneck, and incident load.
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
