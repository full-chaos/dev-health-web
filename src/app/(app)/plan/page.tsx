import Link from "next/link";
import { ArrowRight, CircleCheck, TriangleAlert } from "lucide-react";

import { VerticalBarChart } from "@/components/charts/VerticalBarChart";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { InsufficientHistoryNotice } from "@/components/capacity/InsufficientHistoryNotice";
import { checkApiHealth } from "@/lib/api/system";
import { requireSession } from "@/lib/auth";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { formatNumber } from "@/lib/formatters";
import { getThroughputForecastViaGraphQL } from "@/lib/graphql/capacityFetchers";
import type { ThroughputForecast, ThroughputRiskOverlay } from "@/lib/graphql/types";
import {
    PageFactsEvidenceAction,
    type PageFact,
} from "@/components/evidence/PageFactsEvidenceAction";
import { Inset } from "@/components/capacity/Inset";
import { EvidenceFact, EvidenceFactList } from "@/components/evidence/EvidenceFacts";
import { MetricCard } from "@/components/metrics/MetricCard";
import { MetricStrip } from "@/components/metrics/MetricStrip";
import { buttonClassName } from "@/components/shared/Button";
import { Section } from "@/components/ui/Section";
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
        ? `${formatNumber(value, { maximumFractionDigits: 0 })} ${Math.round(value) === 1 ? "week" : "weeks"}`
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

function thresholdText(risk: ThroughputRiskOverlay) {
    // A threshold of 0 or less is "not set" (as before: no number is shown for it).
    if (!(risk.threshold > 0)) return null;
    const n = formatNumber(risk.threshold, { maximumFractionDigits: 2 });
    if (risk.kind === "review") return `${n} hours`;
    if (risk.kind === "wip") return `${n}×`;
    if (risk.kind === "incident_load") return `${n} per week`;
    return n;
}

