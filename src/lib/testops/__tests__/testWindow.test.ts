import { describe, expect, it } from "vitest";

import { formatTruncatedPercent } from "@/lib/formatters";

import {
    isPartialCoverage,
    PARTIAL_COVERAGE_BELOW_PCT,
    TestWindowResultSchema,
    testWindowFailed,
} from "../testWindow";
import { testWindowTiles } from "../testWindowTiles";

const served = (over: Record<string, unknown> = {}) => ({
    sinceDate: "2026-10-31",
    untilDate: "2026-11-13",
    coverage: { completedRuns: 71657, runsWithTests: 878, sharePct: 1.2252 },
    cases: { passed: 4555926, failed: 5, skipped: 7347, quarantined: 0, total: 4563278 },
    passRatePct: 99.99989,
    failureRatePct: 0.00011,
    flakeRatePct: 0,
    ...over,
});

describe("formatTruncatedPercent", () => {
    it("cuts down to one decimal and never rounds up to 100", () => {
        expect(formatTruncatedPercent(99.84)).toBe("99.8");
        expect(formatTruncatedPercent(99.96)).toBe("99.9");
        expect(formatTruncatedPercent(99.99989)).toBe("99.9");
        expect(formatTruncatedPercent(99.99999999995)).toBe("99.9");
        expect(formatTruncatedPercent(50)).toBe("50.0");
        expect(formatTruncatedPercent(4.3)).toBe("4.3");
        expect(formatTruncatedPercent(0.05)).toBe("0.0");
    });
    it("reads 100 only for a served 100, and clamps what is not a percent", () => {
        expect(formatTruncatedPercent(100)).toBe("100");
        expect(formatTruncatedPercent(100.0001)).toBe("100");
        expect(formatTruncatedPercent(-1)).toBe("0.0");
        expect(formatTruncatedPercent(Number.NaN)).toBe("");
    });
});

describe("TestWindowResultSchema", () => {
    it("takes the served shape, nulls included", () => {
        expect(TestWindowResultSchema.safeParse(served()).success).toBe(true);
        expect(
            TestWindowResultSchema.safeParse(
                served({
                    coverage: { completedRuns: 0, runsWithTests: 0, sharePct: null },
                    passRatePct: null,
                    failureRatePct: null,
                    flakeRatePct: null,
                }),
            ).success,
        ).toBe(true);
    });
    it("refuses a shape that is not served", () => {
        expect(TestWindowResultSchema.safeParse({ passRatePct: 100 }).success).toBe(false);
        expect(testWindowFailed({ fetchFailed: true })).toBe(true);
        expect(testWindowFailed(served())).toBe(false);
    });
});

describe("isPartialCoverage", () => {
    it("is partial below the cut, not at it, and never for an unserved share", () => {
        expect(PARTIAL_COVERAGE_BELOW_PCT).toBe(50);
        expect(isPartialCoverage(49.99)).toBe(true);
        expect(isPartialCoverage(50)).toBe(false);
        expect(isPartialCoverage(100)).toBe(false);
        expect(isPartialCoverage(null)).toBe(false);
    });
});

describe("testWindowTiles", () => {
    it("writes pm's prod record: 99.99989 reads 99.9%, the failure rate is not 0, coverage is partial", () => {
        const tiles = testWindowTiles(served(), {});
        expect(tiles.map((t) => [t.id, t.valueText])).toEqual([
            ["TEST_COVERAGE", "1.2%"],
            ["TEST_PASS_RATE", "99.9%"],
            ["TEST_FAILURE_RATE", "<0.1%"],
            ["TEST_FLAKE_RATE", "0%"],
            ["TEST_SKIPPED", undefined],
        ]);
        expect(tiles[0].note).toBe("878 of 71,657 completed runs report tests · partial");
        expect(tiles[4].value).toBe(7347);
        expect(tiles.every((t) => t.noDelta === true && t.delta === undefined)).toBe(true);
    });
    it("never writes a non-zero pass rate as 0: 0.04 reads <0.1%, a served 0 reads 0%, 99.99 stays 99.9%", () => {
        const text = (passRatePct: number) =>
            testWindowTiles(served({ passRatePct }), {})[1].valueText;
        expect(text(0.04)).toBe("<0.1%");
        expect(text(0)).toBe("0%");
        expect(text(99.99)).toBe("99.9%");
        expect(text(100)).toBe("100%");
    });
    it("keeps a coverage above 10 % below 100: 99.6 reads 99.6, never 100", () => {
        const tiles = testWindowTiles(
            served({ coverage: { completedRuns: 1000, runsWithTests: 996, sharePct: 99.96 } }),
            {},
        );
        expect(tiles[0].valueText).toBe("99.9%");
    });
    it("does not write a value for what is not served, and says so for a failed read", () => {
        const none = testWindowTiles(
            served({
                coverage: { completedRuns: 0, runsWithTests: 0, sharePct: null },
                passRatePct: null,
                failureRatePct: null,
                flakeRatePct: null,
            }),
            {},
        );
        expect(none.slice(0, 4).map((t) => [t.value, t.valueText])).toEqual(
            Array(4).fill([undefined, undefined]),
        );
        // A trend is not drawn beside a tile that reads "Not reported".
        const spark = [
            { ts: "2026-11-01", value: 1 },
            { ts: "2026-11-02", value: 2 },
        ];
        const sparked = testWindowTiles(
            served({ passRatePct: null, failureRatePct: null, flakeRatePct: 1 }),
            { pass: spark, failure: spark, flake: spark },
        );
        expect(sparked.map((t) => t.spark !== undefined)).toEqual([
            false,
            false,
            false,
            true,
            false,
        ]);
        const failed = testWindowTiles({ fetchFailed: true }, {});
        expect(failed.map((t) => t.value)).toEqual(Array(5).fill(undefined));
        expect(failed.map((t) => t.note)).toEqual(Array(5).fill("Test window could not be loaded"));
    });
});
