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
        : "—";
}

function riskValue(risk: ThroughputRiskOverlay) {
    if (risk.kind === "review") return `${formatNumber(risk.value, { maximumFractionDigits: 1 })}h`;
    if (risk.kind === "wip") return `${formatNumber(risk.value, { maximumFractionDigits: 2 })}×`;
    if (risk.kind === "incident_load") {
        return `${formatNumber(risk.value, { maximumFractionDigits: 1 })}/week`;
    }
    return "—";
}

function RiskRow({ risk }: { risk: ThroughputRiskOverlay }) {
    const Icon = risk.active ? TriangleAlert : CircleCheck;
    return (
        <div
            data-testid="risk-row"
            className="flex flex-wrap items-center justify-between gap-3 border-t border-(--border) py-4 first:border-t-0 first:pt-0"
        >
            <div className="min-w-0">
                <h3 className="text-sm font-semibold">{risk.label}</h3>
                <p className="mt-1 text-xs text-(--text-muted)">
                    Threshold{" "}
                    {risk.threshold > 0 ? riskValue({ ...risk, value: risk.threshold }) : "—"}
                </p>
            </div>
            <div className="flex items-center gap-3">
                <p className="text-2xl font-semibold">{riskValue(risk)}</p>
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
        </div>
    );
}

function EmptyForecastState({ scopeLabel }: { scopeLabel: string | null }) {
    // A team scope has no label here: the scope bar already shows it, and a raw
    // team id is not customer copy.
    const scope = scopeLabel ? `Scope: ${scopeLabel}. ` : "";
    return (
        <DataState
            variant="insufficient-confidence"
            title="No forecast available"
            description={`${scope}Not enough throughput history to generate a forecast for this scope. Try widening the date range, selecting a different team, or syncing more work-item history.`}
            data-testid="plan-empty-forecast"
        />
    );
}

type OutlookForecast = {
    backlogSize: number;
    p50Weeks?: number | null;
    insufficientHistory: boolean;
};

const weeksLabel = (value: number) =>
    `${formatNumber(value, { maximumFractionDigits: 0 })} ${Math.round(value) === 1 ? "week" : "weeks"}`;

/** Headline of the outlook card, from values already on the page. */
function outlookHeadline(forecast: OutlookForecast) {
    const items = `${formatNumber(forecast.backlogSize)} ${forecast.backlogSize === 1 ? "item" : "items"}`;
    return typeof forecast.p50Weeks === "number"
        ? `${items} · about ${weeksLabel(forecast.p50Weeks)} at P50`
        : items;
}

/** The sentence of the outlook card. Never a promise; no number without throughput. */
function outlookSentence(forecast: OutlookForecast) {
    if (typeof forecast.p50Weeks !== "number") {
        return "Not enough throughput history to suggest a completion range.";
    }
    const provisional = forecast.insufficientHistory
        ? " This is provisional: history is limited."
        : "";
    return `At recent throughput, the open items appear to take about ${weeksLabel(forecast.p50Weeks)} (P50).${provisional}`;
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

    const scopeLabel = teamIds === null ? "All teams" : null;

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
                                Open items
                            </p>
                            <p className="mt-3 text-3xl font-semibold">
                                {formatNumber(forecast.backlogSize)}
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
                                data-testid="percentile-tile"
                                className="rounded-(--radius-lg) border border-(--border) bg-(--surface) p-6"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs uppercase tracking-[0.18em] text-(--text-muted)">
                                        {label}
                                    </p>
                                    {forecast.insufficientHistory ? (
                                        <span
                                            data-testid="limited-history-pill"
                                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs uppercase tracking-[0.16em] ${STATUS_PILL.caution}`}
                                        >
                                            <TriangleAlert aria-hidden="true" className="h-3 w-3" />
                                            Limited history
                                        </span>
                                    ) : null}
                                </div>
                                <p className="mt-3 text-3xl font-semibold">
                                    {formatWeeks(weeks as number | null)}
                                </p>
                                <p className="mt-2 text-xs text-(--text-muted)">
                                    {typeof weeks === "number"
                                        ? "Weeks to complete backlog"
                                        : "Not enough throughput"}
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
                                <h2 className="text-xl font-semibold">Completion outlook</h2>
                                <p className="mt-3 text-xs uppercase tracking-[0.18em] text-(--text-muted)">
                                    Current snapshot
                                </p>
                                <p
                                    data-testid="outlook-headline"
                                    className="mt-1 text-2xl font-semibold"
                                >
                                    {outlookHeadline(forecast)}
                                </p>
                                <p className="mt-2 text-sm text-(--text-muted)">
                                    {outlookSentence(forecast)}
                                </p>
                                <p className="mt-1 text-sm text-(--text-muted)">
                                    P50, P75 and P90 as shown in the tiles.
                                </p>
                            </div>
                            <Link
                                href={completionHref}
                                className="rounded-full border border-(--border) px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-(--accent-2) hover:bg-(--surface-raised)"
                            >
                                {CTA_LABELS.completionForecast}
                            </Link>
                        </div>
                        <div className="mt-6">
                            <h3 className="text-sm font-semibold">Rolling throughput</h3>
                            <p className="mt-1 text-sm text-(--text-muted)">
                                Mean weekly completed items by historical window.
                            </p>
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
                        </div>
                    </section>

                    <section
                        data-testid="plan-risk-checks"
                        className="rounded-(--radius-lg) border border-(--border) bg-(--surface) p-6"
                    >
                        <h2 className="mb-4 text-xl font-semibold">Risk checks</h2>
                        <RiskRow risk={forecast.wipCongestion} />
                        <RiskRow risk={forecast.reviewBottleneck} />
                        <RiskRow risk={forecast.incidentLoad} />
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
                                {CTA_LABELS.forecastCompletion}
                            </Link>
                            <Link
                                href={backlogHref}
                                className="rounded-full border border-(--border) px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-(--accent-2) hover:bg-(--surface-raised)"
                            >
                                {CTA_LABELS.inspectBacklogRisk}
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
