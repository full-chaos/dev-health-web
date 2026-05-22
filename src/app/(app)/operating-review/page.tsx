import Link from "next/link";

import { FilterBar } from "@/components/filters/FilterBar";
import { ContextStrip } from "@/components/navigation/ContextStrip";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ServiceUnavailable } from "@/components/ServiceUnavailable";
import { checkApiHealth } from "@/lib/api/system";
import { auth } from "@/lib/auth";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { withFilterParam } from "@/lib/filters/url";
import { getOperatingReviewViaGraphQL } from "@/lib/graphql/operatingReviewFetchers";
import type { OperatingReview, OperatingReviewMetric } from "@/lib/graphql/types";
import { aggregateOperatingReviews } from "@/lib/operatingReviewAggregate";
import { selectedOperatingReviewTeamIds } from "@/lib/operatingReviewScope";


type OperatingReviewPageProps = {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

const sectionDescriptions: Record<string, string> = {
  delivery_movement: "Cycle time, throughput, and WIP movement for the week.",
  bottleneck: "State duration, review latency, and WIP age signals that shape flow.",
  risk: "Hotspots, ownership concentration, complexity, and bus-factor exposure.",
  reliability: "DORA-adjacent delivery and incident reliability signals.",
  investment: "KTLO, new-value, security, and infrastructure allocation.",
  ai_workflow_intelligence: "AI-assisted work patterns, review pressure, and quality guardrails with no person-level ranking.",
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

  const [health, session] = await Promise.all([
    checkApiHealth(),
    auth(),
  ]);

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
  const review = orgId
    ? await resolveOperatingReview(orgId, selectedTeamIds, weekStart)
    : null;

  const isAllTeams = selectedTeamIds.length === 0;
  const isMultiTeam = selectedTeamIds.length > 1;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
        <PrimaryNav filters={filters} active="operating-review" />
        <main className="flex min-w-0 flex-1 flex-col gap-8">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div>
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
            <Link
              href={withFilterParam("/", filters, undefined, activeOrigin)}
              className="rounded-full border border-(--card-stroke) px-4 py-2 text-xs uppercase tracking-[0.2em]"
            >
              Back to cockpit
            </Link>
          </header>

          <FilterBar view="work" />

          <ContextStrip filters={filters} origin={activeOrigin} />

          {isAllTeams ? <AllTeamsBadge /> : null}
          {isMultiTeam ? <SelectedTeamsBadge teamIds={selectedTeamIds} /> : null}
          {!review ? <EmptyReviewState teamId={selectedTeamIds.join(", ") || undefined} weekStart={weekStart} /> : null}
          {review ? <OperatingReviewAgenda review={review} /> : null}
        </main>
      </div>
    </div>
  );
}

async function resolveOperatingReview(
  orgId: string,
  selectedTeamIds: string[],
  weekStart: string
): Promise<OperatingReview | null> {
  if (selectedTeamIds.length <= 1) {
    return fetchOrNull(
      getOperatingReviewViaGraphQL(orgId, {
        teamId: selectedTeamIds[0] ?? null,
        weekStart,
      }),
      `operating-review/data/${selectedTeamIds[0] ?? "all-teams"}`
    );
  }

  const [ceilingReview, teamReviews] = await Promise.all([
    fetchOrNull(
      getOperatingReviewViaGraphQL(orgId, { teamId: null, weekStart }),
      "operating-review/data/all-teams-ceiling"
    ),
    Promise.all(
      selectedTeamIds.map((teamId) =>
        fetchOrNull(
          getOperatingReviewViaGraphQL(orgId, { teamId, weekStart }),
          `operating-review/data/${teamId}`
        )
      )
    ),
  ]);

  if (!ceilingReview) {
    return teamReviews.find((review): review is OperatingReview => Boolean(review)) ?? null;
  }

  return aggregateOperatingReviews({
    ceilingReview,
    reviews: teamReviews.filter((review): review is OperatingReview => Boolean(review)),
    teamIds: selectedTeamIds,
  });
}

function AllTeamsBadge() {
  return (
    <section className="rounded-2xl border border-(--card-stroke) bg-(--card-80) px-5 py-3 text-xs text-(--ink-muted)">
      Showing the cross-team aggregate{" "}
      <span className="font-medium text-foreground">(All Teams)</span>. Pick a team from
      the <span className="font-medium text-foreground">Team</span> filter above to scope
      to one or more teams.
    </section>
  );
}

function SelectedTeamsBadge({ teamIds }: { teamIds: string[] }) {
  return (
    <section className="rounded-2xl border border-(--card-stroke) bg-(--card-80) px-5 py-3 text-xs text-(--ink-muted)">
      Showing operating review data for{" "}
      <span className="font-medium text-foreground">{teamIds.length} selected teams</span>: {teamIds.join(", ")}
    </section>
  );
}

