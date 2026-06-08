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

import { ChartFrame } from "@/components/charts/ChartFrame";
import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { TimeseriesChart } from "@/components/charts/TimeseriesChart";
import { orderTimeseriesPoints } from "@/components/charts/timeseriesData";

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
// Overview — the at-a-glance KPI grid + aggregation contract.
// ---------------------------------------------------------------------------

export function OverviewView({
    signals,
    window,
}: {
    signals: LoadKpi[] | null;
    window: WindowLabel;
}) {
    return (
        <>
            <section className="rounded-[1.75rem] border border-(--card-stroke) bg-(--card-90) p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-(--ink-muted)">
                            Interpretive load view
                        </p>
                        <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                            What is pulling attention apart?
                        </h2>
                    </div>
                    <span className="rounded-full border border-(--accent)/30 bg-(--accent)/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-(--accent)">
                        Team signal
                    </span>
                </div>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-(--ink-muted)">
                    Read these as pressure cues. The values point to review load, context spread,
                    and time-boundary strain so teams can decide where to reduce interruption before
                    it becomes burnout risk.
                </p>

                {!signals ? (
                    <div className="mt-6 rounded-2xl border border-(--card-stroke) bg-(--card-60) p-5 text-(--ink-muted)">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em]">
                            No data for this window
                        </p>
                        <p className="mt-2 text-sm leading-6">
                            No cognitive-load signals found for{" "}
                            <span className="font-medium text-foreground">{window.sinceDate}</span>{" "}
                            to <span className="font-medium text-foreground">{window.untilDate}</span>
                            . Try widening the date range or switching to a team scope.
                        </p>
                    </div>
                ) : (
                    <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                        {signals.map((signal) => (
                            <article
                                key={signal.label}
                                className="rounded-3xl border border-(--card-stroke) bg-card p-5 shadow-sm"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-(--ink-muted)">
                                        {signal.label}
                                    </p>
                                    <span className="rounded-full bg-(--accent-2)/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-(--accent-2)">
                                        {signal.interpretation}
                                    </span>
                                </div>
                                <div className="mt-5 flex items-baseline gap-2">
                                    <p className="text-4xl font-semibold tabular-nums">
                                        {signal.value}
                                    </p>
                                    <p className={`text-xs font-medium ${signal.deltaTone}`}>
                                        {signal.delta}
                                    </p>
                                </div>
                                <p className="mt-4 text-sm leading-6 text-(--ink-muted)">
                                    {signal.description}
                                </p>
                            </article>
                        ))}
                    </div>
                )}
            </section>

            <section className="rounded-[1.75rem] border border-(--card-stroke) bg-(--card-90) p-6 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-(--ink-muted)">
                    Aggregation contract
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                    Team/repo-first by default
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-(--ink-muted)">
                    Cognitive-load signals are presented as system pressure: review queues, context
                    spread, after-hours trend, and weekend trend. They are coaching prompts, not
                    performance judgments. Open the Context Switching, Focus Pressure, and Load
                    Drivers tabs to see each signal broken out over the window.
                </p>
            </section>
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
    const { values } = orderTimeseriesPoints(trend);
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
}: {
    trend: TrendPoint[];
    window: WindowLabel;
}) {
    const { hasData, latest, peak } = contextSpreadSummary(trend);

    return (
        <ChartFrame
            title="Context spread per day"
            interpretation="Distinct repos, PRs, reviews, and touched file areas the team moved across each day. Higher spread means attention is split over more surfaces."
            threshold={
                latest != null
                    ? { label: "Latest", value: String(latest), tone: latest > 6 ? "caution" : "default" }
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
                stateDescription={emptyDescription(window, "Widen the window or pick a team scope.")}
                data-testid="cognitive-load-focus-pressure-interruption"
            >
                <TimeseriesChart data={interruption} height={280} />
            </ChartFrame>
            <ChartFrame
                title="Review request load"
                interpretation="Aggregate review requests the team absorbed per day — never a person-level queue ranking."
                isEmpty={reviewRequest.length === 0}
                stateTitle="No review-request data"
                stateDescription={emptyDescription(window, "Widen the window or pick a team scope.")}
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
                    ? { label: "Top driver", value: `${top.label} · ${topShare}%`, tone: "caution" }
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
            <HorizontalBarChart categories={categories} values={values} height={220} />
        </ChartFrame>
    );
}
