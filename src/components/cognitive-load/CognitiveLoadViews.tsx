/**
 * Per-tab view bodies for the Cognitive Load surface (CHAOS-2079).
 *
 * Each tab renders a DISTINCT, real-data view derived from the cognitiveLoad
 * GraphQL signals (see cognitiveLoadFetchers.ts). These are server components —
 * they compose ChartFrame (server) around the echarts client charts, so the data
 * is fetched server-side in page.tsx and only the chart rendering is client-side.
 *
 * Empty states follow the project rule: show "no data" ONLY when the signal is
 * genuinely absent for the window. A real zero is still data and is plotted.
 */

import { Notice } from "@/components/ui/Notice";
import { DataState } from "@/components/ui/DataState";
import { ChartFrame } from "@/components/charts/ChartFrame";
import { TimeseriesChart } from "@/components/charts/TimeseriesChart";
import { orderTimeseriesPoints } from "@/components/charts/timeseriesData";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Inset } from "@/components/ui/Inset";
import { MetricCard } from "@/components/metrics/MetricCard";
import { MetricStrip } from "@/components/metrics/MetricStrip";
import { buttonClassName } from "@/components/shared/Button";
import { MeterRows } from "@/components/ui/MeterRows";
import { Section } from "@/components/ui/Section";
import { CTA_LABELS } from "@/lib/design/cta";
import { buildExploreUrl } from "@/lib/filters/url";
import type { MetricFilter } from "@/lib/filters/types";
import { withFilterParam } from "@/lib/filters/url";
export type TrendPoint = { day: string; value: number; label?: string };

export type LoadDriver = { label: string; value: number };

/** One KPI descriptor for the Overview grid (built in page.tsx from real averages). */
export type LoadKpi = {
    label: string;
    value: string;
    delta: string;
    deltaTone: string;
    interpretation: string;
    description: string;
};

type WindowLabel = { sinceDate: string; untilDate: string };

function emptyDescription(window: WindowLabel, hint: string): string {
    return `No signals for ${window.sinceDate} – ${window.untilDate}. ${hint}`;
}

// ---------------------------------------------------------------------------
// Page chrome shared by every tab: privacy header, guardrail and state notices.
// ---------------------------------------------------------------------------

