import Link from "next/link";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { FilterBar } from "@/components/filters/FilterBar";
import { ContextStrip } from "@/components/navigation/ContextStrip";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { BackLink } from "@/components/shared/BackLink";
import { DataState } from "@/components/ui/DataState";
import { checkApiHealth } from "@/lib/api/system";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";
import { CTA_LABELS } from "@/lib/design/cta";
import { formatMetricValue as fmtMetric } from "@/lib/formatters";
import { getOperatingReviewViaGraphQL } from "@/lib/graphql/operatingReviewFetchers";
import type { OperatingReview, OperatingReviewMetric } from "@/lib/graphql/types";
import { aggregateOperatingReviews } from "@/lib/operatingReviewAggregate";
import { selectedOperatingReviewTeamIds } from "@/lib/operatingReviewScope";
import { navTrailForPathname } from "@/lib/navigation/areas";

/** Discriminated fetch result: distinguishes a real error from a genuine empty payload. */
type ReviewResult =
    | { status: "ok"; review: OperatingReview }
    | { status: "empty" }
    | { status: "error" };

type OperatingReviewPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

const sectionDescriptions: Record<string, string> = {
    delivery_movement: "Cycle time, throughput, and WIP movement for the week.",
    bottleneck: "State duration, review latency, and WIP age signals that shape flow.",
    risk: "Hotspots, ownership concentration, complexity, and bus-factor exposure. These signals are repo-scoped and reflect org-wide patterns — they are not filtered by the selected team(s).",
    reliability:
        "DORA-adjacent delivery and incident reliability signals. These are repo-scoped and org-wide — the team filter does not narrow them.",
    investment: "KTLO, new-value, security, and infrastructure allocation.",
    ai_workflow_intelligence:
        "AI-assisted work patterns, review pressure, and quality guardrails with no person-level ranking.",
};

const AI_WORKFLOW_SECTION_KEY = "ai_workflow_intelligence";

export default async function OperatingReviewPage({ searchParams }: OperatingReviewPageProps) {
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const originParam = Array.isArray(params.origin) ? params.origin[0] : params.origin;
    const activeOrigin = typeof originParam === "string" ? originParam : undefined;
    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);
    const selectedTeamIds = selectedOperatingReviewTeamIds(params.team, filters);
    const weekStart = normalizeWeekStart(singleParam(params.week));

    const [health, session] = await Promise.all([checkApiHealth(), auth()]);

    if (!health.ok) {
        return <ServiceUnavailable />;
    }

    // CHAOS-1751: read orgId from the NextAuth session JWT directly. The
    // previous getCurrentOrg() path hits /api/v1/admin/orgs/{id} which is
    // admin-only and silently nulled orgId for non-superusers, blocking the
    // downstream review fetch.
    const orgId = session?.user?.org_id ?? undefined;

    // CHAOS-1755: when no team is selected, request the cross-team aggregate
    // ("All Teams" mode) from the backend by passing teamId: null. The
    // resolver returns an aggregate payload with documented per-metric
    // aggregation rules (see ops docs/api/operating-review.md); the response
    // surfaces teamId: null so we render an explicit "All Teams" badge rather
    // than pretending a single team was chosen. The GraphQL contract still
    // accepts one teamId per request, so multi-team filter selections fan out to
    // team requests and a cross-team ceiling. The selected-team aggregate is
    // bounded by the cross-team aggregate so overlapping team ownership cannot
    // render counts above the All Teams total.
    const result = orgId
        ? await resolveOperatingReview(orgId, selectedTeamIds, weekStart)
        : ({ status: "empty" } as ReviewResult);

    const isAllTeams = selectedTeamIds.length === 0;
    const isMultiTeam = selectedTeamIds.length > 1;

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="flex w-full flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
                <PrimaryNav filters={filters} active="operating-review" />
                <main className="flex min-w-0 flex-1 flex-col gap-8">
                    <header className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <div className="mb-3">
                                <Breadcrumbs items={navTrailForPathname("/operating-review")} />
                            </div>
                            <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted)">
                                Weekly mode
                            </p>
                            <h1 className="mt-2 font-(--font-display) text-3xl">
                                Engineering Operating Review
                            </h1>
                            <p className="mt-2 text-sm text-(--ink-muted)">
                                A Monday-ready agenda for delivery movement, bottlenecks, risk,
                                reliability, investment, and recommendations.
                            </p>
                            <p className="mt-2 text-sm text-(--ink-muted)">
                                Each callout compares the selected week against the prior week.
                            </p>
                        </div>
                        <BackLink
                            href={withFilterParam("/plan", filters, undefined, activeOrigin)}
                            area="Plan"
                        />
                    </header>

                    <ContextStrip filters={filters} origin={activeOrigin} />

                    <FilterBar view="capacity-planning" />

                    {isAllTeams ? <AllTeamsBadge /> : null}
                    {isMultiTeam ? <SelectedTeamsBadge teamIds={selectedTeamIds} /> : null}
                    {result.status === "error" ? (
                        <DataState
                            variant="error"
                            title="Could not load operating review"
                            message="The request failed. Check your data connections and retry."
                            action={
                                <Link className="text-sm font-medium text-primary" href="/settings">
                                    {CTA_LABELS.checkDataConnections}
                                </Link>
                            }
                        />
                    ) : null}
                    {result.status === "empty" ? (
                        <EmptyReviewState
                            teamId={
                                selectedTeamIds.length > 0
                                    ? `${selectedTeamIds.length} selected teams`
                                    : undefined
                            }
                            weekStart={weekStart}
                        />
                    ) : null}
                    {result.status === "ok" ? (
                        <OperatingReviewAgenda review={result.review} />
                    ) : null}
                </main>
            </div>
        </div>
    );
}

