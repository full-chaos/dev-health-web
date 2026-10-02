/**
 * The served `data_confidence.coverage_pct` as Home shows it: a whole percent between 0 and 100.
 * `undefined` when the API served no number, so the caller shows "Not reported" and never a
 * made-up value.
 */
export const formatCoveragePct = (coveragePct?: number | null): string | undefined =>
    typeof coveragePct === "number" && Number.isFinite(coveragePct)
        ? `${Math.max(0, Math.min(100, Math.round(coveragePct)))}%`
        : undefined;
