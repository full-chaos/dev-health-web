"use client";

import { useMemo } from "react";
import { AskDevTrigger } from "@/components/ask-dev/AskDevTrigger";
import { formatNumber } from "@/lib/formatters";
import { CTA_LABELS } from "@/lib/design/cta";
import {
    buildTimeRangeLabel,
    formatBandLabel,
    formatEffortUnit,
    formatQuality,
    formatWorkUnitLabel,
} from "@/lib/investment";
import type { MetricFilter } from "@/lib/filters/types";
import type { MetricDelta, ReworkThemeAllocation } from "@/lib/types";
import { useWorkUnitTeamAttributions } from "@/lib/graphql/hooks";
import { type InvestmentTab } from "./investment/types";
import { useInvestmentData } from "./investment/useInvestmentData";
import { InvestmentExplainer } from "./investment/InvestmentExplainer";
import { InvestmentCharts } from "./investment/InvestmentCharts";
import { InvestmentEvidenceTable } from "./investment/InvestmentEvidenceTable";
import { AllocationCoverage } from "./investment/AllocationCoverage";
import { ConfidencePanel } from "./investment/ConfidencePanel";
import { EvidenceEntryCard } from "./investment/EvidenceEntryCard";

// ── Types ────────────────────────────────────────────────────────────────────

type InvestmentViewProps = {
    filters: MetricFilter;
    activeRole?: string;
    activeTab?: InvestmentTab;
    /** Real `pr_rework_ratio` metric for the Rework card; absent → honest empty. */
    reworkMetric?: MetricDelta;
    /** Per-theme rework breakdown from home; absent/empty → honest empty. */
    reworkThemeAllocation?: ReworkThemeAllocation[];
};

// ── Sub-sections (render helpers) ────────────────────────────────────────────

/** The two <details> explainer cards. */
function ExplainerCards() {
    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <details className="rounded-2xl border border-(--card-stroke) bg-(--card-70) px-4 py-4">
                <summary className="cursor-pointer list-none font-(--font-display) text-base">
                    What this investment view represents
                </summary>
                <div className="mt-2">
                    <p className="text-sm text-(--ink-muted)">
                        These views show investment intent inferred from connected work activity
                        across issues, pull requests, commits, and files.
                    </p>
                    <p className="mt-2 text-sm text-(--ink-muted)">
                        Investment reflects how work appears to be aimed, based on text-first intent
                        plus structural and contextual corroboration. It is not a label, a verdict,
                        or an assessment of people.
                    </p>
                    <p className="mt-2 text-sm text-(--ink-muted)">
                        Because real work is messy, investment views are shown with evidence quality
                        and uncertainty rather than as fixed categories.
                    </p>
                    <ul className="mt-3 space-y-2 text-sm text-(--ink-muted)">
                        <li>Investment describes effort allocation, not individual performance.</li>
                        <li>
                            Categories are probabilistic, not exclusive. Work can span multiple
                            categories at once.
                        </li>
                        <li>Evidence quality reflects corroboration strength, not correctness.</li>
                        <li>
                            Low evidence quality indicates mixed or incomplete evidence, not bad
                            data.
                        </li>
                    </ul>
                    <p className="mt-3 text-xs text-(--ink-muted)">
                        These views do not assign intent, measure productivity, or evaluate
                        individuals.
                    </p>
                </div>
            </details>
            <details className="rounded-2xl border border-(--card-stroke) bg-(--card-70) px-4 py-4">
                <summary className="cursor-pointer list-none font-(--font-display) text-base">
                    How to read the visuals
                </summary>
                <div className="mt-2">
                    <ul className="space-y-2 text-sm text-(--ink-muted)">
                        <li>Size represents effort associated with a theme or subcategory.</li>
                        <li>Color indicates which theme or subcategory the work leans toward.</li>
                        <li>Opacity represents evidence quality for the interpretation.</li>
                        <li>
                            Flows show how effort appears to move from teams into themes and repos.
                        </li>
                        <li>
                            Use the investment mix chart to drill from themes into subcategories and
                            evidence.
                        </li>
                    </ul>
                </div>
            </details>
        </div>
    );
}

// ── Main component ───────────────────────────────────────────────────────────

