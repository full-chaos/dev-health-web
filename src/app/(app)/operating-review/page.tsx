import { StatusPill } from "@/components/admin/StatusPill";
import Link from "next/link";

import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { MetricStrip } from "@/components/metrics/MetricStrip";
import { buttonClassName } from "@/components/shared/Button";
import { DataState } from "@/components/ui/DataState";
import { Notice } from "@/components/ui/Notice";
import { Section } from "@/components/ui/Section";
import { checkApiHealth } from "@/lib/api/system";
import { auth } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { CTA_LABELS } from "@/lib/design/cta";
import { getOperatingReviewViaGraphQL } from "@/lib/graphql/operatingReviewFetchers";
import type { OperatingReview, OperatingReviewInput } from "@/lib/graphql/types";
import { balancedColumns } from "@/lib/operatingReviewColumns";
import { selectedOperatingReviewTeamIds } from "@/lib/operatingReviewScope";

import { MetricTile, TINT, WHOLE_ORGANIZATION } from "./MetricTile";
import { PageHeader } from "@/components/shell/PageHeader";
import { ScopeBar } from "@/components/shell/ScopeBar";
import { Inset } from "@/components/ui/Inset";

/** Discriminated fetch result: distinguishes a real error from a genuine empty payload. */
type ReviewResult =
    { status: "ok"; review: OperatingReview } | { status: "empty" } | { status: "error" };

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
        return <ServiceUnavailable landmark={false} />;
    }

    // CHAOS-1751: read orgId from the NextAuth session JWT directly. The
    // previous getCurrentOrg() path hits /api/v1/admin/orgs/{id} which is
    // admin-only and silently nulled orgId for non-superusers, blocking the
    // downstream review fetch.
    const orgId = session?.user?.org_id ?? undefined;

    // One request for every selection. No team: `teamId: null`, the cross-team review ("All
    // Teams", CHAOS-1755). One team: `teamId`. Several teams: `teamIds` (CHAOS-8516): the API
    // answers the review of those teams together (values, changes, status, sentences and
    // recommendations), so the web sums and caps nothing.
    const result = orgId
        ? await resolveOperatingReview(orgId, selectedTeamIds, weekStart)
        : ({ status: "empty" } as ReviewResult);

    const isAllTeams = selectedTeamIds.length === 0;
    const isMultiTeam = selectedTeamIds.length > 1;

    return (
        // Rendered inside the shared app shell: the layout owns the navigation, the
        // page padding and the `<main>` landmark.
        <div className="flex min-w-0 flex-1 flex-col gap-8 text-foreground">
            <PageHeader
                title="Operating Review"
                titleAdornment={
                    <StatusPill tone="outline" testId="operating-review-preview-pill">
                        Preview
                    </StatusPill>
                }
                subtitle="A Monday-ready agenda for delivery movement, bottlenecks, risk, reliability, investment, and recommendations."
            >
                <p className="text-sm text-(--ink-muted)">
                    Each callout compares the selected week against the prior week.
                </p>
            </PageHeader>

            <ScopeBar view="capacity-planning" origin={activeOrigin} />

            {isAllTeams ? <AllTeamsBadge /> : null}
            {isMultiTeam ? (
                <SelectedTeamsBadge
                    teamIds={selectedTeamIds}
                    hasOrganizationMetrics={
                        result.status === "ok" && hasOrganizationMetrics(result.review)
                    }
                />
            ) : null}
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
                <OperatingReviewAgenda review={result.review} teamSelected={!isAllTeams} />
            ) : null}
        </div>
    );
}

async function resolveOperatingReview(
    orgId: string,
    selectedTeamIds: string[],
    weekStart: string,
): Promise<ReviewResult> {
    // `teamId` and `teamIds` are never sent together: the API refuses that.
    const input: OperatingReviewInput =
        selectedTeamIds.length > 1
            ? { teamIds: selectedTeamIds, weekStart }
            : { teamId: selectedTeamIds[0] ?? null, weekStart };
    const label = selectedTeamIds.length ? selectedTeamIds.join(",") : "all-teams";
    try {
        return { status: "ok", review: await getOperatingReviewViaGraphQL(orgId, input) };
    } catch (err: unknown) {
        logger.warn({ err, label }, `operating-review: fetch failed for ${label}`);
        return { status: "error" };
    }
}

/** The answer holds a metric the API marks as the whole organization's (`scope`). */
function hasOrganizationMetrics(review: OperatingReview): boolean {
    return review.sections.some((section) =>
        section.metrics.some((metric) => metric.scope === "ORGANIZATION"),
    );
}

function AllTeamsBadge() {
    return (
        <Notice variant="info" live={false} data-testid="all-teams-notice">
            Showing the cross-team aggregate{" "}
            <span className="font-medium text-foreground">(All Teams)</span>. Pick a team from the{" "}
            <span className="font-medium text-foreground">Team</span> filter above to scope to one
            or more teams.
        </Notice>
    );
}