function OperatingReviewAgenda({ review }: { review: OperatingReview }) {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 lg:grid-cols-5">
        {review.sections.map((section) => (
          <a
            key={section.key}
            href={`#${section.key}`}
            className={`rounded-2xl border bg-card p-4 transition hover:border-primary/50 ${section.key === AI_WORKFLOW_SECTION_KEY ? "border-sky-400/40 shadow-sm shadow-sky-500/10" : "border-border"}`}
          >
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {section.key === AI_WORKFLOW_SECTION_KEY ? "AI section" : "Section"}
            </p>
            <h2 className="mt-2 text-base font-semibold">{section.title}</h2>
            <p className="mt-2 text-xs text-muted-foreground">
              {section.improved.length} improved · {section.worsened.length} worsened · {section.changed.length} changed
            </p>
          </a>
        ))}
      </section>

      {review.sections.map((section) => (
        <section
          id={section.key}
          key={section.key}
          className={`rounded-[1.75rem] border bg-card/90 p-6 shadow-sm ${section.key === AI_WORKFLOW_SECTION_KEY ? "border-sky-400/40 shadow-sky-500/10" : "border-border"}`}
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                {section.key === AI_WORKFLOW_SECTION_KEY ? "AI workflow intelligence" : "Fixed agenda section"}
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">{section.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {sectionDescriptions[section.key] ?? "Weekly operating signal."}
              </p>
            </div>
            <DeltaPill improved={section.improved.length} worsened={section.worsened.length} changed={section.changed.length} />
          </div>

          {section.key === AI_WORKFLOW_SECTION_KEY ? <AIWorkflowIntelligenceCallout /> : null}

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {section.metrics.map((metric) => (
              <MetricCard key={metric.key} metric={metric} />
            ))}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <CalloutColumn title="Improved" tone="improved" items={section.improved} />
            <CalloutColumn title="Worsened" tone="worsened" items={section.worsened} />
            <CalloutColumn title="Changed" tone="changed" items={section.changed} />
          </div>
        </section>
      ))}

      <section className="rounded-[1.75rem] border border-border bg-card/90 p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Rule engine
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">Recommendations</h2>
        {review.recommendations.length ? (
          <ul className="mt-4 space-y-3">
            {review.recommendations.map((recommendation) => (
              <li key={recommendation} className="rounded-2xl border border-border bg-background/70 p-4 text-sm">
                {recommendation}
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-border bg-background/60 p-6 text-sm text-muted-foreground">
            {review.recommendationsEmptyState}
          </div>
        )}
      </section>
    </div>
  );
}

function AIWorkflowIntelligenceCallout() {
  return (
    <div className="mt-5 rounded-2xl border border-sky-400/30 bg-sky-500/5 p-4" data-testid="operating-review-ai-workflow-callout">
      <p className="text-sm text-muted-foreground">
        Review these signals as operating patterns, not individual performance. Drill into the dedicated AI surfaces when review pressure,
        quality drag, or automation candidates need evidence-level follow-up.
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
        <Link className="rounded-full border border-sky-400/30 bg-background/60 px-3 py-1 text-foreground" href="/ai/impact">
          Impact
        </Link>
        <Link className="rounded-full border border-sky-400/30 bg-background/60 px-3 py-1 text-foreground" href="/ai/review-load">
          Review Load
        </Link>
        <Link className="rounded-full border border-sky-400/30 bg-background/60 px-3 py-1 text-foreground" href="/ai/risk">
          Risk
        </Link>
        <Link className="rounded-full border border-sky-400/30 bg-background/60 px-3 py-1 text-foreground" href="/ai/automations">
          Automations
        </Link>
      </div>
    </div>
  );
}

function MetricCard({ metric }: { metric: OperatingReviewMetric }) {
  return (
    <div className="rounded-2xl border border-border bg-background/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{metric.label}</p>
        <span className={statusClass(metric.delta.status)}>{metric.delta.status}</span>
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight">
        {formatMetricValue(metric.value)}
        <span className="ml-1 text-sm font-normal text-muted-foreground">{metric.unit}</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Prior: {formatMetricValue(metric.delta.priorValue)} · Δ {formatSigned(metric.delta.absolute)}
        {metric.delta.percent === null || metric.delta.percent === undefined
          ? ""
          : ` (${formatSigned(metric.delta.percent)}%)`}
      </p>
    </div>
  );
}

function DeltaPill({ improved, worsened, changed }: { improved: number; worsened: number; changed: number }) {
  return (
    <div className="flex flex-wrap gap-2 text-xs font-medium">
      <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-700 dark:text-emerald-300">{improved} improved</span>
      <span className="rounded-full bg-rose-500/10 px-3 py-1 text-rose-700 dark:text-rose-300">{worsened} worsened</span>
      <span className="rounded-full bg-sky-500/10 px-3 py-1 text-sky-700 dark:text-sky-300">{changed} changed</span>
    </div>
  );
}

function CalloutColumn({ title, tone, items }: { title: string; tone: "improved" | "worsened" | "changed"; items: string[] }) {
  return (
    <div className="rounded-2xl border border-border bg-background/60 p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {items.length ? (
        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
          {items.map((item) => <li key={item}>• {item}</li>)}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">No {tone} signals this week.</p>
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
  const scopeLabel = teamId ? (
    <>team <span className="font-medium text-foreground">{teamId}</span></>
  ) : (
    <>the cross-team aggregate <span className="font-medium text-foreground">(All Teams)</span></>
  );
  return (
    <section className="rounded-[1.75rem] border border-dashed border-border bg-card/70 p-8">
      <h2 className="text-lg font-semibold">No operating review data yet</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        The surface is ready for {scopeLabel} for week {weekStart}, but no backend payload was returned.
      </p>
      <Link className="mt-4 inline-flex text-sm font-medium text-primary" href="/settings">
        Check data connections
      </Link>
    </section>
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
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diffToMonday));
  return monday.toISOString().slice(0, 10);
}

function formatMetricValue(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}

function formatSigned(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatMetricValue(value)}`;
}

function statusClass(status: string): string {
  const base = "rounded-full px-2 py-1 text-xs font-medium capitalize";
  if (status === "improved") return `${base} bg-emerald-500/10 text-emerald-700 dark:text-emerald-300`;
  if (status === "worsened") return `${base} bg-rose-500/10 text-rose-700 dark:text-rose-300`;
  if (status === "changed") return `${base} bg-sky-500/10 text-sky-700 dark:text-sky-300`;
  return `${base} bg-muted text-muted-foreground`;
}
