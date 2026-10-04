"use client";

import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { MetricCard } from "@/components/metrics/MetricCard";
import { MetricStrip } from "@/components/metrics/MetricStrip";
import { buttonClassName } from "@/components/shared/Button";
import { Section } from "@/components/ui/Section";
import { allocationNodeLabel } from "@/lib/allocationSelection";
import { CTA_LABELS } from "@/lib/design/cta";
import Link from "next/link";
import { buildExploreUrl, withFilterParam } from "@/lib/filters/url";
import type { MetricFilter } from "@/lib/filters/types";
import { formatNumber } from "@/lib/formatters";
import { STATUS_PILL } from "@/lib/statusPill";
import {
    formatBandLabel,
    formatQuality,
    formatWorkUnitLabel,
    titleCase,
    topInvestmentKey,
} from "@/lib/investment";
import type {
    InvestmentConfidence,
    MetricDelta,
    ReworkThemeAllocation,
    SankeyResponse,
    WorkUnitInvestment,
} from "@/lib/types";
import type { InvestmentMixAggregate } from "@/lib/investmentMix";
import { AllocationCoverage } from "./AllocationCoverage";
import { EvidenceQualityBands } from "./EvidenceQualityBands";
import type { MixExplanationState } from "./types";

type ConfidencePanelProps = {
    filters: MetricFilter;
    activeRole?: string;
    workUnits: WorkUnitInvestment[];
    investmentMix: InvestmentMixAggregate | null;
    mixExplanation: MixExplanationState;
    teamCategoryFlow: SankeyResponse | null | undefined;
    repoTeamFlow: SankeyResponse | null | undefined;
    isCategoryFlowLoading: boolean;
    reworkMetric?: MetricDelta;
    /** Per-theme rework breakdown from home; absent/empty → honest empty. */
    reworkThemeAllocation?: ReworkThemeAllocation[];
};

export const CONFIDENCE_TONE: Record<string, string> = {
    high: STATUS_PILL.positive,
    moderate: STATUS_PILL.caution,
    low: STATUS_PILL.negative,
};

/** Pill classes of a confidence level; a level the table does not know is the muted pill. */
export const confidenceToneClass = (level: string | null | undefined): string =>
    CONFIDENCE_TONE[level ?? ""] ?? STATUS_PILL.muted;

const DRIVER_COPY: Record<string, string> = {
    low_text_signal: "Short descriptions lack categorization signals",
    weak_cross_links: "Few issue↔PR↔commit links detected",
    missing_evidence_metadata: "Over 30% of units have unknown quality",
    high_uncertainty_spread: "Quality varies significantly across units",
};

const LOW_BANDS = new Set(["low", "very_low", "unknown"]);

/** Maps a persisted evidence-quality band name to a confidence level. */
const BAND_TO_LEVEL: Record<string, InvestmentConfidence["level"]> = {
    high: "high",
    moderate: "moderate",
    medium: "moderate",
    low: "low",
    very_low: "low",
    unknown: "unknown",
};

/** Finite number within [min, max], else null. Rejects NaN/Infinity/out-of-range. */
function finiteInRange(value: number | null | undefined, min: number, max: number): number | null {
    return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
        ? value
        : null;
}

/**
 * Pick the dominant PERSISTED evidence-quality band as the confidence level.
 * This renders the persisted band distribution (its mode) — it does NOT apply a
 * synthetic client-side threshold to recompute a category. Returns "unknown"
 * when no recognized band is present.
 */
function dominantBandLevel(bandCounts: Record<string, number>): InvestmentConfidence["level"] {
    let best: InvestmentConfidence["level"] | null = null;
    let bestCount = -1;
    for (const [band, count] of Object.entries(bandCounts)) {
        const level = BAND_TO_LEVEL[band.toLowerCase()];
        if (level && count > bestCount) {
            best = level;
            bestCount = count;
        }
    }
    return best ?? "unknown";
}

/**
 * Derives a confidence object from PERSISTED evidence-quality stats, used as a
 * fallback when no investment explanation has been generated. The classification
 * level is the dominant PERSISTED band (rendering the persisted distribution),
 * NOT a client-side threshold on the mean. Returns null when there are no
 * classified work units (total <= 0) so the UI degrades to honest-empty instead
 * of fabricating a band. Persisted stats are not labelled AI-generated.
 *
 * @returns InvestmentConfidence when classified work units exist, null otherwise.
 */
