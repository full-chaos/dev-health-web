import { ContextStrip } from "@/components/navigation/ContextStrip";
import { FilterBar } from "@/components/filters/FilterBar";
import { PrimaryNav } from "@/components/navigation/PrimaryNav";
import { ViewSet, type ViewSetItem } from "@/components/navigation/ViewSet";
import { HeatmapView } from "@/components/work/HeatmapView";
import { decodeFilter, filterFromQueryParams } from "@/lib/filters/encode";
import { requireSession } from "@/lib/auth";
import { withFilterParam } from "@/lib/filters/url";
import { getCognitiveLoadViaGraphQL } from "@/lib/graphql/cognitiveLoadFetchers";
import { getHeatmap } from "@/lib/api/visuals";
import {
    ContextSwitchingView,
    FocusPressureView,
    LoadDriversView,
    OverviewView,
    type LoadDriver,
    type LoadKpi,
    type TrendPoint,
} from "@/components/cognitive-load/CognitiveLoadViews";
import type { HeatmapResponse } from "@/lib/types";
import Link from "next/link";

type CognitiveLoadPageProps = {
    searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a ratio (0–1) as a percentage string, e.g. 0.4 → "40%". */
function formatPct(ratio: number | null | undefined): string {
    if (ratio == null) return "—";
    return `${Math.round(ratio * 100)}%`;
}

/** Format a float signal value, rounding to nearest integer for display. */
function formatLoad(value: number): string {
    return String(Math.round(value));
}

/** Derive ISO date strings from a MetricFilter's time block. */
function dateRangeFromFilter(time: {
    range_days: number;
    start_date?: string;
    end_date?: string;
}): { sinceDate: string; untilDate: string } {
    if (time.start_date && time.end_date) {
        return { sinceDate: time.start_date, untilDate: time.end_date };
    }
    const end = new Date();
    const start = new Date(end);
    start.setDate(end.getDate() - (time.range_days - 1));
    const isoDate = (d: Date) => d.toISOString().slice(0, 10);
    return { sinceDate: isoDate(start), untilDate: isoDate(end) };
}

export default async function CognitiveLoadPage({ searchParams }: CognitiveLoadPageProps) {
    const session = await requireSession();
    const params = (await searchParams) ?? {};
    const encodedFilter = Array.isArray(params.f) ? params.f[0] : params.f;
    const roleParam = Array.isArray(params.role) ? params.role[0] : params.role;
    const originParam = Array.isArray(params.origin) ? params.origin[0] : params.origin;
    const activeRole = typeof roleParam === "string" ? roleParam : undefined;
    const activeOrigin = typeof originParam === "string" ? originParam : undefined;
    const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
    const activeTab = typeof tabParam === "string" ? tabParam : "overview";
    const filters = encodedFilter ? decodeFilter(encodedFilter) : filterFromQueryParams(params);
    const scopeId = filters.scope.ids[0] ?? "";
    const tabs: ViewSetItem[] = [
        {
            id: "overview",
            label: "Overview",
            path: withFilterParam("/cognitive-load", filters, activeRole),
            navVisible: true,
        },
        {
            id: "heatmap",
            label: "Heatmap",
            path: withFilterParam("/cognitive-load?tab=heatmap", filters, activeRole),
            navVisible: true,
        },
        {
            id: "context-switching",
            label: "Context Switching",
            path: withFilterParam("/cognitive-load?tab=context-switching", filters, activeRole),
            navVisible: true,
        },
        {
            id: "focus-pressure",
            label: "Focus Pressure",
            path: withFilterParam("/cognitive-load?tab=focus-pressure", filters, activeRole),
            navVisible: true,
        },
        {
            id: "load-drivers",
            label: "Load Drivers",
            path: withFilterParam("/cognitive-load?tab=load-drivers", filters, activeRole),
            navVisible: true,
        },
    ];
    const isDeveloperScope = filters.scope.level === "developer";
    const selectedDeveloperId = isDeveloperScope ? filters.scope.ids[0] : undefined;
    const effectiveSelfId =
        session.user.is_impersonating && session.user.impersonated_user_id
            ? session.user.impersonated_user_id
            : session.user.id;
    const isIndividualScope = Boolean(
        selectedDeveloperId && selectedDeveloperId === effectiveSelfId,
    );
    const canShowSelectedScope = !isDeveloperScope || isIndividualScope;

    // -------------------------------------------------------------------------
    // Fetch real cognitive-load data
    // -------------------------------------------------------------------------
    const orgId = session.user.org_id ?? "";
    const teamId =
        filters.scope.level === "team" && filters.scope.ids.length > 0
            ? filters.scope.ids[0]
            : null;
    const { sinceDate, untilDate } = dateRangeFromFilter(filters.time);

    let cognitiveLoadData: Awaited<ReturnType<typeof getCognitiveLoadViaGraphQL>> | null = null;
    let fetchError: string | null = null;

    if (orgId) {
        try {
            cognitiveLoadData = await getCognitiveLoadViaGraphQL({
                orgId,
                sinceDate,
                untilDate,
                teamId,
            });
        } catch (err) {
            fetchError = err instanceof Error ? err.message : "Failed to load cognitive-load data";
        }
    }

    // The Heatmap tab fetches its own review-wait-density grid server-side. HeatmapPanel
    // renders initialData as-is and does NOT self-fetch the grid (it only re-fetches
    // per-cell evidence on click), so a null here would render an empty heatmap. Fetch
    // only when that tab is active and the scope is viewable to avoid wasted backend calls.
    let reviewHeatmap: HeatmapResponse | null = null;
    if (activeTab === "heatmap" && canShowSelectedScope) {
        try {
            reviewHeatmap = await getHeatmap({
                type: "temporal_load",
                metric: "review_wait_density",
                scope_type: filters.scope.level,
                scope_id: scopeId,
                range_days: filters.time.range_days,
                start_date: filters.time.start_date,
                end_date: filters.time.end_date,
            });
        } catch {
            // Leave null — HeatmapView renders its own "unavailable" empty state.
            reviewHeatmap = null;
        }
    }

    // -------------------------------------------------------------------------
    // Derive aggregated KPI values from per-day signals
    // -------------------------------------------------------------------------
    // Average across all days that have data; signals with no data → 0.
    const rawSignals = cognitiveLoadData?.signals ?? [];
    const hasData = rawSignals.length > 0;

    const avg = (values: number[]) =>
        values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;

    const avgPrInterruptionLoad = avg(rawSignals.map((s) => s.prInterruptionLoad));
    const avgContextSpread = avg(rawSignals.map((s) => s.contextSpreadCount));
    const avgReviewRequestLoad = avg(rawSignals.map((s) => s.reviewRequestLoad));

    // after_hours / weekend ratios are nullable (team-scoped only; null when no team filter).
    const afterHoursValues = rawSignals
        .map((s) => s.afterHoursCommitRatio)
        .filter((v): v is number => v != null);
    const weekendValues = rawSignals
        .map((s) => s.weekendCommitRatio)
        .filter((v): v is number => v != null);

    const avgAfterHours = afterHoursValues.length > 0 ? avg(afterHoursValues) : null;
    const avgWeekend = weekendValues.length > 0 ? avg(weekendValues) : null;

    // Build the 5 KPI card descriptors from real data.
    // When there is genuinely no data (hasData === false) every value shows "—".
    const signals: LoadKpi[] | null = hasData
        ? [
              {
                  label: "PR interruption load",
                  value: formatLoad(avgPrInterruptionLoad),
                  delta: `${sinceDate} – ${untilDate}`,
                  deltaTone: "text-(--ink-muted)",
                  interpretation: avgPrInterruptionLoad > 15 ? "Rising" : avgPrInterruptionLoad > 8 ? "Watch" : "Easing",
                  description:
                      "Reviews, first-review events, and review feedback interrupting focused delivery.",
              },
              {
                  label: "Context spread",
                  value: formatLoad(avgContextSpread),
                  delta: `avg over ${cognitiveLoadData?.totalDays ?? rawSignals.length} days`,
                  deltaTone: avgContextSpread > 6 ? "text-amber-600" : "text-(--ink-muted)",
                  interpretation: avgContextSpread > 6 ? "Watch" : "Stable",
                  description:
                      "Distinct repos, PRs, reviews, and touched file areas in the selected team scope.",
              },
              {
                  label: "Review request load",
                  value: formatLoad(avgReviewRequestLoad),
                  delta: `avg over ${cognitiveLoadData?.totalDays ?? rawSignals.length} days`,
                  deltaTone: avgReviewRequestLoad > 10 ? "text-rose-600" : "text-(--ink-muted)",
                  interpretation: avgReviewRequestLoad > 10 ? "Rising" : avgReviewRequestLoad > 5 ? "Watch" : "Low",
                  description:
                      "Aggregate review requests handled by the team, never a person-level queue ranking.",
              },
              {
                  label: "After-hours trend",
                  value: avgAfterHours != null ? formatPct(avgAfterHours) : "—",
                  delta: avgAfterHours != null ? (teamId ? "team-scoped" : "org-wide") : "no team scope",
                  deltaTone: avgAfterHours != null && avgAfterHours > 0.3 ? "text-amber-600" : "text-(--ink-muted)",
                  interpretation: avgAfterHours == null ? "N/A" : avgAfterHours > 0.3 ? "Watch" : "Stable",
                  description: "Existing commit-time rollups outside weekday business hours.",
              },
              {
                  label: "Weekend trend",
                  value: avgWeekend != null ? formatPct(avgWeekend) : "—",
                  delta: avgWeekend != null ? (teamId ? "team-scoped" : "org-wide") : "no team scope",
                  deltaTone: avgWeekend != null && avgWeekend > 0.2 ? "text-amber-600" : "text-emerald-600",
                  interpretation: avgWeekend == null ? "N/A" : avgWeekend > 0.2 ? "Watch" : "Lower",
                  description: "Existing weekend activity ratio, aggregated before it reaches this surface.",
              },
          ]
        : null; // null signals no data — rendered as empty state below

    // Per-day trend datasets for the distinct tabs. Keep the FULL ISO `day` so the chart
    // sorts chronologically across month/year boundaries (a Dec→Jan window must not plot
    // January before December); `label` carries the compact "MM-DD" form for the axis.
    // A real zero is plotted (zero is data); only a genuinely empty window is empty.
    const toTrend = (pick: (s: (typeof rawSignals)[number]) => number): TrendPoint[] =>
        rawSignals
            .map((s) => ({ day: s.day, label: s.day.slice(5), value: Math.round(pick(s)) }))
            .sort((a, b) => a.day.localeCompare(b.day));
    const contextSpreadTrend = toTrend((s) => s.contextSpreadCount);
    const interruptionTrend = toTrend((s) => s.prInterruptionLoad);
    const reviewRequestTrend = toTrend((s) => s.reviewRequestLoad);

    // Load Drivers composition: average daily contribution of each count-based signal
    // (same unit — events/day — so the bars are directly comparable on one axis).
    const loadDrivers: LoadDriver[] = [
        { label: "PR interruption", value: avgPrInterruptionLoad },
        { label: "Context spread", value: avgContextSpread },
        { label: "Review request", value: avgReviewRequestLoad },
    ];

    const windowLabel = { sinceDate, untilDate };

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 pb-16 pt-10 md:flex-row">
                <PrimaryNav filters={filters} active="cognitive-load" role={activeRole} />
                <main
                    className="flex min-w-0 flex-1 flex-col gap-6"
                    data-testid="cognitive-load-dashboard"
                >
                    <section className="overflow-hidden rounded-[2rem] border border-(--card-stroke) bg-(--card-80) shadow-sm">
                        <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
                            <div className="p-8">
                                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-(--ink-muted)">
                                    Privacy-first cognitive load
                                </p>
                                <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">
                                    Focus fragmentation, not surveillance.
                                </h1>
                                <p className="mt-4 max-w-2xl text-sm leading-6 text-(--ink-muted) md:text-base">
                                    This surface uses existing PR, review, work-item, and
                                    commit-time rollups to show where attention is being split. It
                                    does not collect IDE, keystroke, prompt, or session telemetry.
                                </p>
                            </div>
                            <div className="border-t border-(--card-stroke) bg-(--card-60) p-8 lg:border-l lg:border-t-0">
                                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-(--ink-muted)">
                                    Guardrail
                                </p>
                                <div className="mt-4 space-y-3 text-sm text-(--ink-muted)">
                                    <p>
                                        No leaderboards. No peer rankings. Team and repo aggregation
                                        comes first.
                                    </p>
                                    <p>
                                        Single-person views are limited to explicit self-reflection
                                        or coaching context.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>

                    <FilterBar view="cognitive-load" />

                    <ContextStrip filters={filters} origin={activeOrigin} />

                    <ViewSet
                        orientation="tabs"
                        items={tabs}
                        activeId={activeTab}
                        overviewId="overview"
                        ariaLabel="Cognitive Load views"
                    />

                    {activeTab === "heatmap" && canShowSelectedScope ? (
                        <HeatmapView
                            filters={filters}
                            scopeId={scopeId}
                            reviewHeatmap={reviewHeatmap}
                        />
                    ) : !canShowSelectedScope ? (
                        <section className="rounded-[1.75rem] border border-amber-400/40 bg-amber-50/80 p-6 text-amber-950 shadow-sm">
                            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
                                Individual guardrail
                            </p>
                            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                                Individual cognitive load is self-only.
                            </h2>
                            <p className="mt-3 max-w-3xl text-sm leading-6">
                                Person-scoped cognitive-load signals are available only when the
                                selected identity matches the current session. Use team or repo
                                aggregation for coaching, planning, and operational review.
                            </p>
                            <Link
                                href="/cognitive-load"
                                className="mt-5 inline-flex rounded-full bg-amber-950 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-50"
                            >
                                Return to team/repo view
                            </Link>
                        </section>
                    ) : (
                        <>
                            {isIndividualScope && (
                                <section className="rounded-[1.75rem] border border-(--accent)/30 bg-(--accent)/10 p-5 shadow-sm">
                                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-(--ink-muted)">
                                        Self-reflection mode
                                    </p>
                                    <p className="mt-2 text-sm leading-6 text-(--ink-muted)">
                                        Only you can open this individual cognitive-load view. These
                                        signals are for reflection on focus pressure, not manager
                                        review or peer comparison.
                                    </p>
                                </section>
                            )}

                            {fetchError ? (
                                <section className="rounded-[1.75rem] border border-rose-200 bg-rose-50 p-6 text-rose-800 shadow-sm">
                                    <p className="text-xs font-semibold uppercase tracking-[0.2em]">
                                        Data unavailable
                                    </p>
                                    <p className="mt-2 text-sm leading-6">{fetchError}</p>
                                </section>
                            ) : activeTab === "context-switching" ? (
                                <ContextSwitchingView
                                    trend={contextSpreadTrend}
                                    window={windowLabel}
                                />
                            ) : activeTab === "focus-pressure" ? (
                                <FocusPressureView
                                    interruption={interruptionTrend}
                                    reviewRequest={reviewRequestTrend}
                                    window={windowLabel}
                                />
                            ) : activeTab === "load-drivers" ? (
                                <LoadDriversView
                                    drivers={loadDrivers}
                                    hasData={hasData}
                                    window={windowLabel}
                                />
                            ) : (
                                <OverviewView signals={signals} window={windowLabel} />
                            )}
                        </>
                    )}
                </main>
            </div>
        </div>
    );
}
