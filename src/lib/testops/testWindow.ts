import { z } from "zod";

/**
 * The window numbers of the TestOps Tests tab: the answer of `testopsTestWindow`.
 *
 * Coverage is the share of completed CI runs that report tests; the rates are weighted over the
 * window (summed counts, skipped and quarantined cases outside the rate). Every value is a percent
 * from 0 to 100 and null means "nothing to divide by", never 0. The web writes the served numbers;
 * it computes none.
 */
export const TestWindowResultSchema = z.object({
    sinceDate: z.string(),
    untilDate: z.string(),
    coverage: z.object({
        completedRuns: z.number(),
        runsWithTests: z.number(),
        sharePct: z.number().nullable(),
    }),
    cases: z.object({
        passed: z.number(),
        failed: z.number(),
        skipped: z.number(),
        quarantined: z.number(),
        total: z.number(),
    }),
    passRatePct: z.number().nullable(),
    failureRatePct: z.number().nullable(),
    flakeRatePct: z.number().nullable(),
    filterEmptyReason: z.string().nullish(),
});

export type TestWindowResult = z.infer<typeof TestWindowResultSchema>;

/** What the tiles get: the served answer, or the fact that the read failed. */
export type TestWindowState = TestWindowResult | { fetchFailed: true };

export const testWindowFailed = (state: TestWindowState): state is { fetchFailed: true } =>
    "fetchFailed" in state;

/** Below this share of completed runs, the tab says the window is partial (a UX cut, one place). */
export const PARTIAL_COVERAGE_BELOW_PCT = 50;

/** A served share below the cut is partial; an unserved share (no completed run) is not a share. */
export const isPartialCoverage = (sharePct: number | null): boolean =>
    sharePct !== null && sharePct < PARTIAL_COVERAGE_BELOW_PCT;