function RiskFact({ risk }: { risk: ThroughputRiskOverlay }) {
    const Icon = risk.active ? TriangleAlert : CircleCheck;
    return (
        <EvidenceFact
            // The prototype's name for the incident check; the served label stays for the others.
            label={risk.kind === "incident_load" ? "Incident burden" : risk.label}
            value={
                <span data-testid="risk-row" className="inline-flex items-center gap-2">
                    <span>{riskValue(risk)}</span>
                    <span
                        data-testid="risk-status"
                        data-active={risk.active ? "true" : "false"}
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                            risk.active ? STATUS_PILL.caution : STATUS_PILL.positive
                        }`}
                    >
                        <Icon aria-hidden="true" className="h-3 w-3" />
                        {risk.active ? "Elevated" : "Normal"}
                    </span>
                </span>
            }
        />
    );
}

/** The inset of the Risk checks card: the thresholds when calm, the primary risk when not. */
function RiskInset({ forecast }: { forecast: ThroughputForecast }) {
    const risks = [forecast.wipCongestion, forecast.reviewBottleneck, forecast.incidentLoad];
    if (risks.some((risk) => risk.active)) {
        return (
            <Inset title={forecast.primaryRisk.label} data-testid="risk-inset">
                This is the most elevated current overlay for the forecast, selected from WIP
                congestion, review bottleneck, and incident load.
            </Inset>
        );
    }
    const [wip, review, incident] = risks.map((risk) => thresholdText(risk) ?? "not reported");
    return (
        <Inset title="No elevated risk" data-testid="risk-inset">
            Checks: WIP threshold {wip}, review threshold {review}, incident threshold {incident}.
        </Inset>
    );
}

/** The page's served values for the evidence drawer, as the page shows them. No new number. */
function overviewFacts(forecast: ThroughputForecast): PageFact[] {
    const risk = (r: ThroughputRiskOverlay) =>
        `${riskValue(r)} · ${r.active ? "Elevated" : "Normal"}`;
    const weeks = (v: number | null | undefined) =>
        typeof v === "number" ? formatWeeks(v) : undefined;
    return [
        { label: "Open items", value: formatNumber(forecast.backlogSize) },
        { label: "P50 forecast", value: weeks(forecast.p50Weeks) },
        { label: "P75 forecast", value: weeks(forecast.p75Weeks) },
        { label: "P90 forecast", value: weeks(forecast.p90Weeks) },
        ...forecast.rollingWindows.map((window) => ({
            label: `Rolling throughput · ${window.windowWeeks}w`,
            value: `${formatNumber(window.meanWeeklyThroughput, { maximumFractionDigits: 1 })} items/week`,
        })),
        { label: "WIP congestion", value: risk(forecast.wipCongestion) },
        { label: "Review bottleneck", value: risk(forecast.reviewBottleneck) },
        { label: "Incident burden", value: risk(forecast.incidentLoad) },
        {
            label: "History",
            // The served flag as a word; "Not reported" only when the field is absent.
            value:
                typeof forecast.insufficientHistory === "boolean"
                    ? forecast.insufficientHistory
                        ? "Insufficient"
                        : "Sufficient"
                    : undefined,
        },
    ];
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

    const orgId = session.user.org_id;
    // No org on the session: ask for nothing (never an empty or made-up org).
    if (!orgId) return <ServiceUnavailable landmark={false} />;
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
                actions={
                    forecast ? (
                        <PageFactsEvidenceAction
                            title="Plan overview"
                            facts={overviewFacts(forecast)}
                        />
                    ) : undefined
                }
                subtitle="Forecast — not a commitment. Uses rolling 4/8/12-week throughput and risk overlays. Backlog and scope are derived from the filter bar."
            />

            <ScopeBar view="capacity-planning" origin={originParam} />

            {forecast ? (
                <>
                    <InsufficientHistoryNotice
                        insufficientHistory={forecast.insufficientHistory}
                        rollingWindows={forecast.rollingWindows}
                    />

                    <MetricStrip data-testid="plan-tiles">
                        <MetricCard
                            label="Open items"
                            value={forecast.backlogSize}
                            hideTrend
                            deltaSlot={<span>Derived from current filters</span>}
                        />
                        {[
                            ["P50 forecast", forecast.p50Weeks],
                            ["P75 forecast", forecast.p75Weeks],
                            ["P90 forecast", forecast.p90Weeks],
                        ].map(([label, weeks]) => (
                            <MetricCard
                                key={label as string}
                                testId="percentile-tile"
                                label={label as string}
                                value={typeof weeks === "number" ? Math.round(weeks) : undefined}
                                unit={Math.round(Number(weeks)) === 1 ? "week" : "weeks"}
                                hideTrend
                                deltaSlot={
                                    <>
                                        {forecast.insufficientHistory ? (
                                            <span
                                                data-testid="limited-history-pill"
                                                className={`mr-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${STATUS_PILL.caution}`}
                                            >
                                                <TriangleAlert
                                                    aria-hidden="true"
                                                    className="h-3 w-3"
                                                />
                                                Limited history
                                            </span>
                                        ) : null}
                                        <span>
                                            {typeof weeks === "number"
                                                ? "throughput-based"
                                                : "Not enough throughput"}
                                        </span>
                                    </>
                                }
                            />
                        ))}
                    </MetricStrip>

                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                        <Section
                            data-testid="plan-completion-outlook"
                            title="Completion outlook"
                            description="Mean weekly completed items by historical window."
                        >
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <p className="text-label-caps uppercase text-(--ink-muted)">
                                        Current snapshot
                                    </p>
                                    <p
                                        data-testid="outlook-headline"
                                        className="mt-1 text-h3 font-semibold"
                                    >
                                        {outlookHeadline(forecast)}
                                    </p>
                                    <p className="mt-2 text-sm text-(--ink-muted)">
                                        {outlookSentence(forecast)}
                                    </p>
                                    <p className="mt-1 text-sm text-(--ink-muted)">
                                        P50, P75 and P90 as shown in the tiles.
                                    </p>
                                </div>
                                <Link href={completionHref} className={buttonClassName("primary")}>
                                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                                    {CTA_LABELS.completionForecast}
                                </Link>
                            </div>
                            <div className="mt-6">
                                <h3 className="text-sm font-semibold">Rolling throughput</h3>
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
                        </Section>

                        <Section data-testid="plan-risk-checks" title="Risk checks">
                            <EvidenceFactList aria-label="Risk checks" testId="risk-facts">
                                <RiskFact risk={forecast.wipCongestion} />
                                <RiskFact risk={forecast.reviewBottleneck} />
                                <RiskFact risk={forecast.incidentLoad} />
                            </EvidenceFactList>
                            <RiskInset forecast={forecast} />
                        </Section>
                    </div>

                    <Section
                        data-testid="plan-destinations"
                        title="Planning destinations"
                        description="Forecast assumptions and backlog condition stay separate."
                    >
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Link href={completionHref} className={buttonClassName("secondary")}>
                                <ArrowRight aria-hidden="true" className="h-4 w-4" />
                                {CTA_LABELS.forecastCompletion}
                            </Link>
                            <Link href={backlogHref} className={buttonClassName("secondary")}>
                                <ArrowRight aria-hidden="true" className="h-4 w-4" />
                                {CTA_LABELS.inspectBacklogRisk}
                            </Link>
                        </div>
                    </Section>
                </>
            ) : (
                <EmptyForecastState scopeLabel={scopeLabel} />
            )}
        </div>
    );
}