export function InvestmentView({
    filters,
    activeRole,
    activeTab = "overview",
    reworkMetric,
    reworkThemeAllocation,
}: InvestmentViewProps) {
    const data = useInvestmentData({ filters });

    // All derived state is unconditional — data loads identically regardless of tab.
    const effortUnit = useMemo(() => {
        const metrics = new Set(data.workUnits.map((unit) => unit.effort.metric));
        if (metrics.size === 1) {
            const metric = metrics.values().next().value ?? "churn_loc";
            return formatEffortUnit(metric);
        }
        return "effort";
    }, [data.workUnits]);

    // Evidence-block dropdown lists every work unit in the window; the table
    // above it drives grouped navigation.
    const selectableUnits = data.workUnits;

    // Backend-computed owning team per visible work UNIT (CHAOS-2608 / CS7).
    // Render-only: surfaced as badges in the evidence table; never recomputed
    // client-side. Keyed by work_unit_id — the backend resolves the unit→team
    // collapse (work_item_id is a disjoint id space the client can't join).
    const workUnitIds = useMemo(
        () => data.workUnits.map((unit) => unit.work_unit_id),
        [data.workUnits],
    );
    // Only the Evidence tab renders the badges, so don't fetch attribution on the
    // other tabs (matches how the sibling investment hooks scope their fetches).
    const teamAttributions = useWorkUnitTeamAttributions({
        filters,
        workUnitIds,
        pause: activeTab !== "evidence",
    });

    const selectedUnitId = useMemo(() => {
        if (!data.selectedUnit) return "";
        return selectableUnits.some((unit) => unit.work_unit_id === data.selectedUnit?.work_unit_id)
            ? data.selectedUnit.work_unit_id
            : "";
    }, [data.selectedUnit, selectableUnits]);

    // ── Shared chart props ────────────────────────────────────────────────────
    const sharedChartProps = {
        filters: data.filters,
        activeRole,
        workUnits: data.workUnits,
        isLoading: data.isLoading,
        investmentMix: data.investmentMix,
        isMixLoading: data.isMixLoading,
        focusTheme: data.focusTheme,
        focusSubcategory: data.focusSubcategory,
        setFocusTheme: data.setFocusTheme,
        setFocusSubcategory: data.setFocusSubcategory,
        selectedCategory: data.selectedCategory,
        setSelectedCategory: data.setSelectedCategory,
        focusedTeam: data.focusedTeam,
        setFocusedTeam: data.setFocusedTeam,
        teamCategoryFlow: data.teamCategoryFlow,
        baselineSankeyFlow: data.baselineSankeyFlow,
        isCategoryFlowLoading: data.isCategoryFlowLoading,
        repoTeamFlow: data.repoTeamFlow,
        isRepoTeamLoading: data.isRepoTeamLoading,
        repoTeamFlowFailed: data.repoTeamFlowFailed,
        selectedThemeKey: data.selectedThemeKey,
        showSubcategories: data.showSubcategories,
    };

    // ── Evidence block (unit-investment tab + overview) ───────────────────────
    const evidenceBlock = (
        <div
            id="work-unit-calculation"
            className="rounded-3xl border border-(--card-stroke) bg-card p-5"
        >
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="font-(--font-display) text-lg">How this was calculated</h3>
                    <p className="mt-1 text-sm text-(--ink-muted)">
                        This interpretation is text-first, with provider metadata and contextual
                        structure used to corroborate the investment mix. Evidence quality reflects
                        how strongly those inputs align.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {data.selectedUnit ? (
                        <AskDevTrigger
                            context={{
                                routeId: "work_unit_detail",
                                entityRefs: [
                                    {
                                        entity_type: "work_unit",
                                        entity_id: data.selectedUnit.work_unit_id,
                                        display_label: "Selected work unit",
                                    },
                                ],
                                suggestedQuestionIds: [
                                    "delivery_status",
                                    "remaining_work",
                                    "data_trust",
                                ],
                            }}
                        />
                    ) : null}
                    <label
                        className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)"
                        htmlFor="work-unit-select"
                    >
                        Work unit
                    </label>
                    <select
                        id="work-unit-select"
                        className="rounded-lg border border-(--card-stroke) bg-(--card-70) px-3 py-2 text-xs"
                        value={selectedUnitId}
                        onChange={(event) => {
                            if (event.target.value) {
                                data.handleSelect(event.target.value);
                            }
                        }}
                    >
                        <option value="" disabled>
                            Select a work unit
                        </option>
                        {selectableUnits.map((unit) => (
                            <option key={unit.work_unit_id} value={unit.work_unit_id}>
                                {formatWorkUnitLabel(unit)}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {data.selectedUnit ? (
                <div className="mt-6 grid gap-6 lg:grid-cols-3">
                    <div className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                            Overview
                        </p>
                        <div className="mt-3 space-y-2 text-sm">
                            <div>
                                <span className="text-(--ink-muted)">Work unit:</span>{" "}
                                {formatWorkUnitLabel(data.selectedUnit)}
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-(--ink-muted)">
                                    {data.selectedUnitTypeLabel ? (
                                        <span className="rounded-full border border-(--card-stroke) px-2 py-0.5 text-[9px] uppercase tracking-[0.2em]">
                                            {data.selectedUnitTypeLabel}
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                            <div>
                                <span className="text-(--ink-muted)">Time range:</span>{" "}
                                {buildTimeRangeLabel(
                                    data.selectedUnit.time_range?.start,
                                    data.selectedUnit.time_range?.end,
                                )}
                            </div>
                            <div>
                                <span className="text-(--ink-muted)">Effort:</span>{" "}
                                {formatNumber(data.selectedUnit.effort.value)}{" "}
                                {formatEffortUnit(data.selectedUnit.effort.metric)}
                            </div>
                            <div>
                                <span className="text-(--ink-muted)">Evidence quality:</span>{" "}
                                {data.selectedUnit.evidence_quality.value !== null
                                    ? `${formatQuality(data.selectedUnit.evidence_quality.value)} (${formatBandLabel(data.selectedUnit.evidence_quality.band ?? "unknown")})`
                                    : "Unknown"}
                            </div>
                            {(data.selectedUnit.evidence?.textual ?? []).length > 0 && (
                                <div className="text-xs text-(--ink-muted)">
                                    Textual phrases informed the categorization.
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                            Structural evidence
                        </p>
                        <div className="mt-3 space-y-2 text-xs">
                            {(data.selectedUnit.evidence?.structural ?? []).length === 0 && (
                                <p className="text-(--ink-muted)">
                                    No structural evidence reported.
                                </p>
                            )}
                            {(data.selectedUnit.evidence?.structural ?? []).map((entry, idx) => (
                                <EvidenceEntryCard
                                    key={`structural-${idx}`}
                                    entry={entry as Record<string, unknown>}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                            Contextual evidence
                        </p>
                        <div className="mt-3 space-y-2 text-xs">
                            {(data.selectedUnit.evidence?.contextual ?? []).length === 0 && (
                                <p className="text-(--ink-muted)">
                                    No contextual evidence reported.
                                </p>
                            )}
                            {(data.selectedUnit.evidence?.contextual ?? []).map((entry, idx) => (
                                <EvidenceEntryCard
                                    key={`contextual-${idx}`}
                                    entry={entry as Record<string, unknown>}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4 lg:col-span-3">
                        <p className="text-xs uppercase tracking-[0.2em] text-(--ink-muted)">
                            Textual evidence
                        </p>
                        <div className="mt-3 space-y-2 text-xs">
                            {(data.selectedUnit.evidence?.textual ?? []).length === 0 && (
                                <p className="text-(--ink-muted)">No textual evidence reported.</p>
                            )}
                            {(data.selectedUnit.evidence?.textual ?? []).map((entry, idx) => (
                                <EvidenceEntryCard
                                    key={`textual-${idx}`}
                                    entry={entry as Record<string, unknown>}
                                />
                            ))}
                        </div>
                    </div>

                    {(data.isExplaining || data.explanation) && (
                        <div className="mt-4 overflow-hidden rounded-2xl border border-dashed border-(--accent-2) bg-(--accent-2-10) lg:col-span-3">
                            <div className="flex items-center justify-between border-b border-dashed border-(--accent-2) bg-(--accent-2-15) px-4 py-2">
                                <div className="flex items-center gap-2">
                                    <div className="rounded bg-(--accent-2) px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                                        AI-Generated
                                    </div>
                                    <span className="text-xs font-medium text-(--accent-2)">
                                        Investment Explanation
                                    </span>
                                </div>
                            </div>
                            <div className="p-5">
                                {data.isExplaining ? (
                                    <div className="flex items-center gap-2 text-sm text-(--ink-muted)">
                                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-(--accent-2) border-t-transparent" />
                                        Generating investment explanation...
                                    </div>
                                ) : data.explanation ? (
                                    <div className="space-y-6">
                                        <div>
                                            <h4 className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">
                                                Summary
                                            </h4>
                                            <p className="mt-2 text-sm leading-relaxed">
                                                {data.explanation.summary}
                                            </p>
                                        </div>

                                        <div className="grid gap-6 md:grid-cols-2">
                                            <div>
                                                <h4 className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">
                                                    Reasons
                                                </h4>
                                                <div className="mt-3 space-y-3">
                                                    {Object.entries(
                                                        data.explanation.category_rationale,
                                                    ).map(([cat, text]) => (
                                                        <div
                                                            key={cat}
                                                            className="rounded-lg bg-(--card-70) p-3"
                                                        >
                                                            <span className="text-[10px] font-bold uppercase text-(--accent-2)">
                                                                {cat}
                                                            </span>
                                                            <p className="mt-1 text-xs text-(--ink-muted)">
                                                                {text}
                                                            </p>
                                                        </div>
                                                    ))}
                                                    {data.explanation.evidence_highlights.length >
                                                        0 && (
                                                        <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-(--ink-muted)">
                                                            {data.explanation.evidence_highlights.map(
                                                                (highlight) => (
                                                                    <li key={highlight}>
                                                                        {highlight}
                                                                    </li>
                                                                ),
                                                            )}
                                                        </ul>
                                                    )}
                                                </div>
                                            </div>

                                            <div>
                                                <h4 className="text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">
                                                    Uncertainty
                                                </h4>
                                                <div className="mt-3 space-y-3">
                                                    <div className="rounded-lg bg-(--card-70) p-3">
                                                        <p className="text-xs text-(--ink-muted)">
                                                            {
                                                                data.explanation
                                                                    .uncertainty_disclosure
                                                            }
                                                        </p>
                                                    </div>
                                                    <div className="rounded-lg border border-(--card-stroke) bg-(--card-70) p-3">
                                                        <p className="text-xs font-medium italic text-(--ink-muted)">
                                                            {
                                                                data.explanation
                                                                    .evidence_quality_limits
                                                            }
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <p className="mt-6 text-sm text-(--ink-muted)">
                    Select a work unit from the dropdown to inspect evidence for the current focus.
                </p>
            )}
        </div>
    );

    // ── Tab branches ──────────────────────────────────────────────────────────
    // Non-overview tabs branch explicitly; "overview" is the final default
    // return below. With `activeTab: InvestmentTab` this is exhaustive.

    if (activeTab === "allocation") {
        return (
            <section className="flex flex-col gap-6">
                <div>
                    <h2 className="font-(--font-display) text-xl">Allocation</h2>
                    <p className="mt-2 text-sm text-(--ink-muted)">
                        How effort is distributed across teams, repositories, and themes. Each
                        allocation path maps a team or theme onto the repositories where the work
                        lands.
                    </p>
                </div>
                <AllocationCoverage
                    teamCategoryFlow={data.teamCategoryFlow}
                    repoTeamFlow={data.repoTeamFlow}
                    isLoading={data.isCategoryFlowLoading}
                />
                <InvestmentCharts {...sharedChartProps} section="flows" />
            </section>
        );
    }

    if (activeTab === "evidence") {
        return (
            <section className="flex flex-col gap-6">
                <div>
                    <h2 className="font-(--font-display) text-xl">{CTA_LABELS.evidence}</h2>
                    <p className="mt-2 text-sm text-(--ink-muted)">
                        The work units behind the investment mix. Group by theme, subcategory, or
                        type, then expand a unit to read its classification rationale and the
                        metadata that supports it.
                    </p>
                </div>
                <InvestmentEvidenceTable
                    workUnits={data.workUnits}
                    effortUnit={effortUnit}
                    onSelectWorkUnit={data.handleSelect}
                    attributionByWorkUnit={teamAttributions.byWorkUnitId}
                />
                {evidenceBlock}
            </section>
        );
    }

    if (activeTab === "confidence") {
        return (
            <ConfidencePanel
                filters={filters}
                activeRole={activeRole}
                workUnits={data.workUnits}
                investmentMix={data.investmentMix}
                mixExplanation={data.mixExplanation}
                teamCategoryFlow={data.teamCategoryFlow}
                repoTeamFlow={data.repoTeamFlow}
                isCategoryFlowLoading={data.isCategoryFlowLoading}
                reworkMetric={reworkMetric}
                reworkThemeAllocation={reworkThemeAllocation}
            />
        );
    }

    // overview (default) — key findings, the investment treemap, and top themes.
    // Sankey/Chord deliberately live on Allocation, not here.
    return (
        <section className="flex flex-col gap-6">
            <ExplainerCards />
            <InvestmentExplainer
                mixExplanation={data.mixExplanation}
                mixExplainKey={data.mixExplainKey}
                isExplainingMix={data.isExplainingMix}
                onRegenerate={data.regenerateMixExplanation}
            />
            <InvestmentCharts {...sharedChartProps} section="mix" />
        </section>
    );
}