/** The privacy framing of the page, compact, on every tab (text as production). */
export function PrivacyHeader() {
    return (
        <section
            className="overflow-hidden rounded-(--radius-md) border border-(--card-stroke) bg-(--card-80)"
            data-testid="cognitive-load-privacy-header"
        >
            <div className="grid gap-0 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.28em] text-(--ink-muted)">
                        Privacy-first cognitive load
                    </p>
                    <h2 className="mt-2 text-xl font-semibold tracking-tight md:text-2xl">
                        Focus fragmentation, not surveillance.
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-(--ink-muted)">
                        This surface uses existing PR, review, work-item, and commit-time rollups to
                        show where attention is being split. It does not collect IDE, keystroke,
                        prompt, or session telemetry.
                    </p>
                </div>
                <div className="border-t border-(--card-stroke) bg-(--card-60) p-5 lg:border-l lg:border-t-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-(--ink-muted)">
                        Guardrail
                    </p>
                    <div className="mt-3 space-y-2 text-sm text-(--ink-muted)">
                        <p>
                            No leaderboards. No peer rankings. Team and repo aggregation comes
                            first.
                        </p>
                        <p>
                            Single-person views are limited to explicit self-reflection or coaching
                            context.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}

/** Person scope that is not the signed-in user: the view is self-only (text as production). */
export function IndividualGuardrailNotice() {
    return (
        <Notice
            variant="warn"
            live={false}
            titleAs="h2"
            title="Individual cognitive load is self-only."
            action={
                <Link
                    href="/cognitive-load"
                    className="inline-flex rounded-full border border-(--card-stroke) px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-(--accent-2)"
                >
                    Return to team/repo view
                </Link>
            }
            data-testid="cognitive-load-individual-guardrail"
        >
            <p className="text-xs font-semibold uppercase tracking-[0.24em]">
                Individual guardrail
            </p>
            <p className="mt-2 max-w-3xl leading-6">
                Person-scoped cognitive-load signals are available only when the selected identity
                matches the current session. Use team or repo aggregation for coaching, planning,
                and operational review.
            </p>
        </Notice>
    );
}

/** The signed-in user looking at their own person scope (text as production). */
export function SelfReflectionNotice() {
    return (
        <Notice
            variant="info"
            live={false}
            title="Self-reflection mode"
            data-testid="cognitive-load-self-reflection"
        >
            Only you can open this individual cognitive-load view. These signals are for reflection
            on focus pressure, not manager review or peer comparison.
        </Notice>
    );
}

/** The cognitive-load request failed: the error state, not an empty one. */
export function LoadDataUnavailable({ message }: { message: string }) {
    return (
        <DataState
            variant="error"
            title="Data unavailable"
            message={message}
            data-testid="cognitive-load-data-unavailable"
        />
    );
}

// ---------------------------------------------------------------------------
// Overview — the at-a-glance KPI grid + aggregation contract.
// ---------------------------------------------------------------------------

export function OverviewView({
    signals,
    window,
    filters,
    activeRole,
    trend,
}: {
    signals: LoadKpi[] | null;
    window: WindowLabel;
    filters: MetricFilter;
    activeRole?: string;
    /** Per-day context spread, already fetched for the Context Switching tab (no new query). */
    trend: TrendPoint[];
}) {
    return (
        <>
            {!signals ? (
                <Section
                    title="No data for this window"
                    description="Read these as pressure cues, not scores."
                >
                    <p className="text-sm leading-6 text-(--ink-muted)">
                        No cognitive-load signals found for{" "}
                        <span className="font-medium text-foreground">{window.sinceDate}</span> to{" "}
                        <span className="font-medium text-foreground">{window.untilDate}</span>. Try
                        widening the date range or switching to a team scope.
                    </p>
                </Section>
            ) : (
                <MetricStrip data-testid="cognitive-load-tiles">
                    {signals.map((signal) => (
                        <MetricCard
                            key={signal.label}
                            as="article"
                            testId="cognitive-load-tile"
                            label={signal.label}
                            valueText={signal.value}
                            // The chip and the period text are the page's own strings and tone class.
                            deltaSlot={
                                <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <span className="rounded-full bg-(--accent-2)/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-(--accent-2)">
                                        {signal.interpretation}
                                    </span>
                                    <span className={`font-medium ${signal.deltaTone}`}>
                                        {signal.delta}
                                    </span>
                                </span>
                            }
                            description={signal.description}
                            hideTrend
                        />
                    ))}
                </MetricStrip>
            )}

            <div
                className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]"
                data-testid="cognitive-load-overview-lower"
            >
                <ContextSwitchingView
                    trend={trend}
                    window={window}
                    title="What is pulling attention apart?"
                />
                <Section title="How to read this">
                    <p className="text-sm leading-6 text-(--ink-muted)">
                        Read these as pressure cues. The values point to review load, context
                        spread, and time-boundary strain so teams can decide where to reduce
                        interruption before it becomes burnout risk.
                    </p>
                    <p className="mt-4 text-label-caps uppercase text-(--ink-muted)">
                        Aggregation contract
                    </p>
                    <Inset title="Team/repo-first by default">
                        Cognitive-load signals are presented as system pressure: review queues,
                        context spread, after-hours trend, and weekend trend. They are coaching
                        prompts, not performance judgments. Open the Context Switching, Focus
                        Pressure, and Load Drivers tabs to see each signal broken out over the
                        window.
                    </Inset>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                        <Link
                            href={withFilterParam(
                                "/cognitive-load?tab=load-drivers",
                                filters,
                                activeRole,
                            )}
                            className={buttonClassName("primary")}
                        >
                            <ArrowRight aria-hidden="true" className="h-4 w-4" />
                            {CTA_LABELS.exploreLoadDrivers}
                        </Link>
                        <Link
                            href={buildExploreUrl({
                                metric: "review_latency",
                                filters,
                                role: activeRole,
                            })}
                            className={buttonClassName("ghost")}
                        >
                            <ArrowRight aria-hidden="true" className="h-4 w-4" />
                            {CTA_LABELS.openEvidence}
                        </Link>
                    </div>
                </Section>
            </div>
        </>
    );
}

// ---------------------------------------------------------------------------
// Context Switching — per-day context spread trend.
// ---------------------------------------------------------------------------

/**
 * Summarize a per-day context-spread trend. Orders with the SAME helper TimeseriesChart
 * uses internally, so the "Latest" value is always the chronological last day even when
 * the caller passes unsorted input — the annotation must never disagree with the chart's
 * own ordering (CHAOS-2079: don't reintroduce the ordering bug in the annotation).
 */
export function contextSpreadSummary(trend: TrendPoint[]): {
    hasData: boolean;
    latest: number | null;
    peak: number | null;
} {
    // TrendPoint values are always numbers; the filter only narrows the shared
    // chart type (which allows null gaps) back to number.
    const values = orderTimeseriesPoints(trend).values.filter((v): v is number => v !== null);
    const hasData = values.length > 0;
    return {
        hasData,
        latest: hasData ? values[values.length - 1] : null,
        peak: hasData ? Math.max(...values) : null,
    };
}

