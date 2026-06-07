import { formatNumber } from "@/lib/formatters";
import {
    formatBandLabel,
    formatQuality,
    formatWorkUnitIdToken,
    formatWorkUnitLabel,
    formatWorkUnitTypeLabel,
} from "@/lib/investment";
import type { EvidenceUnit } from "./types";

type InvestmentWorkUnitListProps = {
    focusSubcategory: string | null;
    focusSubcategoryLabel: string;
    evidenceUnits: EvidenceUnit[];
    effortUnit: string;
    onClearSubcategory: () => void;
    onSelectWorkUnit: (workUnitId: string) => void;
    /**
     * When true, render the provided `evidenceUnits` even with no focused
     * subcategory (used by the self-contained Unit Investment tab so all work
     * units show on direct entry). Defaults to false (Overview drill-down,
     * which prompts the user to pick a subcategory first).
     */
    showAllWhenUnfocused?: boolean;
};

export function InvestmentWorkUnitList({
    focusSubcategory,
    focusSubcategoryLabel,
    evidenceUnits,
    effortUnit,
    onClearSubcategory,
    onSelectWorkUnit,
    showAllWhenUnfocused = false,
}: InvestmentWorkUnitListProps) {
    // Showing the un-focused "all units" listing rather than the drill prompt.
    const showingAllUnits = showAllWhenUnfocused && !focusSubcategory;
    // Drill-down is an evidence preview (top 6); the all-units listing is full.
    const visibleUnits = showingAllUnits ? evidenceUnits : evidenceUnits.slice(0, 6);

    return (
        <div className="rounded-3xl border border-(--card-stroke) bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="font-(--font-display) text-lg">Evidence drill-down</h3>
                    <span className="text-xs text-(--ink-muted)">
                        {focusSubcategory
                            ? `Work units that contributed to: ${focusSubcategoryLabel}.`
                            : showingAllUnits
                              ? "All work units in the selected window. Pick a subcategory in Mix to narrow."
                              : "Select a subcategory to inspect supporting work units."}
                    </span>
                </div>
                {focusSubcategory && (
                    <button
                        type="button"
                        onClick={onClearSubcategory}
                        className="rounded-full border border-(--card-stroke) px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)"
                    >
                        Clear subcategory
                    </button>
                )}
            </div>
            <div className="mt-4">
                {!focusSubcategory && !showingAllUnits ? (
                    <p className="text-sm text-(--ink-muted)">
                        Drill down into a theme and choose a subcategory to see the work units that
                        support it.
                    </p>
                ) : evidenceUnits.length === 0 ? (
                    <p className="text-sm text-(--ink-muted)">
                        {focusSubcategory
                            ? `No work units are currently linked to ${focusSubcategoryLabel}.`
                            : "No work units available for the selected window."}
                    </p>
                ) : (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {visibleUnits.map((entry) => {
                            const hasTextual = (entry.unit.evidence?.textual ?? []).length > 0;
                            const hasContextual =
                                (entry.unit.evidence?.contextual ?? []).length > 0;
                            const hasStructural =
                                (entry.unit.evidence?.structural ?? []).length > 0;
                            const signals: string[] = [];
                            if (hasTextual) signals.push("text");
                            if (hasContextual || hasStructural) signals.push("metadata");
                            const signalsLabel = signals.length
                                ? `Evidence signals: ${signals.join(" + ")}`
                                : "Evidence signals: inferred from available inputs";
                            const workUnitLabel = formatWorkUnitLabel(entry.unit);
                            const workUnitTypeLabel = formatWorkUnitTypeLabel(entry.unit);
                            const workUnitIdToken = formatWorkUnitIdToken(entry.unit.work_unit_id);

                            return (
                                <button
                                    key={entry.unit.work_unit_id}
                                    type="button"
                                    onClick={() => onSelectWorkUnit(entry.unit.work_unit_id)}
                                    className="rounded-2xl border border-(--card-stroke) bg-(--card-70) p-4 text-left transition hover:border-(--accent-2)"
                                >
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-medium text-foreground">
                                            {workUnitLabel}
                                        </div>
                                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-(--ink-muted)">
                                            {workUnitTypeLabel ? (
                                                <span className="rounded-full border border-(--card-stroke) px-2 py-0.5 text-[9px] uppercase tracking-[0.2em]">
                                                    {workUnitTypeLabel}
                                                </span>
                                            ) : null}
                                            <span>
                                                ID:{" "}
                                                <span className="font-mono text-[11px] tracking-normal text-(--ink)">
                                                    {workUnitIdToken}
                                                </span>
                                            </span>
                                            <button
                                                type="button"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    void navigator.clipboard?.writeText(
                                                        entry.unit.work_unit_id,
                                                    );
                                                }}
                                                className="rounded-full border border-(--card-stroke) px-2 py-0.5 text-[9px] uppercase tracking-[0.2em]"
                                            >
                                                Copy ID
                                            </button>
                                        </div>
                                    </div>
                                    <div className="mt-3 text-sm">
                                        <span className="text-(--ink-muted)">Weighted effort:</span>{" "}
                                        {formatNumber(entry.weightedEffort)} {effortUnit}
                                    </div>
                                    <div className="mt-1 text-xs text-(--ink-muted)">
                                        Evidence quality:{" "}
                                        {entry.unit.evidence_quality.value !== null
                                            ? `${formatQuality(entry.unit.evidence_quality.value)} (${formatBandLabel(entry.unit.evidence_quality.band ?? "unknown")})`
                                            : "Unknown"}
                                    </div>
                                    <div className="mt-2 text-[11px] text-(--ink-muted)">
                                        {signalsLabel}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