function SelectedTeamsBadge({
    teamIds,
    hasOrganizationMetrics,
}: {
    teamIds: string[];
    /** From the served `scope` of the metrics: the web keeps no list of sections or keys. */
    hasOrganizationMetrics: boolean;
}) {
    return (
        <Notice variant="info" live={false} data-testid="selected-teams-notice">
            Showing operating review data for{" "}
            <span className="font-medium text-foreground">
                {teamIds.length} selected {teamIds.length === 1 ? "team" : "teams"}
            </span>
            .
            {hasOrganizationMetrics
                ? ` Metrics marked “${WHOLE_ORGANIZATION}” are not narrowed by the team filter.`
                : null}
        </Notice>
    );
}

function OperatingReviewAgenda({
    review,
    teamSelected,
}: {
    review: OperatingReview;
    teamSelected: boolean;
}) {
    return (
        <div className="flex flex-col gap-6">
            <nav
                aria-label="Agenda"
                data-testid="operating-review-index"
                className="grid gap-3 md:grid-cols-3 xl:grid-cols-6"
            >
                {review.sections.map((section) => (
                    <a
                        key={section.key}
                        href={`#${section.key}`}
                        className="flex min-w-0 flex-col gap-3 rounded-(--radius-md) border border-(--card-stroke) bg-card p-4 transition hover:border-(--accent-2)"
                    >
                        <span className="text-sm font-semibold">{section.title}</span>
                        <DeltaPill
                            improved={section.improved.length}
                            worsened={section.worsened.length}
                            changed={section.changed.length}
                        />
                    </a>
                ))}
            </nav>

            {review.sections.map((section) => (
                <Section
                    id={section.key}
                    key={section.key}
                    title={section.title}
                    description={sectionDescriptions[section.key] ?? "Weekly operating signal."}
                    action={
                        <DeltaPill
                            improved={section.improved.length}
                            worsened={section.worsened.length}
                            changed={section.changed.length}
                        />
                    }
                >
                    {section.key === AI_WORKFLOW_SECTION_KEY ? (
                        <AIWorkflowIntelligenceCallout />
                    ) : null}

                    {section.metrics.length ? (
                        <MetricStrip
                            columns={balancedColumns(section.metrics.length)}
                            className="mt-4"
                        >
                            {section.metrics.map((metric) => (
                                <MetricTile
                                    key={metric.key}
                                    metric={metric}
                                    narrow={balancedColumns(section.metrics.length) >= 5}
                                    teamSelected={teamSelected}
                                />
                            ))}
                        </MetricStrip>
                    ) : null}

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <CalloutColumn title="Improved" tone="improved" items={section.improved} />
                        <CalloutColumn title="Worsened" tone="worsened" items={section.worsened} />
                        <CalloutColumn title="Changed" tone="changed" items={section.changed} />
                    </div>
                </Section>
            ))}

            <Section title="Recommendations">
                {review.recommendations.length ? (
                    <ol
                        className="flex flex-col gap-2"
                        data-testid="operating-review-recommendations"
                    >
                        {review.recommendations.map((recommendation, index) => (
                            <Inset
                                as="li"
                                flush
                                key={recommendation}
                                className="flex items-start gap-3 text-sm"
                            >
                                <span
                                    aria-hidden="true"
                                    className="w-5 shrink-0 font-semibold tabular-nums text-(--ink-muted)"
                                >
                                    {index + 1}
                                </span>
                                <span>{recommendation}</span>
                            </Inset>
                        ))}
                    </ol>
                ) : (
                    <p className="rounded-(--radius-sm) border border-dashed border-(--card-stroke) p-4 text-sm text-(--ink-muted)">
                        {review.recommendationsEmptyState}
                    </p>
                )}
            </Section>
        </div>
    );
}

function AIWorkflowIntelligenceCallout() {
    return (
        <Notice variant="info" live={false} data-testid="operating-review-ai-workflow-callout">
            <p>
                Review these signals as operating patterns, not individual performance. Drill into
                the dedicated AI surfaces when review pressure, quality drag, or automation
                candidates need evidence-level follow-up.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
                {[
                    ["/ai", CTA_LABELS.aiImpact],
                    ["/ai/review-load", CTA_LABELS.aiReviewLoad],
                    ["/ai/risk", CTA_LABELS.aiRisk],
                    ["/ai/automations", CTA_LABELS.aiAutomations],
                ].map(([href, label]) => (
                    <Link key={href} className={buttonClassName("secondary", "sm")} href={href}>
                        {label}
                    </Link>
                ))}
            </div>
        </Notice>
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
        <div className="flex flex-wrap gap-2 text-xs font-medium">
            <span className={`rounded-full px-3 py-1 ${TINT.improved}`}>{improved} improved</span>
            <span className={`rounded-full px-3 py-1 ${TINT.worsened}`}>{worsened} worsened</span>
            <span className={`rounded-full px-3 py-1 ${TINT.changed}`}>{changed} changed</span>
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
        <Inset flush>
            <h3 className="text-sm font-semibold">{title}</h3>
            {items.length ? (
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                    {items.map((item) => (
                        <li key={item}>• {item}</li>
                    ))}
                </ul>
            ) : (
                <p className="mt-3 text-sm text-muted-foreground">No {tone} signals this week.</p>
            )}
        </Inset>
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