export function deriveConfidenceFromStats(
    stats:
        | {
              mean?: number | null;
              stddev?: number | null;
              band_counts?: Record<string, number>;
          }
        | null
        | undefined,
): InvestmentConfidence | null {
    if (!stats) return null;

    // Keep only finite, non-negative band counts; their sum is the number of
    // classified work units and gates whether any confidence is shown at all.
    const bandMix: Record<string, number> = {};
    let total = 0;
    for (const [band, count] of Object.entries(stats.band_counts ?? {})) {
        if (typeof count === "number" && Number.isFinite(count) && count >= 0) {
            bandMix[band] = count;
            total += count;
        }
    }
    if (total <= 0) return null;

    return {
        level: dominantBandLevel(bandMix),
        quality_mean: finiteInRange(stats.mean, 0, 1),
        quality_stddev:
            typeof stats.stddev === "number" && Number.isFinite(stats.stddev) && stats.stddev >= 0
                ? stats.stddev
                : null,
        band_mix: bandMix,
        drivers: [],
    };
}

/**
 * Confidence tab — trust, attribution quality, and classification quality.
 *
 * Consolidates the formerly scattered confidence signals: the LLM's
 * classification confidence, a REAL evidence-quality band encoding (replacing
 * the orphaned legend), coverage/unassigned ownership, the lowest-confidence
 * work units, and the rework card moved here from its own tab. Everything reads
 * persisted distributions; nothing is recomputed at view time. Designed to
 * consume what exists today and degrade honestly until richer rework signals
 * land (CHAOS-2155).
 */
