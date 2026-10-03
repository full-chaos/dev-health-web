/**
 * Testable sub-components for the Backlog Risk page.
 * Kept in a separate file to avoid pulling next-auth / server-only deps
 * into the unit-test environment (page.tsx imports requireSession).
 */
import type { ReactNode } from "react";
import { CircleCheck, TriangleAlert } from "lucide-react";

import { EvidenceFact, EvidenceFactList } from "@/components/evidence/EvidenceFacts";
import type { PageFact } from "@/components/evidence/PageFactsEvidenceAction";
import { MetricCard } from "@/components/metrics/MetricCard";
import { MetricStrip } from "@/components/metrics/MetricStrip";
import { DataState } from "@/components/ui/DataState";
import { Section } from "@/components/ui/Section";
import { Notice } from "@/components/ui/Notice";
import { formatNumber } from "@/lib/formatters";
import type { ThroughputForecast, ThroughputRiskOverlay } from "@/lib/graphql/types";
import { STATUS_PILL } from "@/lib/statusPill";

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

const openItems = (count: number) =>
    `${formatNumber(count)} open ${count === 1 ? "item" : "items"}`;

type EstimateCoverage = ThroughputForecast["estimateCoverage"];
type StaleWip = ThroughputForecast["staleWip"];

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
        <MetricCard
            testId={testId}
            label={label}
            valueText={value}
            hideTrend
            deltaSlot={
                <>
                    {pill ? <span className="mr-2">{pill}</span> : null}
                    <span>{caption}</span>
                </>
            }
        />
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
        <MetricStrip data-testid="backlog-tiles">
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
        </MetricStrip>
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
        <Section
            data-testid="backlog-condition"
            title="Backlog condition"
            description="Normal congestion and aging work can coexist; do not flatten the panels into one status."
        >
            <EvidenceFactList aria-label="Backlog condition" testId="backlog-condition-facts">
                <EvidenceFact label="WIP congestion" value={formatCongestion(overlay.value)} />
                <EvidenceFact label="Open items · WIP panel" value={formatNumber(backlogSize)} />
                {p90 != null ? (
                    <EvidenceFact label="P90 work age" value={formatAgeHours(p90)} />
                ) : null}
                {p90 != null && p50 != null ? (
                    <EvidenceFact label="Median work age" value={formatAgeHours(p50)} />
                ) : null}
            </EvidenceFactList>
            <p className="mt-3 text-xs text-(--ink-muted)">
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
        </Section>
    );
}

// ── Estimate coverage card ────────────────────────────────────────────────────

const COVERAGE_DESCRIPTION = "Missing estimates remain explicit.";

export function EstimateCoverageCard({ estimateCoverage }: { estimateCoverage: EstimateCoverage }) {
    if (!estimateCoverage) {
        return (
            <Section title="Estimate coverage" description={COVERAGE_DESCRIPTION}>
                <DataState
                    variant="insufficient-confidence"
                    title="Estimate coverage unavailable"
                    description="Sync open backlog estimate coverage to show how much work is planned without an estimate."
                    data-testid="unestimated-debt-unavailable"
                />
            </Section>
        );
    }

    if (estimateCoverage.backlogSize === 0 && estimateCoverage.ratio == null) {
        return (
            <Section title="Estimate coverage" description={COVERAGE_DESCRIPTION}>
                <DataState
                    variant="detector-enabled-no-findings"
                    title="No open backlog"
                    description="Estimate coverage is connected, and there are no open backlog items in the selected scope."
                    data-testid="unestimated-debt-empty-backlog"
                />
            </Section>
        );
    }

    if (estimateCoverage.ratio == null) {
        return (
            <Section title="Estimate coverage" description={COVERAGE_DESCRIPTION}>
                <DataState
                    variant="insufficient-confidence"
                    title="Estimate coverage unavailable"
                    description="The backlog exists, but estimate coverage was not computed for this scope."
                    data-testid="unestimated-debt-ratio-unavailable"
                />
            </Section>
        );
    }

    return (
        <Section
            data-testid="unestimated-debt-card"
            title="Estimate coverage"
            description={COVERAGE_DESCRIPTION}
        >
            <EvidenceFactList aria-label="Estimate coverage" testId="estimate-coverage-facts">
                <EvidenceFact
                    label="Coverage"
                    value={formatRatioAsPercent(estimateCoverage.ratio)}
                />
                <EvidenceFact
                    label="Estimated"
                    value={formatNumber(estimateCoverage.estimatedCount)}
                />
                <EvidenceFact
                    label="Unestimated"
                    value={formatNumber(estimateCoverage.unestimatedCount)}
                />
                <EvidenceFact
                    label="Open backlog · estimates panel"
                    value={formatNumber(estimateCoverage.backlogSize)}
                />
            </EvidenceFactList>
        </Section>
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
            The WIP panel counts {openItems(wipCount)} and the estimate panel counts{" "}
            {formatNumber(estimateCoverage.backlogSize)}. The two populations are not reconciled.
        </Notice>
    );
}

// ── Evidence ──────────────────────────────────────────────────────────────────

/** The page's served values for the evidence drawer, as the tiles and cards show them. No new number. */
export function backlogFacts(forecast: ThroughputForecast): PageFact[] {
    const { wipCongestion, staleWip, estimateCoverage } = forecast;
    const p90 = staleWip?.p90AgeHours;
    const p50 = staleWip?.p50AgeHours;
    const ratio = estimateCoverage?.ratio;
    return [
        {
            label: "WIP congestion",
            value: `${formatCongestion(wipCongestion.value)} · ${wipCongestion.active ? "Elevated" : "Normal"}`,
        },
        { label: "Open items · WIP panel", value: formatNumber(forecast.backlogSize) },
        { label: "P90 work age", value: p90 == null ? undefined : formatAgeHours(p90) },
        { label: "Median work age", value: p50 == null ? undefined : formatAgeHours(p50) },
        { label: "Coverage", value: ratio == null ? undefined : formatRatioAsPercent(ratio) },
        {
            label: "Estimated",
            value: estimateCoverage ? formatNumber(estimateCoverage.estimatedCount) : undefined,
        },
        {
            label: "Unestimated",
            value: estimateCoverage ? formatNumber(estimateCoverage.unestimatedCount) : undefined,
        },
        {
            label: "Open backlog · estimates panel",
            value: estimateCoverage ? formatNumber(estimateCoverage.backlogSize) : undefined,
        },
    ];
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

            <div className="grid gap-4 md:grid-cols-2">
                <BacklogConditionCard
                    overlay={forecast.wipCongestion}
                    backlogSize={forecast.backlogSize}
                    staleWip={forecast.staleWip}
                />
                <EstimateCoverageCard estimateCoverage={forecast.estimateCoverage} />
            </div>

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
