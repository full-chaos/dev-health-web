/** The note text for a score that rests on a part of its inputs (CHAOS-9078). */
export const COVERAGE_NOTE_TEMPLATE = "Based on {percent}% of inputs";

/** The served coverage (0..1) as a whole percent; null when it is not a finite number. */
export const formatCoveragePercent = (coverage: number | null | undefined): number | null =>
    typeof coverage === "number" && Number.isFinite(coverage)
        ? Math.round(Math.min(1, Math.max(0, coverage)) * 100)
        : null;

/**
 * "Based on 60% of inputs" for a served coverage of 0.6; null (no note) when coverage is null.
 * Shown whenever a score is shown and coverage is served, at every coverage including 1; the
 * score keeps its severity colour.
 */
export const coverageNote = (coverage: number | null | undefined): string | null => {
    const percent = formatCoveragePercent(coverage);
    return percent === null ? null : COVERAGE_NOTE_TEMPLATE.replace("{percent}", String(percent));
};