export function ContextSwitchingView({
    trend,
    window,
    title = "Context spread per day",
}: {
    trend: TrendPoint[];
    window: WindowLabel;
    /** The Overview calls this chart "What is pulling attention apart?". */
    title?: string;
}) {
    const { hasData, latest, peak } = contextSpreadSummary(trend);

    return (
        <ChartFrame
            title={title}
            interpretation="Distinct repos, PRs, reviews, and touched file areas the team moved across each day. Higher spread means attention is split over more surfaces."
            threshold={
                latest != null
                    ? {
                          label: "Latest",
                          value: String(latest),
                          tone: latest > 6 ? "caution" : "default",
                      }
                    : undefined
            }
            band={peak != null ? { label: "Window peak", value: String(peak) } : undefined}
            isEmpty={!hasData}
            stateTitle="No context-spread data"
            stateDescription={emptyDescription(window, "Widen the window or pick a team scope.")}
            data-testid="cognitive-load-context-switching"
        >
            <TimeseriesChart data={trend} height={300} />
        </ChartFrame>
    );
}

// ---------------------------------------------------------------------------
// Focus Pressure — PR interruption load + review request load, per day.
// ---------------------------------------------------------------------------

export function FocusPressureView({
    interruption,
    reviewRequest,
    window,
}: {
    interruption: TrendPoint[];
    reviewRequest: TrendPoint[];
    window: WindowLabel;
}) {
    return (
        <section className="grid gap-4 lg:grid-cols-2">
            <ChartFrame
                title="PR interruption load"
                interpretation="Reviews, first-review events, and review feedback interrupting focused delivery, per day."
                isEmpty={interruption.length === 0}
                stateTitle="No interruption data"
                stateDescription={emptyDescription(
                    window,
                    "Widen the window or pick a team scope.",
                )}
                data-testid="cognitive-load-focus-pressure-interruption"
            >
                <TimeseriesChart data={interruption} height={280} />
            </ChartFrame>
            <ChartFrame
                title="Review request load"
                interpretation="Aggregate review requests the team absorbed per day — never a person-level queue ranking."
                isEmpty={reviewRequest.length === 0}
                stateTitle="No review-request data"
                stateDescription={emptyDescription(
                    window,
                    "Widen the window or pick a team scope.",
                )}
                data-testid="cognitive-load-focus-pressure-review"
            >
                <TimeseriesChart data={reviewRequest} height={280} />
            </ChartFrame>
        </section>
    );
}

// ---------------------------------------------------------------------------
// Load Drivers — composition of the count-based load signals.
// ---------------------------------------------------------------------------

/**
 * Summarize the load-driver composition. Presence (`hasData`) is the caller's signal that
 * the window has real cognitive-load rows; it is INDEPENDENT of magnitude. A window with
 * rows where every driver is zero is a healthy "no load" period that is still plotted, NOT
 * missing data — so `isEmpty` follows `hasData`, never the sum. The top-driver share is only
 * computed when there is a positive total (no share can be taken from a zero total).
 */
export function loadDriverSummary(
    drivers: LoadDriver[],
    hasData: boolean,
): {
    isEmpty: boolean;
    categories: string[];
    values: number[];
    top: LoadDriver | null;
    topShare: number | null;
} {
    // Rank drivers by average daily contribution; the longest bar dominates load.
    const ranked = [...drivers].sort((a, b) => b.value - a.value);
    const total = ranked.reduce((sum, d) => sum + d.value, 0);
    const top = total > 0 ? ranked[0] : null;
    return {
        isEmpty: !hasData,
        categories: ranked.map((d) => d.label),
        values: ranked.map((d) => Math.round(d.value * 10) / 10),
        top,
        topShare: top ? Math.round((top.value / total) * 100) : null,
    };
}

export function LoadDriversView({
    drivers,
    hasData,
    window,
}: {
    drivers: LoadDriver[];
    hasData: boolean;
    window: WindowLabel;
}) {
    const { isEmpty, categories, values, top, topShare } = loadDriverSummary(drivers, hasData);

    return (
        <ChartFrame
            title="Load drivers"
            interpretation="Average daily contribution of each load signal across the window. The longest bar is the dominant driver of cognitive load."
            threshold={
                top && topShare != null
                    ? {
                          label: "Top driver",
                          value: `${top.label} · ${topShare}%`,
                          tone: "caution",
                      }
                    : undefined
            }
            isEmpty={isEmpty}
            stateTitle="No load-driver data"
            stateDescription={emptyDescription(
                window,
                "Load drivers appear once cognitive-load signals are ingested for this window.",
            )}
            data-testid="cognitive-load-load-drivers"
        >
            <MeterRows
                rows={categories.map((label, i) => ({ label, value: values[i] ?? null }))}
                aria-label="Average daily contribution of each load driver"
                testId="load-driver-meter-rows"
            />
        </ChartFrame>
    );
}