async function fetchReview(
    orgId: string,
    teamId: string | null,
    weekStart: string,
    label: string,
): Promise<{ ok: true; review: OperatingReview } | { ok: false; threw: boolean }> {
    try {
        const review = await getOperatingReviewViaGraphQL(orgId, {
            teamId,
            weekStart,
        });
        return { ok: true, review };
    } catch (err: unknown) {
        logger.warn({ err, label }, `operating-review: fetch failed for ${label}`);
        return { ok: false, threw: true };
    }
}

async function resolveOperatingReview(
    orgId: string,
    selectedTeamIds: string[],
    weekStart: string,
): Promise<ReviewResult> {
    if (selectedTeamIds.length <= 1) {
        const res = await fetchReview(
            orgId,
            selectedTeamIds[0] ?? null,
            weekStart,
            selectedTeamIds[0] ?? "all-teams",
        );
        if (!res.ok) return { status: "error" };
        return { status: "ok", review: res.review };
    }

    const [ceilingRes, teamResults] = await Promise.all([
        fetchReview(orgId, null, weekStart, "all-teams-ceiling"),
        Promise.all(selectedTeamIds.map((teamId) => fetchReview(orgId, teamId, weekStart, teamId))),
    ]);

    const anyError = !ceilingRes.ok || teamResults.some((r) => !r.ok);
    const successTeamReviews = teamResults
        .filter((r): r is { ok: true; review: OperatingReview } => r.ok)
        .map((r) => r.review);

    if (!ceilingRes.ok) {
        const fallback = successTeamReviews[0];
        if (!fallback) return anyError ? { status: "error" } : { status: "empty" };
        return { status: "ok", review: fallback };
    }

    return {
        status: "ok",
        review: aggregateOperatingReviews({
            ceilingReview: ceilingRes.review,
            reviews: successTeamReviews,
            teamIds: selectedTeamIds,
        }),
    };
}

function AllTeamsBadge() {
    return (
        <section className="rounded-2xl border border-(--card-stroke) bg-(--card-80) px-5 py-3 text-xs text-(--ink-muted)">
            Showing the cross-team aggregate{" "}
            <span className="font-medium text-foreground">(All Teams)</span>. Pick a team from the{" "}
            <span className="font-medium text-foreground">Team</span> filter above to scope to one
            or more teams.
        </section>
    );
}

function SelectedTeamsBadge({ teamIds }: { teamIds: string[] }) {
    return (
        <section className="rounded-2xl border border-(--card-stroke) bg-(--card-80) px-5 py-3 text-xs text-(--ink-muted)">
            Showing operating review data for{" "}
            <span className="font-medium text-foreground">
                {teamIds.length} selected {teamIds.length === 1 ? "team" : "teams"}
            </span>
            . The Risk and Reliability sections reflect org-wide signals (repo-scoped,
            team-agnostic) even in filtered mode.
        </section>
    );
}

