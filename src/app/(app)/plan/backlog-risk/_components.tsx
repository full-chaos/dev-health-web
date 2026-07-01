/**
 * Testable sub-components for the Backlog Risk page.
 * Kept in a separate file to avoid pulling next-auth / server-only deps
 * into the unit-test environment (page.tsx imports requireSession).
 */
import { DataState } from "@/components/ui/DataState";
import { formatNumber } from "@/lib/formatters";
import type { ThroughputForecast, ThroughputRiskOverlay } from "@/lib/graphql/types";

// ── StatusBadge ───────────────────────────────────────────────────────────────

type StatusBadgeProps = { active: boolean };

export function StatusBadge({ active }: StatusBadgeProps) {
    return (
        <span
            className={`rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${
                active ? "bg-amber-500/15 text-amber-200" : "bg-emerald-500/10 text-emerald-200"
            }`}
        >
            {active ? "Elevated" : "Normal"}
        </span>
    );
}

// ── WipCongestionCard ─────────────────────────────────────────────────────────

type WipCongestionCardProps = {
    /** wipCongestion overlay from the throughput-forecast resolver.
     *  overlay.value = current_wip / average_wip  (a ratio, NOT a count). */
    overlay: ThroughputRiskOverlay;
    /** Raw backlog item count (sum of latest wip_count_end_of_day rows). */
    backlogSize: number;
};

