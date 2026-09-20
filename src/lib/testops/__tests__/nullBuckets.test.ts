import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/graphql/urqlClient", () => ({ graphqlFetch: vi.fn() }));

import {
    TimeseriesBucketSchema,
    TimeseriesResultSchema,
    type AnalyticsResult,
    type TimeseriesResult,
} from "@/lib/graphql/schemas/analytics";

import { normalizeAnalyticsDurations } from "../fetchers";
import { getDelta, getLatestValue, getSparkline, mergeSeriesByMeasure } from "../aggregateSeries";

// Missing is not zero: the Go plane returns `value: null` for an all-NULL bucket
// (Python returned 0). A null bucket is never parsed away, summed, averaged,
// divided or compared as 0; a produced 0 stays 0.

const series = (
    measure: string,
    team: string,
    buckets: Array<[string, number | null]>,
): TimeseriesResult => ({
    dimension: "TEAM",
    dimensionValue: team,
    measure,
    buckets: buckets.map(([date, value]) => ({ date, value })),
});

describe("TimeseriesBucketSchema", () => {
    it("accepts a null value (Go NULL bucket)", () => {
        expect(TimeseriesBucketSchema.safeParse({ date: "2026-06-01", value: null }).success).toBe(
            true,
        );
    });
    it("accepts 0 and keeps it 0", () => {
        const parsed = TimeseriesBucketSchema.parse({ date: "2026-06-01", value: 0 });
        expect(parsed.value).toBe(0);
    });
    it("still rejects a missing value and a non-number", () => {
        expect(TimeseriesBucketSchema.safeParse({ date: "2026-06-01" }).success).toBe(false);
        expect(TimeseriesBucketSchema.safeParse({ date: "2026-06-01", value: "1" }).success).toBe(
            false,
        );
    });
    it("accepts a result whose buckets mix null, 0 and numbers", () => {
        const parsed = TimeseriesResultSchema.parse(
            series("COVERAGE_LINE_PCT", "t", [
                ["2026-06-01", null],
                ["2026-06-02", 0],
                ["2026-06-03", 81.5],
            ]),
        );
        expect(parsed.buckets.map((b) => b.value)).toEqual([null, 0, 81.5]);
    });
});

describe("normalizeAnalyticsDurations", () => {
    const analytics = (buckets: Array<[string, number | null]>): AnalyticsResult => ({
        timeseries: [series("PIPELINE_DURATION_P95", "t", buckets)],
        breakdowns: [],
    });

    it("keeps a null duration bucket null instead of null / 60 = 0 minutes", () => {
        const out = normalizeAnalyticsDurations(analytics([["2026-06-01", null]]));
        expect(out.timeseries[0].buckets[0].value).toBeNull();
    });
    it("keeps a produced 0 as 0 and converts seconds to minutes", () => {
        const out = normalizeAnalyticsDurations(
            analytics([
                ["2026-06-01", 0],
                ["2026-06-02", 120],
            ]),
        );
        expect(out.timeseries[0].buckets.map((b) => b.value)).toEqual([0, 2]);
    });
});

