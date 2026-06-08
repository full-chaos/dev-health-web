"use client";

import { useMemo } from "react";
import { MetricCard } from "@/components/metrics/MetricCard";
import { DataState } from "@/components/ui/DataState";
import { buildExploreUrl } from "@/lib/filters/url";
import type { MetricFilter } from "@/lib/filters/types";
import { formatNumber } from "@/lib/formatters";
import {
    formatBandLabel,
    formatQuality,
    formatWorkUnitLabel,
    titleCase,
    topInvestmentKey,
} from "@/lib/investment";
import type { MetricDelta, SankeyResponse, WorkUnitInvestment } from "@/lib/types";
import { AllocationCoverage } from "./AllocationCoverage";
import { EvidenceQualityBands } from "./EvidenceQualityBands";
import type { MixExplanationState } from "./types";

type ConfidencePanelProps = {
    filters: MetricFilter;
    activeRole?: string;
    workUnits: WorkUnitInvestment[];
    mixExplanation: MixExplanationState;
    teamCategoryFlow: SankeyResponse | null | undefined;
    repoTeamFlow: SankeyResponse | null | undefined;
    isCategoryFlowLoading: boolean;
    reworkMetric?: MetricDelta;
};

const CONFIDENCE_TONE: Record<string, string> = {
    high: "bg-emerald-500/20 text-emerald-600",
    moderate: "bg-amber-500/20 text-amber-600",
    low: "bg-red-500/20 text-red-600",
};

const DRIVER_COPY: Record<string, string> = {
    low_text_signal: "Short descriptions lack categorization signals",
    weak_cross_links: "Few issue↔PR↔commit links detected",
    missing_evidence_metadata: "Over 30% of units have unknown quality",
    high_uncertainty_spread: "Quality varies significantly across units",
};

const LOW_BANDS = new Set(["low", "very_low", "unknown"]);

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
    mixExplanation,
    teamCategoryFlow,
    repoTeamFlow,
    isCategoryFlowLoading,
    reworkMetric,
}: ConfidencePanelProps) {
    const confidence = mixExplanation.data?.confidence ?? null;

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

    return (
        <section className="flex flex-col gap-6">
            <div>
                <h2 className="font-(--font-display) text-xl">Confidence</h2>
                <p className="mt-2 text-sm text-(--ink-muted)">
                    How much to trust this investment picture: classification confidence, evidence
                    quality, attribution coverage, and rework.
                </p>
            </div>

            <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
                <h3 className="font-(--font-display) text-lg">Classification confidence</h3>
                {confidence ? (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                        <span
                            className={`rounded-full px-2 py-0.5 text-xs uppercase ${
                                CONFIDENCE_TONE[confidence.level ?? ""] ??
                                "bg-gray-500/20 text-gray-500"
                            }`}
                        >
                            {confidence.level ?? "unknown"}
                        </span>
                        {confidence.quality_mean != null && (
                            <span className="text-xs text-(--ink-muted)">
                                Mean evidence quality:{" "}
                                {formatNumber(confidence.quality_mean * 100, {
                                    maximumFractionDigits: 0,
                                })}
                                %
                                {confidence.quality_stddev != null &&
                                    ` ± ${formatNumber(confidence.quality_stddev * 100, {
                                        maximumFractionDigits: 0,
                                    })}%`}
                            </span>
                        )}
                        {(confidence.drivers?.length ?? 0) > 0 && (
                            <div className="flex w-full flex-wrap gap-1">
                                {(confidence.drivers ?? []).map((driver) => (
                                    <span
                                        key={driver}
                                        title={DRIVER_COPY[driver] ?? driver}
                                        className="rounded-full bg-(--card-stroke)/50 px-2 py-0.5 text-xs text-(--ink-muted)"
                                    >
                                        {driver.replace(/_/g, " ")}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <p className="mt-3 text-sm text-(--ink-muted)">
                        Classification confidence appears once an investment explanation has been
                        generated for this window.
                    </p>
                )}
            </div>

            <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
                <h3 className="font-(--font-display) text-lg">Evidence quality bands</h3>
                <p className="mt-1 text-sm text-(--ink-muted)">
                    Share of work units at each evidence-quality band. Segment width is the share;
                    opacity matches band strength.
                </p>
                <div className="mt-4">
                    <EvidenceQualityBands workUnits={workUnits} />
                </div>
            </div>

            <AllocationCoverage
                teamCategoryFlow={teamCategoryFlow}
                repoTeamFlow={repoTeamFlow}
                isLoading={isCategoryFlowLoading}
            />

            <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
                <h3 className="font-(--font-display) text-lg">Low-confidence areas</h3>
                <p className="mt-1 text-sm text-(--ink-muted)">
                    Work units whose categorization leans on weaker evidence. These are the first
                    places to corroborate before trusting the mix.
                </p>
                {lowConfidenceUnits.length === 0 ? (
                    <p className="mt-3 text-sm text-(--ink-muted)">
                        No low-confidence work units in the selected window.
                    </p>
                ) : (
                    <ul className="mt-3 space-y-2">
                        {lowConfidenceUnits.map(({ unit, themeKey }) => (
                            <li
                                key={unit.work_unit_id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-(--card-stroke) bg-(--card-70) px-4 py-2 text-sm"
                            >
                                <span className="min-w-0 truncate text-foreground">
                                    {formatWorkUnitLabel(unit)}
                                </span>
                                <span className="flex items-center gap-3 text-xs text-(--ink-muted)">
                                    {themeKey ? <span>{titleCase(themeKey)}</span> : null}
                                    <span>
                                        {unit.evidence_quality.value !== null
                                            ? `${formatQuality(unit.evidence_quality.value)} (${formatBandLabel(unit.evidence_quality.band ?? "unknown")})`
                                            : formatBandLabel("unknown")}
                                    </span>
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
                <h3 className="font-(--font-display) text-lg">Rework</h3>
                <p className="mt-1 text-sm text-(--ink-muted)">
                    Share of churn in files changed by more than one commit in the window. Richer
                    rework signals are still being wired up.
                </p>
                {reworkMetric ? (
                    <div className="mt-4 grid gap-4 sm:max-w-md">
                        <MetricCard
                            label="Rework ratio"
                            href={buildExploreUrl({
                                metric: "rework_ratio",
                                filters,
                                role: activeRole,
                            })}
                            value={reworkMetric.value}
                            unit={reworkMetric.unit}
                            delta={reworkMetric.delta_pct}
                            spark={reworkMetric.spark}
                            caption="Churn from rework"
                        />
                    </div>
                ) : (
                    <div className="mt-4">
                        <DataState
                            variant="detector-unavailable"
                            title="Rework signal not available yet"
                            description="A dedicated rework breakdown isn't wired for this scope yet."
                        />
                    </div>
                )}
            </div>
        </section>
    );
}
