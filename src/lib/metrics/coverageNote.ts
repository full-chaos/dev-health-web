import { isNotMeasuredState } from "@/lib/metrics/metricDisplay";

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

/** The metric that serves a rate coverage (`rateCoverage`); every other metric serves null. */
export const REWORK_RATIO_KEY = "pr_rework_ratio";

/** The text of the note under a pull request rework ratio that rests on a part of the pull requests. */
export const REWORK_COVERAGE_NOTE_TEMPLATE = "Based on {percent} of merged pull requests";

/**
 * The coverage (0..1) as the percent text of the rework note, for a coverage below 100%.
 * A coverage above 0 and below 1% reads "<1%" (never "0%"); a coverage that rounds to 100 but is
 * below 1 reads "99%" (never "100%" beside a note). Null for 0 or less, 1 or more, or a non-number.
 */
export const reworkCoveragePercentText = (coverage: number | null | undefined): string | null => {
    if (typeof coverage !== "number" || !Number.isFinite(coverage)) return null;
    if (coverage <= 0 || coverage >= 1) return null;
    if (coverage < 0.01) return "<1%";
    return `${Math.min(99, Math.round(coverage * 100))}%`;
};

type ReworkCoverageRow = {
    metric?: string | null;
    has_data?: boolean;
    rate_state?: string | null;
    rate_coverage?: number | null;
};

/**
 * "Based on 7% of merged pull requests", or null (no note). The note needs a measured rework ratio
 * (the row has a value) and a served coverage below 100% and above 0. At 0 the rate has no value
 * and its own state text says why; at 1 or null there is nothing to qualify.
 */
export const reworkCoverageNote = (row: ReworkCoverageRow | null | undefined): string | null => {
    if (!row || row.metric !== REWORK_RATIO_KEY) return null;
    if (row.has_data === false || isNotMeasuredState(row.rate_state)) return null;
    const percent = reworkCoveragePercentText(row.rate_coverage);
    return percent === null ? null : REWORK_COVERAGE_NOTE_TEMPLATE.replace("{percent}", percent);
};

/** A tile caption with the coverage note appended ("<caption> · <note>") when the row has one. */
export const withReworkCoverageNote = (
    caption: string | undefined,
    row: ReworkCoverageRow | null | undefined,
): string | undefined => {
    const note = reworkCoverageNote(row);
    return note ? [caption, note].filter(Boolean).join(" · ") : caption;
};
