import { z } from "zod";

import { NOT_REPORTED } from "@/components/evidence/EvidenceFacts";
import { formatPercent } from "@/lib/formatters";
import { READ_FAILED_MESSAGE } from "@/lib/readFailure";

/**
 * Coverage baseline per repository: the answer of `coverageBaselines`.
 *
 * The baseline of a repository is its own mean coverage over the 30 days BEFORE the request's
 * `endDate` (that day is not included). It is not a set target. The two baselines are in percent
 * (0 to 100), the unit of the coverage values. Null = fewer than 7 days of the 30 hold a value:
 * there is no baseline (never 0, never the current value). One row per repository with a stored
 * coverage row in those 30 days; a repository with no row has no baseline. The web writes the
 * served numbers and computes none of them.
 */
export const RepoCoverageBaselineSchema = z.object({
    repoId: z.string(),
    /** Null = the catalogue holds no name. Never the id. */
    repoName: z.string().nullable(),
    lineBaselinePct: z.number().nullable(),
    /** Days of the 30 that hold a line coverage value. */
    lineDays: z.number(),
    branchBaselinePct: z.number().nullable(),
    /** Days of the 30 that hold a branch coverage value. */
    branchDays: z.number(),
});

export const CoverageBaselinesSchema = z.array(RepoCoverageBaselineSchema);

export type RepoCoverageBaseline = z.infer<typeof RepoCoverageBaselineSchema>;

/** What the page gets: the served rows, or the fact that the read failed. */
export type CoverageBaselinesState = RepoCoverageBaseline[] | { fetchFailed: true };

export const coverageBaselinesFailed = (
    state: CoverageBaselinesState,
): state is { fetchFailed: true } => !Array.isArray(state);

/**
 * The `endDate` of the baseline read for a page window that ends on `windowEnd` ("YYYY-MM-DD",
 * included): the day after it. The API does not include `endDate`, so the 30 days then end on the
 * window's last day.
 */
export function baselineEndDate(windowEnd: string): string {
    const day = new Date(`${windowEnd}T00:00:00Z`);
    day.setUTCDate(day.getUTCDate() + 1);
    return day.toISOString().slice(0, 10);
}

/** One baseline as the page shows it. */
export type BaselineCell =
    /** A served baseline, with the days of the 30 that hold a value. */
    | { kind: "value"; pct: number; days: number }
    /** No baseline: a null value, or no row for the repository. */
    | { kind: "none" }
    /** The baseline read failed. */
    | { kind: "failed" };

/** The line or branch baseline of one repository, joined by the repository id. */
export function baselineOf(
    state: CoverageBaselinesState,
    repoId: string,
    which: "line" | "branch",
): BaselineCell {
    if (coverageBaselinesFailed(state)) return { kind: "failed" };
    const row = state.find((item) => item.repoId === repoId);
    const pct = which === "line" ? row?.lineBaselinePct : row?.branchBaselinePct;
    if (!row || pct === null || pct === undefined) return { kind: "none" };
    return { kind: "value", pct, days: which === "line" ? row.lineDays : row.branchDays };
}

/**
 * The coverage baseline of the whole scope: the answer of `coverageScopeBaseline`. The mean, over
 * the 30 days before the request's `endDate`, of the scope's line coverage of each day: the day
 * values the Line Coverage Trend draws. Null = fewer than 7 of the 30 days hold a value: there is
 * no baseline (never 0, never the current value).
 */
export const ScopeCoverageBaselineSchema = z.object({
    lineBaselinePct: z.number().nullable(),
    /** Days of the 30 on which the scope holds a line coverage value. */
    lineDays: z.number(),
});

export type ScopeCoverageBaseline = z.infer<typeof ScopeCoverageBaselineSchema>;

/** What the page gets: the served answer, or the fact that the read failed. */
export type ScopeCoverageBaselineState = ScopeCoverageBaseline | { fetchFailed: true };

/** The scope baseline as the page shows it. */
export function scopeBaselineCell(state: ScopeCoverageBaselineState): BaselineCell {
    if ("fetchFailed" in state) return { kind: "failed" };
    if (state.lineBaselinePct === null) return { kind: "none" };
    return { kind: "value", pct: state.lineBaselinePct, days: state.lineDays };
}

/**
 * The hint of the scope baseline (the fact "Target baseline"): the target is the running 30-day
 * average of line coverage, and `lineDays` is the served number of the 30 days that hold a value.
 * It is the same for a served value and for no baseline (the days then show why there is none). A
 * failed read has no hint: no days were served.
 *
 * The page sends no scope, so the served value is the organization's, and the hint says so. When
 * the page sends its scope (CHAOS-8583), this text must name that scope.
 */
export function scopeBaselineHint(state: ScopeCoverageBaselineState): string | undefined {
    if ("fetchFailed" in state) return undefined;
    return `Running 30-day average of the organization's line coverage; ${state.lineDays} of the 30 days hold a value`;
}

/** The baseline as text: the served percent, "Not reported" or "Could not be read". */
export function baselineText(cell: BaselineCell): string {
    if (cell.kind === "failed") return READ_FAILED_MESSAGE;
    if (cell.kind === "none") return NOT_REPORTED;
    return formatPercent(cell.pct);
}

/** The days behind a served baseline, for a tooltip. */
export function baselineTitle(cell: BaselineCell): string | undefined {
    if (cell.kind !== "value") return undefined;
    return `30-day average of ${cell.days} ${cell.days === 1 ? "day" : "days"}`;
}
