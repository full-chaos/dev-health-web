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
        <section className="grid gap-4 rounded-3xl border border-(--border) bg-(--card-80) p-6 md:grid-cols-2">
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
                <div className="rounded-3xl border border-(--border) bg-(--card-80) p-6">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-(--ink-muted)">
                        Stale WIP
                    </h2>
                    <DataState
                        variant="detector-unavailable"
                        className="mt-4"
                        title="WIP age not yet connected"
                        description="Items that appear stuck in progress will surface here once work item age data is connected."
                    />
                </div>

                <div className="rounded-3xl border border-(--border) bg-(--card-80) p-6">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-(--ink-muted)">
                        Unestimated Debt
                    </h2>
                    <DataState
                        variant="detector-unavailable"
                        className="mt-4"
                        title="Estimate coverage not yet connected"
                        description="The share of backlog items lacking estimates will appear here once estimate coverage data is connected."
                    />
                </div>
            </section>
        </>
    );
}

// ── NoForecastState ───────────────────────────────────────────────────────────

export function NoForecastState() {
    return (
        <section className="rounded-3xl border border-(--border) bg-(--card-80) p-8">
            <DataState
                variant="insufficient-confidence"
                title="Not enough throughput history"
                description="Widen the date range, select a different team, or sync more work-item history to populate WIP signals."
            />
        </section>
    );
}
