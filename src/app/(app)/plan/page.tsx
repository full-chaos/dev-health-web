import Link from "next/link";
import { CircleCheck, TriangleAlert } from "lucide-react";

import { VerticalBarChart } from "@/components/charts/VerticalBarChart";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { InsufficientHistoryNotice } from "@/components/capacity/InsufficientHistoryNotice";
import { checkApiHealth } from "@/lib/api/system";
import { requireSession } from "@/lib/auth";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { formatNumber } from "@/lib/formatters";
import { getThroughputForecastViaGraphQL } from "@/lib/graphql/capacityFetchers";
import type { ThroughputRiskOverlay } from "@/lib/graphql/types";
import { DataState } from "@/components/ui/DataState";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";
import { CTA_LABELS } from "@/lib/design/cta";
import { withFilterParam } from "@/lib/filters/url";
import { STATUS_PILL } from "@/lib/statusPill";

type PlanPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

function firstParam(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

function formatWeeks(value: number | null | undefined) {
    return typeof value === "number"
        ? `${formatNumber(value, { maximumFractionDigits: 0 })} weeks`
        : "Not enough throughput";
}

function riskValue(risk: ThroughputRiskOverlay) {
    if (risk.kind === "review") return `${formatNumber(risk.value, { maximumFractionDigits: 1 })}h`;
    if (risk.kind === "wip") return `${formatNumber(risk.value, { maximumFractionDigits: 2 })}×`;
    if (risk.kind === "incident_load") {
        return `${formatNumber(risk.value, { maximumFractionDigits: 1 })}/week`;
    }
    return "—";
}

function RiskCard({ risk }: { risk: ThroughputRiskOverlay }) {
    const Icon = risk.active ? TriangleAlert : CircleCheck;
    return (
        <div className="rounded-(--radius-lg) border border-(--border) bg-(--surface) p-5">
            <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">{risk.label}</h3>
                <span
                    data-testid="risk-status"
                    data-active={risk.active ? "true" : "false"}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${
                        risk.active ? STATUS_PILL.caution : STATUS_PILL.positive
                    }`}
                >
                    <Icon aria-hidden="true" className="h-3 w-3" />
                    {risk.active ? "Elevated" : "Normal"}
                </span>
            </div>
            <p className="mt-4 text-3xl font-semibold">{riskValue(risk)}</p>
            <p className="mt-2 text-xs text-(--text-muted)">
                Threshold {risk.threshold > 0 ? riskValue({ ...risk, value: risk.threshold }) : "—"}
            </p>
        </div>
    );
}

function EmptyForecastState({ scopeLabel }: { scopeLabel: string }) {
    return (
        <DataState
            variant="insufficient-confidence"
            title="No forecast available"
            description={`Scope: ${scopeLabel}. Not enough throughput history to generate a forecast for this scope. Try widening the date range, selecting a different team, or syncing more work-item history.`}
            data-testid="plan-empty-forecast"
        />
    );
}

/** The sentence of the outlook card, from values already on the page. Never a promise. */
function outlookSentence(forecast: {
    backlogSize: number;
    p50Weeks?: number | null;
    p90Weeks?: number | null;
    insufficientHistory: boolean;
}) {
    const items = `${formatNumber(forecast.backlogSize)} open ${forecast.backlogSize === 1 ? "item" : "items"}`;
    const { p50Weeks, p90Weeks } = forecast;
    if (typeof p50Weeks !== "number" || typeof p90Weeks !== "number") {
        return `${items}. There is not enough throughput to suggest an outlook for this scope.`;
    }
    const provisional = forecast.insufficientHistory
        ? " This is provisional: history is limited."
        : "";
    return `${items} appear to need about ${formatNumber(p50Weeks, { maximumFractionDigits: 0 })} weeks at the median pace, and about ${formatNumber(p90Weeks, { maximumFractionDigits: 0 })} weeks at P90.${provisional}`;
}

export default async function PlanPage({ searchParams }: PlanPageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = firstParam(params.f);
    const originParam = firstParam(params.origin);
    const roleParam = firstParam(params.role);
    const workScopeId = firstParam(params.scope);
    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);
    const teamIds =
        filters.scope.level === "team" && filters.scope.ids.length > 0 ? filters.scope.ids : null;

    const [health, session] = await Promise.all([checkApiHealth(), requireSession()]);
    if (!health.ok) return <ServiceUnavailable landmark={false} />;

    const orgId = session.user.org_id ?? "default-org";
    const forecast = await fetchOrNull(
        getThroughputForecastViaGraphQL(orgId, {
            teamIds,
            workScopeId: workScopeId ?? null,
            historyWeeks: 12,
        }),
        "plan/overview/throughput-forecast",
    );

    const completionHref = withFilterParam("/plan/capacity", filters, roleParam, originParam);
    const backlogHref = withFilterParam("/plan/backlog-risk", filters, roleParam, originParam);

    const scopeLabel =
        teamIds === null
            ? "All teams"
            : teamIds.length === 1
              ? `Team ${teamIds[0]}`
              : `Teams ${teamIds.join(", ")}`;

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            <PageHeader
                title="Overview"
                subtitle="Forecast — not a commitment. Uses rolling 4/8/12-week throughput and risk overlays. Backlog and scope are derived from the filter bar."
            />

            <ScopeBar view="capacity-planning" origin={originParam} />

            {forecast ? (
                <>
                    <InsufficientHistoryNotice
                        insufficientHistory={forecast.insufficientHistory}
                        rollingWindows={forecast.rollingWindows}
                    />

                    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-(--radius-lg) border border-(--border) bg-(--surface) p-6">
                            <p className="text-xs uppercase tracking-[0.18em] text-(--text-muted)">
                                Delivery confidence
                            </p>
                            <p className="mt-3 text-3xl font-semibold">
                                {formatNumber(forecast.backlogSize)}{" "}
                                <span className="text-base font-normal text-(--text-muted)">
                                    open items
                                </span>
                            </p>
                            <p className="mt-2 text-xs text-(--text-muted)">
                                Backlog and scope count are derived from current filters — adjust
                                filters above to refocus.
                            </p>
                        </div>
                        {[
                            ["P50", forecast.p50Weeks],
                            ["P75", forecast.p75Weeks],
                            ["P90", forecast.p90Weeks],
                        ].map(([label, weeks]) => (
                            <div
                                key={label as string}
                                className={`rounded-(--radius-lg) border border-(--border) bg-(--surface) p-6 ${
                                    forecast.insufficientHistory ? "opacity-60" : ""
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs uppercase tracking-[0.18em] text-(--text-muted)">
                                        {label}
                                    </p>
                                    {forecast.insufficientHistory ? (
                                        <span
                                            className={`rounded-full border px-2 py-0.5 text-xs uppercase tracking-[0.16em] ${STATUS_PILL.caution}`}
                                        >
                                            Limited history
                                        </span>
                                    ) : null}
                                </div>
                                <p className="mt-3 text-3xl font-semibold">
                                    {formatWeeks(weeks as number | null)}
                                </p>
                                <p className="mt-2 text-xs text-(--text-muted)">
                                    Weeks to complete backlog
                                </p>
                            </div>
                        ))}
                    </section>

                    <section
                        data-testid="plan-completion-outlook"
                        className="rounded-(--radius-lg) border border-(--border) bg-(--surface) p-6"
                    >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div className="min-w-0">
                                <p className="text-xs uppercase tracking-[0.18em] text-(--text-muted)">
                                    Current snapshot
                                </p>
                                <h2 className="mt-2 text-xl font-semibold">Completion outlook</h2>
                                <p className="mt-2 text-sm text-(--text-muted)">
                                    {outlookSentence(forecast)}
                                </p>
                            </div>
                            <Link
                                href={completionHref}
                                className="rounded-full border border-(--border) px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-(--accent-2) hover:bg-(--surface-raised)"
                            >
                                {CTA_LABELS.completionForecast}
                            </Link>
                        </div>
                    </section>

                    <section className="rounded-(--radius-lg) border border-(--border) bg-(--surface) p-6">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h2 className="text-xl font-semibold">Rolling throughput</h2>
                                <p className="mt-1 text-sm text-(--text-muted)">
                                    Mean weekly completed items by historical window.
                                </p>
                            </div>
                            <span className="rounded-full bg-foreground/10 px-3 py-1 text-xs">
                                Backlog {formatNumber(forecast.backlogSize)}
                            </span>
                        </div>
                        <VerticalBarChart
                            categories={forecast.rollingWindows.map(
                                (window) => `${window.windowWeeks}w`,
                            )}
                            series={[
                                {
                                    name: "Items/week",
                                    data: forecast.rollingWindows.map(
                                        (window) => window.meanWeeklyThroughput,
                                    ),
                                },
                            ]}
                            valueFormat="number"
                            height={300}
                        />
                    </section>

                    <section className="grid gap-4 md:grid-cols-3">
                        <RiskCard risk={forecast.wipCongestion} />
                        <RiskCard risk={forecast.reviewBottleneck} />
                        <RiskCard risk={forecast.incidentLoad} />
                    </section>

                    <section
                        data-testid="plan-destinations"
                        className="rounded-(--radius-lg) border border-(--border) bg-(--surface) p-6"
                    >
                        <h2 className="text-xl font-semibold">Planning destinations</h2>
                        <p className="mt-1 text-sm text-(--text-muted)">
                            Forecast assumptions and backlog condition stay separate.
                        </p>
                        <div className="mt-4 flex flex-wrap gap-3">
                            <Link
                                href={completionHref}
                                className="rounded-full border border-(--border) px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-(--accent-2) hover:bg-(--surface-raised)"
                            >
                                {CTA_LABELS.completionForecast}
                            </Link>
                            <Link
                                href={backlogHref}
                                className="rounded-full border border-(--border) px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-(--accent-2) hover:bg-(--surface-raised)"
                            >
                                {CTA_LABELS.backlogRisk}
                            </Link>
                        </div>
                    </section>

                    <section className="rounded-(--radius-lg) border border-(--border) bg-(--surface) p-6">
                        <p className="text-xs uppercase tracking-[0.18em] text-(--text-muted)">
                            Primary risk callout
                        </p>
                        <h2 className="mt-3 text-2xl font-semibold">
                            {forecast.primaryRisk.label}
                        </h2>
                        <p className="mt-2 text-sm text-(--text-muted)">
                            This is the most elevated current overlay for the forecast, selected
                            from WIP congestion, review bottleneck, and incident load.
                        </p>
                    </section>
                </>
            ) : (
                <EmptyForecastState scopeLabel={scopeLabel} />
            )}
        </div>
    );
}