function OperatingReviewAgenda({ review }: { review: OperatingReview }) {
    return (
        <div className="space-y-12">
            <section className="flex flex-wrap gap-3">
                {review.sections.map((section) => (
                    <a
                        key={section.key}
                        href={`#${section.key}`}
                        className={`rounded-full border px-4 py-2 text-sm font-medium transition hover:border-(--accent) ${section.key === AI_WORKFLOW_SECTION_KEY ? "border-sky-400/40 bg-sky-500/5 text-sky-700 dark:text-sky-300" : "border-(--card-stroke) bg-(--card-80) text-foreground"}`}
                    >
                        {section.title}
                        <span className="ml-2 flex items-center gap-1.5 text-xs font-normal">
                            <span className="text-emerald-600 dark:text-emerald-400">
                                {section.improved.length} improved
                            </span>
                            <span className="text-(--ink-muted)">·</span>
                            <span className="text-rose-600 dark:text-rose-400">
                                {section.worsened.length} worsened
                            </span>
                            <span className="text-(--ink-muted)">·</span>
                            <span className="text-(--ink-muted)">
                                {section.changed.length} changed
                            </span>
                        </span>
                    </a>
                ))}
            </section>

            <div className="flex flex-col gap-16">
                {review.sections.map((section) => (
                    <section id={section.key} key={section.key} className="flex flex-col gap-6">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-(--accent)">
                                    {section.key === AI_WORKFLOW_SECTION_KEY
                                        ? "AI Intelligence"
                                        : "Operating Area"}
                                </p>
                                <h2 className="mt-2 font-(--font-display) text-3xl leading-tight text-foreground">
                                    {section.title}
                                </h2>
                                <p className="mt-2 text-sm text-(--ink-muted)">
                                    {sectionDescriptions[section.key] ?? "Weekly operating signal."}
                                </p>
                            </div>
                            <DeltaPill
                                improved={section.improved.length}
                                worsened={section.worsened.length}
                                changed={section.changed.length}
                            />
                        </div>

                        {section.key === AI_WORKFLOW_SECTION_KEY ? (
                            <AIWorkflowIntelligenceCallout />
                        ) : null}

                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                            {section.metrics.map((metric) => (
                                <MetricCard key={metric.key} metric={metric} />
                            ))}
                        </div>

                        <div className="mt-2 grid gap-4 md:grid-cols-3">
                            <CalloutColumn
                                title="Improved"
                                tone="improved"
                                items={section.improved}
                            />
                            <CalloutColumn
                                title="Worsened"
                                tone="worsened"
                                items={section.worsened}
                            />
                            <CalloutColumn title="Changed" tone="changed" items={section.changed} />
                        </div>
                    </section>
                ))}

                <section className="flex flex-col gap-6 border-t border-(--card-stroke) pt-10">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-(--accent)">
                            Action Items
                        </p>
                        <h2 className="mt-2 font-(--font-display) text-3xl leading-tight text-foreground">
                            Recommendations
                        </h2>
                    </div>
                    {review.recommendations.length ? (
                        <div className="overflow-hidden rounded-3xl border border-(--card-stroke) bg-(--card)">
                            <ul className="divide-y divide-(--card-stroke)">
                                {review.recommendations.map((recommendation) => (
                                    <li
                                        key={recommendation}
                                        className="group relative p-5 text-sm text-foreground transition hover:bg-(--card-80)"
                                    >
                                        <div className="absolute bottom-0 left-0 top-0 w-1 bg-(--accent)/50 opacity-0 transition group-hover:opacity-100" />
                                        <div className="pl-2">{recommendation}</div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : (
                        <div className="rounded-2xl border border-dashed border-(--card-stroke) bg-(--card-70) p-6 text-sm text-(--ink-muted)">
                            {review.recommendationsEmptyState}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}

function AIWorkflowIntelligenceCallout() {
    return (
        <div
            className="rounded-2xl border border-sky-400/30 bg-sky-500/5 p-4"
            data-testid="operating-review-ai-workflow-callout"
        >
            <p className="text-sm text-(--ink-muted)">
                Review these signals as operating patterns, not individual performance. Drill into
                the dedicated AI surfaces when review pressure, quality drag, or automation
                candidates need evidence-level follow-up.
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium">
                <Link
                    className="rounded-full border border-sky-400/30 bg-(--card-80) px-3 py-1.5 text-foreground transition hover:border-sky-400/60 hover:bg-sky-500/10"
                    href="/ai"
                >
                    {CTA_LABELS.aiImpact}
                </Link>
                <Link
                    className="rounded-full border border-sky-400/30 bg-(--card-80) px-3 py-1.5 text-foreground transition hover:border-sky-400/60 hover:bg-sky-500/10"
                    href="/ai/review-load"
                >
                    {CTA_LABELS.aiReviewLoad}
                </Link>
                <Link
                    className="rounded-full border border-sky-400/30 bg-(--card-80) px-3 py-1.5 text-foreground transition hover:border-sky-400/60 hover:bg-sky-500/10"
                    href="/ai/risk"
                >
                    {CTA_LABELS.aiRisk}
                </Link>
                <Link
                    className="rounded-full border border-sky-400/30 bg-(--card-80) px-3 py-1.5 text-foreground transition hover:border-sky-400/60 hover:bg-sky-500/10"
                    href="/ai/automations"
                >
                    {CTA_LABELS.aiAutomations}
                </Link>
            </div>
        </div>
    );
}

function MetricCard({ metric }: { metric: OperatingReviewMetric }) {
    return (
        <div className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-(--card-stroke) bg-(--card) p-4">
            <div className="flex items-start justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                    {metric.label}
                </p>
                <span className={statusClass(metric.delta.status)}>{metric.delta.status}</span>
            </div>
            <div className="mt-4">
                <div className="metric-hero text-2xl font-semibold text-foreground">
                    {fmtMetric(metric.value, metric.unit)}
                </div>
                <p className="mt-2 text-xs text-(--ink-muted)">
                    Prior: {fmtMetric(metric.delta.priorValue, metric.unit)} · Δ{" "}
                    {formatSigned(metric.delta.absolute, metric.unit)}
                    {metric.delta.percent === null || metric.delta.percent === undefined
                        ? ""
                        : ` (${formatSigned(metric.delta.percent, "%")})`}
                </p>
            </div>
        </div>
    );
}

function DeltaPill({
    improved,
    worsened,
    changed,
}: {
    improved: number;
    worsened: number;
    changed: number;
}) {
    return (
        <div className="flex flex-wrap gap-2 text-xs font-bold uppercase tracking-[0.1em]">
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-emerald-700 dark:text-emerald-300">
                {improved} improved
            </span>
            <span className="rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1 text-rose-700 dark:text-rose-300">
                {worsened} worsened
            </span>
            <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-sky-700 dark:text-sky-300">
                {changed} changed
            </span>
        </div>
    );
}

function CalloutColumn({
    title,
    tone,
    items,
}: {
    title: string;
    tone: "improved" | "worsened" | "changed";
    items: string[];
}) {
    return (
        <div
            className={`rounded-2xl p-4 ${items.length ? "bg-(--card-70) border border-(--card-stroke)" : "bg-transparent border border-dashed border-(--card-stroke)/50"}`}
        >
            <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-(--ink-muted)">
                {title}
            </h3>
            {items.length ? (
                <ul className="mt-3 space-y-2 text-sm text-(--ink-muted)">
                    {items.map((item) => (
                        <li key={item} className="flex items-start gap-2">
                            <span className="text-(--card-stroke)">•</span>
                            <span>{item}</span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="mt-3 text-xs italic text-(--ink-muted)/70">
                    No {tone} signals this week.
                </p>
            )}
        </div>
    );
}

function EmptyReviewState({
    teamId,
    weekStart,
}: {
    teamId: string | undefined;
    weekStart: string;
}) {
    const scopeDesc = teamId
        ? `the selected teams for week ${weekStart}`
        : `the cross-team aggregate (All Teams) for week ${weekStart}`;
    return (
        <DataState
            variant="detector-unavailable"
            description={`No operating review payload was returned for ${scopeDesc}. Sources are connected, but this view could not be computed for the selected window.`}
            action={
                <Link className="text-sm font-medium text-primary" href="/settings">
                    {CTA_LABELS.checkDataConnections}
                </Link>
            }
        />
    );
}

function singleParam(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
}

function normalizeWeekStart(value: string | undefined): string {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return value;
    }
    const now = new Date();
    const day = now.getUTCDay();
    const diffToMonday = (day + 6) % 7;
    const monday = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diffToMonday),
    );
    return monday.toISOString().slice(0, 10);
}

function formatSigned(value: number, unit: string): string {
    // Object.is distinguishes -0 from +0 so we never emit "+0"
    const sign = Object.is(value, 0) || Object.is(value, -0) ? "" : value > 0 ? "+" : "";
    return `${sign}${fmtMetric(value, unit)}`;
}

function statusClass(status: string): string {
    const base =
        "rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em]";
    if (status === "improved")
        return `${base} border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300`;
    if (status === "worsened")
        return `${base} border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300`;
    if (status === "changed")
        return `${base} border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300`;
    return `${base} border-(--card-stroke) bg-(--card-80) text-(--ink-muted)`;
}
