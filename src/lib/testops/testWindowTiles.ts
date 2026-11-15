import { formatMetricValue, formatNumber, formatTruncatedPercent } from "@/lib/formatters";
import type { TestOpsTile } from "@/app/(app)/testops/testOpsEvidence";
import type { SparkPoint } from "@/lib/types";

import { isPartialCoverage, testWindowFailed, type TestWindowState } from "./testWindow";

/** The series each rate tile keeps for its sparkline (a trend, not the tile's value). */
export type TestWindowSparks = {
    pass?: SparkPoint[];
    failure?: SparkPoint[];
    flake?: SparkPoint[];
};

const NOT_LOADED = "Test window could not be loaded";

/**
 * A percent as the tile writes it. From 10 up it is cut down to one decimal, never rounded up, so
 * no tile reads 100 unless it is 100; below 10 the shared rule applies (one decimal, and a value
 * that is not 0 never shows as 0: "<0.1%").
 */
const percentText = (value: number): string =>
    value >= 10 ? `${formatTruncatedPercent(value)}%` : formatMetricValue(value, "%");

/**
 * The window tiles of the Tests tab, from the served answer: test coverage, pass rate, failure
 * rate, flake rate and skipped cases. Every number is served; the only thing written here is the
 * text: a pass rate is cut down to one decimal and never reads 100 unless it is 100. No tile
 * carries a change value (the window field serves no prior window).
 */
export function testWindowTiles(window: TestWindowState, sparks: TestWindowSparks): TestOpsTile[] {
    const base = {
        inverseGood: false,
        delta: undefined,
        noDelta: true,
    } as const;

    if (testWindowFailed(window)) {
        const failed = (id: string, label: string): TestOpsTile => ({
            ...base,
            id,
            label,
            description: NOT_LOADED,
            note: NOT_LOADED,
            unit: "",
            value: undefined,
            spark: undefined,
        });
        return [
            failed("TEST_COVERAGE", "Test coverage"),
            failed("TEST_PASS_RATE", "Pass Rate"),
            failed("TEST_FAILURE_RATE", "Failure Rate"),
            failed("TEST_FLAKE_RATE", "Flake Rate"),
            failed("TEST_SKIPPED", "Skipped cases"),
        ];
    }

    const { coverage, cases } = window;
    const windowLabel = `${window.sinceDate} to ${window.untilDate}`;
    const share = coverage.sharePct;
    const coveredBy =
        share === null
            ? "No completed runs in this scope"
            : `of the ${percentText(share)} of completed runs that report tests`;

    return [
        {
            ...base,
            id: "TEST_COVERAGE",
            label: "Test coverage",
            description: `The share of completed CI runs, ${windowLabel}, that report tests (at least one test case). Failed runs without a test report appear on Pipelines.`,
            note:
                share === null
                    ? "No completed runs in this scope"
                    : `${formatNumber(coverage.runsWithTests)} of ${formatNumber(coverage.completedRuns)} completed runs report tests${isPartialCoverage(share) ? " · partial" : ""}`,
            unit: "%",
            value: share ?? undefined,
            valueText: share === null ? undefined : percentText(share),
            spark: undefined,
        },
        {
            ...base,
            id: "TEST_PASS_RATE",
            label: "Pass Rate",
            description: `Passed over passed plus failed test cases, ${windowLabel}. Skipped and quarantined cases are not in the rate.`,
            note: coveredBy,
            unit: "%",
            value: window.passRatePct ?? undefined,
            valueText:
                window.passRatePct === null
                    ? undefined
                    : `${formatTruncatedPercent(window.passRatePct)}%`,
            spark: sparks.pass,
        },
        {
            ...base,
            id: "TEST_FAILURE_RATE",
            label: "Failure Rate",
            description: `Failed over passed plus failed test cases, ${windowLabel}.`,
            note: coveredBy,
            unit: "%",
            value: window.failureRatePct ?? undefined,
            valueText:
                window.failureRatePct === null ? undefined : percentText(window.failureRatePct),
            spark: sparks.failure,
        },
        {
            ...base,
            id: "TEST_FLAKE_RATE",
            label: "Flake Rate",
            description: `Flaky case names over distinct case names, ${windowLabel}. Not available when a day of the window is stored without the counts.`,
            note: coveredBy,
            unit: "%",
            value: window.flakeRatePct ?? undefined,
            valueText: window.flakeRatePct === null ? undefined : percentText(window.flakeRatePct),
            spark: sparks.flake,
        },
        {
            ...base,
            id: "TEST_SKIPPED",
            label: "Skipped cases",
            description: `Test cases skipped in the window, ${windowLabel}. They are not in the pass or failure rate.`,
            note: "not in the pass rate",
            unit: "",
            value: cases.skipped,
            spark: undefined,
        },
    ];
}