export function ConfidencePanel({
    filters,
    activeRole,
    workUnits,
    investmentMix,
    mixExplanation,
    teamCategoryFlow,
    repoTeamFlow,
    isCategoryFlowLoading,
    reworkMetric,
    reworkThemeAllocation = [],
}: ConfidencePanelProps) {
    const confidence =
        mixExplanation.data?.confidence ??
        deriveConfidenceFromStats(investmentMix?.evidence_quality_stats) ??
        null;
    const lowConfidenceUnits = useMemo(
        () =>
            workUnits
                .filter((unit) => LOW_BANDS.has(unit.evidence_quality.band ?? "unknown"))
                .map((unit) => ({
                    unit,
                    themeKey: topInvestmentKey(unit.investment?.themes),
                }))
                .sort(
                    (a, b) =>
                        (a.unit.evidence_quality.value ?? 0) - (b.unit.evidence_quality.value ?? 0),
                )
                .slice(0, 8),
        [workUnits],
    );

    const evidenceHref = withFilterParam("/investment?tab=evidence", filters, activeRole);
    const pct = (value: number) => formatNumber(value * 100, { maximumFractionDigits: 0 });

    return (
        <section className="flex flex-col gap-4.5" data-testid="investment-confidence">
            {/* Approved prototype `investmentConfidence()`: three tiles, each a served value. */}
            <MetricStrip data-testid="confidence-tiles">
                <MetricCard
                    testId="confidence-tile-mean"
                    label="Mean evidence quality"
                    hideTrend
                    valueText={
                        confidence?.quality_mean != null
                            ? `${pct(confidence.quality_mean)}%`
                            : undefined
                    }
                    deltaSlot={
                        <span>
                            {confidence?.quality_mean == null
                                ? "Not reported"
                                : confidence.quality_stddev != null
                                  ? `± ${pct(confidence.quality_stddev)}%`
                                  : "Spread not reported"}
                        </span>
                    }
                />
                <MetricCard
                    testId="confidence-tile-level"
                    label="Evidence quality"
                    hideTrend
                    valueText={confidence ? titleCase(confidence.level ?? "unknown") : undefined}
                    deltaSlot={
                        confidence ? (
                            (confidence.drivers?.length ?? 0) > 0 ? (
                                <span data-testid="confidence-drivers">
                                    {(confidence.drivers ?? []).map((driver, index) => (
                                        <span key={driver} title={DRIVER_COPY[driver] ?? driver}>
                                            {index > 0 ? " · " : ""}
                                            {driver.replace(/_/g, " ")}
                                        </span>
                                    ))}
                                </span>
                            ) : (
                                <span>Classification confidence</span>
                            )
                        ) : (
                            <span>
                                Classification confidence appears once an investment explanation has
                                been generated for this window.
                            </span>
                        )
                    }
                />
                {reworkMetric ? (
                    <MetricCard
                        testId="confidence-tile-rework"
                        label="PR Rework Ratio"
                        href={buildExploreUrl({
                            metric: "pr_rework_ratio",
                            filters,
                            role: activeRole,
                        })}
                        value={reworkMetric.value}
                        unit={reworkMetric.unit}
                        delta={reworkMetric.delta_pct}
                        spark={reworkMetric.spark}
                        caption="PRs requiring rework"
                    />
                ) : (
                    <MetricCard
                        testId="confidence-tile-rework"
                        label="PR Rework Ratio"
                        hideTrend
                        deltaSlot={<span>Rework signal not available yet</span>}
                    />
                )}
            </MetricStrip>

            <div className="grid gap-4.5 lg:grid-cols-2" data-testid="confidence-cards">
                <Section
                    title="Evidence quality bands"
                    description="Share of work units at each evidence-quality band. Segment width is the share; opacity matches band strength."
                >
                    <EvidenceQualityBands
                        evidenceQualityDistribution={investmentMix?.evidence_quality_distribution}
                    />
                </Section>

                <AllocationCoverage
                    variant="facts"
                    teamCategoryFlow={teamCategoryFlow}
                    repoTeamFlow={repoTeamFlow}
                    isLoading={isCategoryFlowLoading}
                />
            </div>

            <Section
                data-testid="low-confidence-areas"
                title="Low-confidence areas"
                description="Work units whose categorization leans on weaker evidence. These are the first places to corroborate before trusting the mix."
                action={
                    <Link href={evidenceHref} className={buttonClassName("ghost", "sm")}>
                        <ArrowRight aria-hidden="true" className="h-4 w-4" />
                        {CTA_LABELS.evidenceDrilldown}
                    </Link>
                }
            >
                {lowConfidenceUnits.length === 0 ? (
                    <p className="text-sm text-(--ink-muted)">
                        No low-confidence work units in the selected window.
                    </p>
                ) : (
                    <div className="overflow-hidden rounded-(--radius-md) border border-(--card-stroke)">
                        <table className="w-full text-sm" data-testid="low-confidence-table">
                            <thead className="bg-(--card-70) text-label-caps uppercase text-(--ink-muted)">
                                <tr>
                                    <th className="px-4 py-2 text-left font-medium">
                                        Theme / quality
                                    </th>
                                    <th className="px-4 py-2 text-left font-medium">Band</th>
                                    <th className="px-4 py-2 text-left font-medium">Work unit</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lowConfidenceUnits.map(({ unit, themeKey }) => {
                                    const band = unit.evidence_quality.band ?? "unknown";
                                    return (
                                        <tr
                                            key={unit.work_unit_id}
                                            data-testid="low-confidence-row"
                                            className="border-t border-(--card-stroke)"
                                        >
                                            <td className="whitespace-nowrap px-4 py-2 tabular-nums">
                                                {[
                                                    themeKey ? titleCase(themeKey) : null,
                                                    unit.evidence_quality.value !== null
                                                        ? formatQuality(unit.evidence_quality.value)
                                                        : null,
                                                ]
                                                    .filter(Boolean)
                                                    .join(" · ") || "Not reported"}
                                            </td>
                                            <td className="px-4 py-2">
                                                <span
                                                    data-testid="low-confidence-band"
                                                    className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs ${confidenceToneClass(
                                                        BAND_TO_LEVEL[band] ?? "unknown",
                                                    )}`}
                                                >
                                                    {formatBandLabel(band)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2 text-foreground">
                                                {formatWorkUnitLabel(unit)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Section>

            {/* Not drawn in the prototype: the served per-theme rework breakdown stays, last. */}
            {reworkThemeAllocation.length > 0 && (
                <Section
                    data-testid="rework-by-theme"
                    title="Rework by theme"
                    description="Share of PRs that were reopened or required follow-up rework commits. The breakdown shows which investment themes carry the most rework pressure."
                >
                    <ul className="space-y-3">
                        {reworkThemeAllocation.map((row) => (
                            <li key={row.theme}>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="font-medium">
                                        {row.theme
                                            ? allocationNodeLabel(row.theme, "category")
                                            : row.label}
                                    </span>
                                    <span className="text-xs text-(--ink-muted)">
                                        {formatNumber(row.allocation_pct, {
                                            maximumFractionDigits: 1,
                                        })}
                                        %
                                    </span>
                                </div>
                                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-r-(--radius-sm) bg-(--card-stroke)">
                                    {row.allocation_pct > 0 && (
                                        <div
                                            aria-hidden
                                            className="h-full rounded-r-(--radius-sm) bg-(--chart-color-1)"
                                            style={{
                                                width: `${Math.min(100, row.allocation_pct)}%`,
                                                minWidth: 2,
                                            }}
                                        />
                                    )}
                                </div>
                                <div className="mt-1 flex gap-3 text-xs text-(--ink-muted)">
                                    <span>
                                        {row.prs_merged.toLocaleString()} PR
                                        {row.prs_merged !== 1 ? "s" : ""}
                                    </span>
                                    <span>
                                        {formatNumber(row.churn_loc / 1000, {
                                            maximumFractionDigits: 1,
                                        })}
                                        k churn LOC
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ul>
                </Section>
            )}
        </section>
    );
}
