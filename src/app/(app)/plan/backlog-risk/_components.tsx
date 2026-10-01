/**
 * Testable sub-components for the Backlog Risk page.
 * Kept in a separate file to avoid pulling next-auth / server-only deps
 * into the unit-test environment (page.tsx imports requireSession).
 */
import type { ReactNode } from "react";
import { CircleCheck, TriangleAlert } from "lucide-react";

import { DataState } from "@/components/ui/DataState";
import { Notice } from "@/components/ui/Notice";
import { formatNumber } from "@/lib/formatters";
import type { ThroughputForecast, ThroughputRiskOverlay } from "@/lib/graphql/types";
import { STATUS_PILL } from "@/lib/statusPill";

const CARD = "rounded-(--radius-lg) border border-(--border) bg-(--surface) p-6";

// ── StatusBadge ───────────────────────────────────────────────────────────────

type StatusBadgeProps = { active: boolean };

/** Elevated / Normal as a status pill: icon and word, so color is never the only signal. */
export function StatusBadge({ active }: StatusBadgeProps) {
    const Icon = active ? TriangleAlert : CircleCheck;
    return (
        <span
            data-testid="wip-status"
            data-active={active ? "true" : "false"}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${
                active ? STATUS_PILL.caution : STATUS_PILL.positive
            }`}
        >
            <Icon aria-hidden="true" className="h-3 w-3" />
            {active ? "Elevated" : "Normal"}
        </span>
    );
}

// ── helpers ───────────────────────────────────────────────────────────────────

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

function formatRatioAsPercent(ratio: number) {
    return `${formatNumber(ratio * 100, { maximumFractionDigits: 0 })}%`;
}

/** The WIP congestion ratio as on /plan: "0.69×". It is a ratio of current WIP to the recent average, never a count. */
function formatCongestion(value: number) {
    return `${formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;
}

type EstimateCoverage = ThroughputForecast["estimateCoverage"];
type StaleWip = ThroughputForecast["staleWip"];

function Row({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-3 border-t border-(--border) py-3 text-sm first:border-t-0 first:pt-0">
            <dt className="text-(--text-muted)">{label}</dt>
            <dd className="font-semibold tabular-nums text-foreground">{value}</dd>
        </div>
    );
}

// ── Tiles ─────────────────────────────────────────────────────────────────────

function Tile({
    label,
    value,
    caption,
    pill,
    testId,
}: {
    label: string;
    value: string;
    caption: string;
    pill?: ReactNode;
    testId: string;
}) {
    return (
        <div data-testid={testId} className={CARD}>
            <div className="flex min-h-6 items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-[0.18em] text-(--text-muted)">{label}</p>
                {pill}
            </div>
            <p className="mt-3 text-3xl font-semibold tabular-nums">{value}</p>
            <p className="mt-2 text-xs text-(--text-muted)">{caption}</p>
        </div>
    );
}

type TilesProps = {
    overlay: ThroughputRiskOverlay;
    staleWip: StaleWip;
    estimateCoverage: EstimateCoverage;
};

/** The unestimated tile: a count, "No data" (a dash, never 0) when coverage is unavailable, or a real 0 for an empty backlog. */
function unestimatedTile(estimateCoverage: EstimateCoverage): { value: string; caption: string } {
    if (!estimateCoverage) return { value: "—", caption: "No data" };
    if (estimateCoverage.backlogSize === 0 && estimateCoverage.ratio == null) {
        return { value: "0", caption: "No open backlog" };
    }
    if (estimateCoverage.ratio == null) return { value: "—", caption: "No data" };
    return {
        value: `${formatNumber(estimateCoverage.unestimatedCount)} items`,
        caption: `${formatRatioAsPercent(estimateCoverage.ratio)} estimate coverage`,
    };
}

export function BacklogTiles({ overlay, staleWip, estimateCoverage }: TilesProps) {
    const p90 = staleWip?.p90AgeHours;
    const p50 = staleWip?.p50AgeHours;
    const unestimated = unestimatedTile(estimateCoverage);

    return (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-testid="backlog-tiles">
            <Tile
                testId="tile-wip-congestion"
                label="WIP congestion"
                value={formatCongestion(overlay.value)}
                pill={<StatusBadge active={overlay.active} />}
                caption={`vs typical · threshold ${formatCongestion(overlay.threshold)}`}
            />
            <Tile
                testId="tile-stale-wip"
                label="Stale WIP · P90"
                value={p90 == null ? "—" : formatAgeHours(p90)}
                caption={p90 == null ? "No data" : "90th percentile age of in-progress items"}
            />
            <Tile
                testId="tile-median-wip-age"
                label="Median WIP age"
                value={p50 == null ? "—" : formatAgeHours(p50)}
                caption={p50 == null ? "No data" : "Median in-progress age"}
            />
            <Tile
                testId="tile-unestimated"
                label="Unestimated work"
                value={unestimated.value}
                caption={unestimated.caption}
            />
        </section>
    );
}

// ── Backlog condition card ────────────────────────────────────────────────────

type BacklogConditionCardProps = {
    overlay: ThroughputRiskOverlay;
    /** Raw backlog item count (sum of latest wip_count_end_of_day rows). */
    backlogSize: number;
    staleWip: StaleWip;
};

export function BacklogConditionCard({
    overlay,
    backlogSize,
    staleWip,
}: BacklogConditionCardProps) {
    const p90 = staleWip?.p90AgeHours;
    const p50 = staleWip?.p50AgeHours;

    return (
        <section data-testid="backlog-condition" className={CARD}>
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-(--text-muted)">
                Backlog condition
            </h2>
            <dl className="mt-4">
                <Row label="WIP congestion" value={formatCongestion(overlay.value)} />
                <Row label="Open items · WIP panel" value={formatNumber(backlogSize)} />
                {p90 != null ? <Row label="P90 work age" value={formatAgeHours(p90)} /> : null}
                {p90 != null && p50 != null ? (
                    <Row label="Median work age" value={formatAgeHours(p50)} />
                ) : null}
            </dl>
            <p className="mt-3 text-xs text-(--text-muted)">
                Threshold {formatCongestion(overlay.threshold)} — ratio of current WIP to recent
                average. Items in backlog are the current snapshot.
            </p>
            {p90 == null ? (
                <DataState
                    variant="insufficient-confidence"
                    className="mt-4"
                    title="WIP age unavailable"
                    description="Sync in-progress work item age data to show how long current WIP has been open."
                />
            ) : null}
            <p className="mt-3 text-xs text-(--text-muted)">
                Normal congestion and aging work can coexist; do not flatten the panels into one
                status.
            </p>
        </section>
    );
}

// ── Estimate coverage card ────────────────────────────────────────────────────

export function EstimateCoverageCard({ estimateCoverage }: { estimateCoverage: EstimateCoverage }) {
    const title = (
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-(--text-muted)">
            Estimate coverage
        </h2>
    );

    if (!estimateCoverage) {
        return (
            <section className={CARD}>
                {title}
                <DataState
                    variant="insufficient-confidence"
                    className="mt-4"
                    title="Estimate coverage unavailable"
                    description="Sync open backlog estimate coverage to show how much work is planned without an estimate."
                    data-testid="unestimated-debt-unavailable"
                />
            </section>
        );
    }

    if (estimateCoverage.backlogSize === 0 && estimateCoverage.ratio == null) {
        return (
            <section className={CARD}>
                {title}
                <DataState
                    variant="detector-enabled-no-findings"
                    className="mt-4"
                    title="No open backlog"
                    description="Estimate coverage is connected, and there are no open backlog items in the selected scope."
                    data-testid="unestimated-debt-empty-backlog"
                />
            </section>
        );
    }

    if (estimateCoverage.ratio == null) {
        return (
            <section className={CARD}>
                {title}
                <DataState
                    variant="insufficient-confidence"
                    className="mt-4"
                    title="Estimate coverage unavailable"
                    description="The backlog exists, but estimate coverage was not computed for this scope."
                    data-testid="unestimated-debt-ratio-unavailable"
                />
            </section>
        );
    }

    return (
        <section className={CARD} data-testid="unestimated-debt-card">
            {title}
            <dl className="mt-4">
                <Row label="Coverage" value={formatRatioAsPercent(estimateCoverage.ratio)} />
                <Row label="Estimated" value={formatNumber(estimateCoverage.estimatedCount)} />
                <Row label="Unestimated" value={formatNumber(estimateCoverage.unestimatedCount)} />
                <Row
                    label="Open backlog · estimates panel"
                    value={formatNumber(estimateCoverage.backlogSize)}
                />
            </dl>
            <p className="mt-3 text-xs text-(--text-muted)">Missing estimates remain explicit.</p>
        </section>
    );
}

// ── Population notice ─────────────────────────────────────────────────────────

/**
 * The two panels count open items from two sources. When the two numbers
 * differ, say so in plain words; the page does not reconcile them. Nothing is
 * shown when they are equal or when estimate coverage is missing.
 */
export function PopulationNotice({
    wipCount,
    estimateCoverage,
}: {
    wipCount: number;
    estimateCoverage: EstimateCoverage;
}) {
    if (!estimateCoverage || estimateCoverage.backlogSize === wipCount) return null;

    return (
        <Notice variant="info" live={false} data-testid="population-notice">
            The WIP panel counts {formatNumber(wipCount)} open items and the estimate panel counts{" "}
            {formatNumber(estimateCoverage.backlogSize)}. The two populations are not reconciled.
        </Notice>
    );
}

// ── ForecastContent ───────────────────────────────────────────────────────────

type ForecastContentProps = { forecast: ThroughputForecast };

export function ForecastContent({ forecast }: ForecastContentProps) {
    return (
        <>
            <BacklogTiles
                overlay={forecast.wipCongestion}
                staleWip={forecast.staleWip}
                estimateCoverage={forecast.estimateCoverage}
            />

            <section className="grid gap-4 md:grid-cols-2">
                <BacklogConditionCard
                    overlay={forecast.wipCongestion}
                    backlogSize={forecast.backlogSize}
                    staleWip={forecast.staleWip}
                />
                <EstimateCoverageCard estimateCoverage={forecast.estimateCoverage} />
            </section>

            <PopulationNotice
                wipCount={forecast.backlogSize}
                estimateCoverage={forecast.estimateCoverage}
            />
        </>
    );
}

// ── NoForecastState ───────────────────────────────────────────────────────────

export function NoForecastState() {
    return (
        <DataState
            variant="insufficient-confidence"
            title="Not enough throughput history"
            description="Widen the date range, select a different team, or sync more work-item history to populate WIP signals."
        />
    );
}

/** A failed request is an error, not an empty state: the danger notice, with the same words as before. */
export function ForecastErrorState() {
    return (
        <Notice
            variant="danger"
            live={false}
            titleAs="h2"
            title="Backlog risk could not load"
            data-testid="backlog-risk-fetch-error"
        >
            The forecast request failed. Retry after the data service recovers; no placeholder
            backlog risk values are shown.
        </Notice>
    );
}