export function WipCongestionCard({ overlay, backlogSize }: WipCongestionCardProps) {
    // overlay.value is current_wip / average_wip — a congestion ratio (e.g. 1.25×).
    // overlay.threshold is WIP_CONGESTION_THRESHOLD from ops/metrics/forecast.py (1.25).
    const ratio = overlay.value;
    const ratioLabel = `×${formatNumber(ratio, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    return (
        <section className="grid gap-4 rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6 md:grid-cols-2">
            <div>
                <p className="text-xs uppercase tracking-[0.18em] text-(--ink-muted)">
                    WIP Congestion
                </p>
                <div className="mt-3 flex items-center gap-3">
                    <p className="text-3xl font-semibold">{ratioLabel} vs typical</p>
                    <StatusBadge active={overlay.active} />
                </div>
                <p className="mt-1 text-xs text-(--ink-muted)">
                    Threshold ×
                    {formatNumber(overlay.threshold, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                    })}
                    {" — "}
                    ratio of current WIP to recent average
                </p>
            </div>
            <div>
                <p className="text-xs uppercase tracking-[0.18em] text-(--ink-muted)">Open Items</p>
                <p className="mt-3 text-3xl font-semibold">{formatNumber(backlogSize)}</p>
                <p className="mt-1 text-xs text-(--ink-muted)">
                    Items in backlog (current snapshot)
                </p>
            </div>
        </section>
    );
}

type StaleWipCardProps = {
    staleWip: ThroughputForecast["staleWip"];
};

type UnestimatedDebtCardProps = {
    estimateCoverage: ThroughputForecast["estimateCoverage"];
};

function formatAgeHours(hours: number) {
    if (hours < 24) {
        const roundedHours = Math.round(hours);
        return `${formatNumber(roundedHours, { maximumFractionDigits: 0 })} ${roundedHours === 1 ? "hour" : "hours"}`;
    }

    const days = hours / 24;
    const roundedDays = Math.round(days * 10) / 10;
    const dayLabel = roundedDays === 1 ? "day" : "days";
    return `${formatNumber(roundedDays, { maximumFractionDigits: 1 })} ${dayLabel}`;
}

export function StaleWipCard({ staleWip }: StaleWipCardProps) {
    const p90AgeHours = staleWip?.p90AgeHours;

    return (
        <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-(--ink-muted)">
                Stale WIP
            </h2>
            {p90AgeHours == null ? (
                <DataState
                    variant="insufficient-confidence"
                    className="mt-4"
                    title="WIP age unavailable"
                    description="Sync in-progress work item age data to show how long current WIP has been open."
                />
            ) : (
                <div className="mt-4">
                    <p className="text-3xl font-semibold">{formatAgeHours(p90AgeHours)}</p>
                    <p className="mt-1 text-xs text-(--ink-muted)">
                        90th percentile age of in-progress items
                    </p>
                    {staleWip?.p50AgeHours != null ? (
                        <p className="mt-4 text-xs text-(--ink-muted)">
                            Median in-progress age: {formatAgeHours(staleWip.p50AgeHours)}
                        </p>
                    ) : null}
                </div>
            )}
        </div>
    );
}

function formatRatioAsPercent(ratio: number) {
    return `${formatNumber(ratio * 100, { maximumFractionDigits: 0 })}%`;
}

export function UnestimatedDebtCard({ estimateCoverage }: UnestimatedDebtCardProps) {
    if (!estimateCoverage) {
        return (
            <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6">
                <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-(--ink-muted)">
                    Unestimated Debt
                </h2>
                <DataState
                    variant="insufficient-confidence"
                    className="mt-4"
                    title="Estimate coverage unavailable"
                    description="Sync open backlog estimate coverage to show how much work is planned without an estimate."
                    data-testid="unestimated-debt-unavailable"
                />
            </div>
        );
    }

    if (estimateCoverage.backlogSize === 0 && estimateCoverage.ratio == null) {
        return (
            <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6">
                <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-(--ink-muted)">
                    Unestimated Debt
                </h2>
                <DataState
                    variant="detector-enabled-no-findings"
                    className="mt-4"
                    title="No open backlog"
                    description="Estimate coverage is connected, and there are no open backlog items in the selected scope."
                    data-testid="unestimated-debt-empty-backlog"
                />
            </div>
        );
    }

    if (estimateCoverage.ratio == null) {
        return (
            <div className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6">
                <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-(--ink-muted)">
                    Unestimated Debt
                </h2>
                <DataState
                    variant="insufficient-confidence"
                    className="mt-4"
                    title="Estimate coverage unavailable"
                    description="The backlog exists, but estimate coverage was not computed for this scope."
                    data-testid="unestimated-debt-ratio-unavailable"
                />
            </div>
        );
    }

    return (
        <div
            className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-6"
            data-testid="unestimated-debt-card"
        >
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-(--ink-muted)">
                Unestimated Debt
            </h2>
            <div className="mt-4">
                <p
                    className="text-3xl font-semibold tabular-nums"
                    data-testid="unestimated-debt-count"
                >
                    {formatNumber(estimateCoverage.unestimatedCount)} unestimated
                </p>
                <p className="mt-1 text-xs text-(--ink-muted)">
                    {formatRatioAsPercent(estimateCoverage.ratio)} estimate coverage
                </p>
            </div>
            <dl className="mt-5 grid gap-3 text-xs text-(--ink-muted) sm:grid-cols-3">
                <div className="rounded-2xl border border-(--card-stroke)/60 bg-(--card-60) p-3">
                    <dt className="uppercase tracking-[0.14em]">Estimated</dt>
                    <dd className="mt-1 text-sm font-semibold text-foreground tabular-nums">
                        {formatNumber(estimateCoverage.estimatedCount)}
                    </dd>
                </div>
                <div className="rounded-2xl border border-(--card-stroke)/60 bg-(--card-60) p-3">
                    <dt className="uppercase tracking-[0.14em]">Unestimated</dt>
                    <dd className="mt-1 text-sm font-semibold text-foreground tabular-nums">
                        {formatNumber(estimateCoverage.unestimatedCount)}
                    </dd>
                </div>
                <div className="rounded-2xl border border-(--card-stroke)/60 bg-(--card-60) p-3">
                    <dt className="uppercase tracking-[0.14em]">Open backlog</dt>
                    <dd className="mt-1 text-sm font-semibold text-foreground tabular-nums">
                        {formatNumber(estimateCoverage.backlogSize)}
                    </dd>
                </div>
            </dl>
        </div>
    );
}

// ── ForecastContent ───────────────────────────────────────────────────────────

type ForecastContentProps = { forecast: ThroughputForecast };

export function ForecastContent({ forecast }: ForecastContentProps) {
    return (
        <>
            <WipCongestionCard
                overlay={forecast.wipCongestion}
                backlogSize={forecast.backlogSize}
            />

            <section className="grid gap-4 md:grid-cols-2">
                <StaleWipCard staleWip={forecast.staleWip} />

                <UnestimatedDebtCard estimateCoverage={forecast.estimateCoverage} />
            </section>
        </>
    );
}

// ── NoForecastState ───────────────────────────────────────────────────────────

export function NoForecastState() {
    return (
        <section className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-8">
            <DataState
                variant="insufficient-confidence"
                title="Not enough throughput history"
                description="Widen the date range, select a different team, or sync more work-item history to populate WIP signals."
            />
        </section>
    );
}

export function ForecastErrorState() {
    return (
        <section className="rounded-3xl border border-(--card-stroke) bg-(--card-80) p-8">
            <DataState
                variant="error"
                title="Backlog risk could not load"
                message="The forecast request failed. Retry after the data service recovers; no placeholder backlog risk values are shown."
                data-testid="backlog-risk-fetch-error"
            />
        </section>
    );
}