describe("mergeSeriesByMeasure with null buckets", () => {
    it("means over non-null teams only (a missing team is not a 0)", () => {
        const merged = mergeSeriesByMeasure(
            [
                series("PIPELINE_SUCCESS_RATE", "a", [["2026-06-01", 90]]),
                series("PIPELINE_SUCCESS_RATE", "b", [["2026-06-01", null]]),
            ],
            "PIPELINE_SUCCESS_RATE",
        );
        expect(merged?.buckets).toEqual([{ date: "2026-06-01", value: 90 }]);
    });
    it("sums COUNT over non-null teams only", () => {
        const merged = mergeSeriesByMeasure(
            [
                series("COUNT", "a", [["2026-06-01", 3]]),
                series("COUNT", "b", [["2026-06-01", null]]),
            ],
            "COUNT",
        );
        expect(merged?.buckets[0].value).toBe(3);
    });
    it("is null when every team is null for the date (mean and sum)", () => {
        for (const measure of ["PIPELINE_SUCCESS_RATE", "COUNT"]) {
            const merged = mergeSeriesByMeasure(
                [
                    series(measure, "a", [["2026-06-01", null]]),
                    series(measure, "b", [["2026-06-01", null]]),
                ],
                measure,
            );
            expect(merged?.buckets[0].value).toBeNull();
        }
    });
    it("a produced 0 counts as a value: mean(0, 90) = 45, mean(0, null) = 0", () => {
        const both = mergeSeriesByMeasure(
            [
                series("TEST_PASS_RATE", "a", [["2026-06-01", 0]]),
                series("TEST_PASS_RATE", "b", [["2026-06-01", 90]]),
            ],
            "TEST_PASS_RATE",
        );
        expect(both?.buckets[0].value).toBe(45);
        const zeroAndNull = mergeSeriesByMeasure(
            [
                series("TEST_PASS_RATE", "a", [["2026-06-01", 0]]),
                series("TEST_PASS_RATE", "b", [["2026-06-01", null]]),
            ],
            "TEST_PASS_RATE",
        );
        expect(zeroAndNull?.buckets[0].value).toBe(0);
    });
    it("merges dates independently (one date null-only, one mixed)", () => {
        const merged = mergeSeriesByMeasure(
            [
                series("PIPELINE_SUCCESS_RATE", "a", [
                    ["2026-06-01", null],
                    ["2026-06-02", 80],
                ]),
                series("PIPELINE_SUCCESS_RATE", "b", [
                    ["2026-06-01", null],
                    ["2026-06-02", null],
                ]),
            ],
            "PIPELINE_SUCCESS_RATE",
        );
        expect(merged?.buckets.map((b) => b.value)).toEqual([null, 80]);
    });
    it("returns a single series unchanged, nulls included", () => {
        const only = series("COVERAGE_LINE_PCT", "a", [
            ["2026-06-01", null],
            ["2026-06-02", 0],
        ]);
        expect(mergeSeriesByMeasure([only], "COVERAGE_LINE_PCT")?.buckets).toEqual(only.buckets);
    });
});

describe("page helpers with null buckets", () => {
    const ts = [
        series("COVERAGE_LINE_PCT", "a", [
            ["2026-06-01", 70],
            ["2026-06-02", null],
        ]),
    ];

    it("getLatestValue is undefined (no value), not null/0, when the latest bucket is null", () => {
        expect(getLatestValue(ts, "COVERAGE_LINE_PCT")).toBeUndefined();
    });
    it("getLatestValue returns a produced 0", () => {
        expect(
            getLatestValue(
                [series("COVERAGE_LINE_PCT", "a", [["2026-06-01", 0]])],
                "COVERAGE_LINE_PCT",
            ),
        ).toBe(0);
    });
    it("getSparkline keeps null as a gap and 0 as 0", () => {
        const spark = getSparkline(
            [
                series("COVERAGE_LINE_PCT", "a", [
                    ["2026-06-01", 0],
                    ["2026-06-02", null],
                    ["2026-06-03", 5],
                ]),
            ],
            "COVERAGE_LINE_PCT",
        );
        expect(spark?.map((p) => p.value)).toEqual([0, null, 5]);
    });
    it("getDelta is undefined when either endpoint is null", () => {
        expect(getDelta(ts, "COVERAGE_LINE_PCT")).toBeUndefined();
        expect(
            getDelta(
                [
                    series("COVERAGE_LINE_PCT", "a", [
                        ["2026-06-01", null],
                        ["2026-06-02", 50],
                    ]),
                ],
                "COVERAGE_LINE_PCT",
            ),
        ).toBeUndefined();
    });
    it("getDelta still computes for two numbers", () => {
        expect(
            getDelta(
                [
                    series("COVERAGE_LINE_PCT", "a", [
                        ["2026-06-01", 50],
                        ["2026-06-02", 75],
                    ]),
                ],
                "COVERAGE_LINE_PCT",
            ),
        ).toBe(50);
    });
});
