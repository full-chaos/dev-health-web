import { describe, it, expect } from "vitest";

import { mergeSeriesByMeasure, getLatestValue, getSparkline, getDelta } from "../aggregateSeries";
import { TESTOPS_MEASURES } from "../constants";
import type { TimeseriesResult } from "@/lib/graphql/schemas/analytics";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSeries(
    measure: string,
    dimensionValue: string,
    buckets: { date: string; value: number }[],
): TimeseriesResult {
    return { dimension: "TEAM", dimensionValue, measure, buckets };
}

// ---------------------------------------------------------------------------
// mergeSeriesByMeasure
// ---------------------------------------------------------------------------

describe("mergeSeriesByMeasure", () => {
    it("returns undefined when no series match the measureId", () => {
        const result = mergeSeriesByMeasure([], "TEST_PASS_RATE");
        expect(result).toBeUndefined();
    });

    it("returns the single series unchanged when only one matches", () => {
        const single = makeSeries("TEST_PASS_RATE", "team-1", [{ date: "2024-01-01", value: 95 }]);
        const result = mergeSeriesByMeasure([single], "TEST_PASS_RATE");
        expect(result).toBe(single); // same reference — no copy
    });

    it("averages matching series for a rate/percentage measure (multi-team)", () => {
        const teamA = makeSeries("TEST_FLAKE_RATE", "team-a", [
            { date: "2024-01-01", value: 10 },
            { date: "2024-01-02", value: 20 },
        ]);
        const teamB = makeSeries("TEST_FLAKE_RATE", "team-b", [
            { date: "2024-01-01", value: 30 },
            { date: "2024-01-02", value: 40 },
        ]);
        const result = mergeSeriesByMeasure([teamA, teamB], "TEST_FLAKE_RATE");

        expect(result).toBeDefined();
        expect(result!.dimensionValue).toBe("org");
        expect(result!.measure).toBe("TEST_FLAKE_RATE");
        expect(result!.buckets).toEqual([
            { date: "2024-01-01", value: 20 }, // (10 + 30) / 2
            { date: "2024-01-02", value: 30 }, // (20 + 40) / 2
        ]);
    });

    it("sums matching series for a COUNT measure", () => {
        const teamA = makeSeries("COUNT", "team-a", [{ date: "2024-01-01", value: 100 }]);
        const teamB = makeSeries("COUNT", "team-b", [{ date: "2024-01-01", value: 200 }]);
        const result = mergeSeriesByMeasure([teamA, teamB], "COUNT");

        expect(result!.buckets[0].value).toBe(300); // 100 + 200
    });

    it("ignores series for other measures", () => {
        const flake = makeSeries("TEST_FLAKE_RATE", "team-a", [{ date: "2024-01-01", value: 5 }]);
        const pass = makeSeries("TEST_PASS_RATE", "team-a", [{ date: "2024-01-01", value: 90 }]);
        const result = mergeSeriesByMeasure([flake, pass], "TEST_FLAKE_RATE");

        expect(result!.buckets).toHaveLength(1);
        expect(result!.buckets[0].value).toBe(5);
    });

    it("handles sparse teams — dates present in only some series", () => {
        const teamA = makeSeries("PIPELINE_SUCCESS_RATE", "team-a", [
            { date: "2024-01-01", value: 80 },
            { date: "2024-01-02", value: 90 },
        ]);
        // team-b only has one date
        const teamB = makeSeries("PIPELINE_SUCCESS_RATE", "team-b", [
            { date: "2024-01-02", value: 70 },
        ]);
        const result = mergeSeriesByMeasure([teamA, teamB], "PIPELINE_SUCCESS_RATE");

        // 2024-01-01: only team-a → 80 / 1 = 80
        // 2024-01-02: both teams → (90 + 70) / 2 = 80
        expect(result!.buckets).toEqual([
            { date: "2024-01-01", value: 80 },
            { date: "2024-01-02", value: 80 },
        ]);
    });

    it("returns sorted dates ascending when series have out-of-order buckets", () => {
        const teamA = makeSeries("TEST_PASS_RATE", "team-a", [
            { date: "2024-01-03", value: 85 },
            { date: "2024-01-01", value: 75 },
        ]);
        const teamB = makeSeries("TEST_PASS_RATE", "team-b", [{ date: "2024-01-02", value: 80 }]);
        const result = mergeSeriesByMeasure([teamA, teamB], "TEST_PASS_RATE");
        const dates = result!.buckets.map((b) => b.date);
        expect(dates).toEqual(["2024-01-01", "2024-01-02", "2024-01-03"]);
    });
});

// ---------------------------------------------------------------------------
// getLatestValue
// ---------------------------------------------------------------------------

describe("getLatestValue", () => {
    it("returns undefined for empty timeseries", () => {
        expect(getLatestValue([], "TEST_PASS_RATE")).toBeUndefined();
    });

    it("returns undefined for measure with empty buckets", () => {
        const series = makeSeries("TEST_PASS_RATE", "team-a", []);
        expect(getLatestValue([series], "TEST_PASS_RATE")).toBeUndefined();
    });

    it("returns the last bucket value of the merged series", () => {
        const teamA = makeSeries("TEST_PASS_RATE", "team-a", [
            { date: "2024-01-01", value: 80 },
            { date: "2024-01-02", value: 90 },
        ]);
        const teamB = makeSeries("TEST_PASS_RATE", "team-b", [
            { date: "2024-01-01", value: 60 },
            { date: "2024-01-02", value: 70 },
        ]);
        // merged last bucket = (90 + 70) / 2 = 80
        expect(getLatestValue([teamA, teamB], "TEST_PASS_RATE")).toBe(80);
    });
});

// ---------------------------------------------------------------------------
// getSparkline
// ---------------------------------------------------------------------------

describe("getSparkline", () => {
    it("returns undefined when no series match", () => {
        expect(getSparkline([], "TEST_FLAKE_RATE")).toBeUndefined();
    });

    it("returns sparkline points for merged series", () => {
        const teamA = makeSeries("TEST_FLAKE_RATE", "team-a", [
            { date: "2024-01-01", value: 4 },
            { date: "2024-01-02", value: 6 },
        ]);
        const teamB = makeSeries("TEST_FLAKE_RATE", "team-b", [
            { date: "2024-01-01", value: 8 },
            { date: "2024-01-02", value: 10 },
        ]);
        const spark = getSparkline([teamA, teamB], "TEST_FLAKE_RATE");
        expect(spark).toEqual([
            { ts: "2024-01-01", value: 6 }, // (4 + 8) / 2
            { ts: "2024-01-02", value: 8 }, // (6 + 10) / 2
        ]);
    });
});

// ---------------------------------------------------------------------------
// getDelta
// ---------------------------------------------------------------------------

describe("getDelta", () => {
    it("returns undefined for empty timeseries", () => {
        expect(getDelta([], "TEST_PASS_RATE")).toBeUndefined();
    });

    it("returns undefined when fewer than 2 buckets exist after merge", () => {
        const series = makeSeries("TEST_PASS_RATE", "team-a", [{ date: "2024-01-01", value: 80 }]);
        expect(getDelta([series], "TEST_PASS_RATE")).toBeUndefined();
    });

    it("returns undefined when first bucket value is zero (division guard)", () => {
        const series = makeSeries("TEST_PASS_RATE", "team-a", [
            { date: "2024-01-01", value: 0 },
            { date: "2024-01-02", value: 50 },
        ]);
        expect(getDelta([series], "TEST_PASS_RATE")).toBeUndefined();
    });

    it("computes period-over-period delta for a single-team series", () => {
        const series = makeSeries("TEST_PASS_RATE", "team-a", [
            { date: "2024-01-01", value: 80 },
            { date: "2024-01-10", value: 100 },
        ]);
        // ((100 - 80) / 80) * 100 = 25%
        expect(getDelta([series], "TEST_PASS_RATE")).toBeCloseTo(25);
    });

    it("computes delta on the merged multi-team series, not a single team", () => {
        // team-a: 20 → 40 alone would be +100%
        // team-b: 80 → 80 alone would be 0%
        // merged: (20+80)/2=50 → (40+80)/2=60 → ((60-50)/50)*100 = +20%
        const teamA = makeSeries("PIPELINE_SUCCESS_RATE", "team-a", [
            { date: "2024-01-01", value: 20 },
            { date: "2024-01-10", value: 40 },
        ]);
        const teamB = makeSeries("PIPELINE_SUCCESS_RATE", "team-b", [
            { date: "2024-01-01", value: 80 },
            { date: "2024-01-10", value: 80 },
        ]);
        expect(getDelta([teamA, teamB], "PIPELINE_SUCCESS_RATE")).toBeCloseTo(20);
    });

    it("a multi-day merged series does not trip 'No trend yet' (length >= 2)", () => {
        const teamA = makeSeries("TEST_FLAKE_RATE", "team-a", [
            { date: "2024-01-01", value: 5 },
            { date: "2024-01-02", value: 3 },
            { date: "2024-01-03", value: 4 },
        ]);
        const teamB = makeSeries("TEST_FLAKE_RATE", "team-b", [
            { date: "2024-01-01", value: 7 },
            { date: "2024-01-02", value: 5 },
            { date: "2024-01-03", value: 6 },
        ]);
        const merged = mergeSeriesByMeasure([teamA, teamB], "TEST_FLAKE_RATE");
        // Merged has 3 buckets — getDelta should return a number, not undefined
        expect(merged!.buckets.length).toBeGreaterThanOrEqual(2);
        expect(getDelta([teamA, teamB], "TEST_FLAKE_RATE")).not.toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// goodDirection / inverseGood regression (C2)
// ---------------------------------------------------------------------------

describe("getDelta truthfulness + goodDirection for inverseGood wiring", () => {
    it("FAILURE_RATE increase: getDelta returns the RAW positive number (+100%), not negated", () => {
        // Regression guard: the displayed number must be truthful.
        // A Failure Rate going 5% → 10% is an increase of +100% — the raw delta
        // must stay +100% so MetricDelta can render "↑ +100%" (correct direction
        // and number). MetricCard sets inverseGood=true for this metric so
        // MetricDelta colours the positive delta RED (caution), not green.
        const failureSeries = makeSeries("PIPELINE_FAILURE_RATE", "team-a", [
            { date: "2024-01-01", value: 5 },
            { date: "2024-01-10", value: 10 },
        ]);
        const delta = getDelta([failureSeries], "PIPELINE_FAILURE_RATE");

        // Number must be truthful — an increase stays positive
        expect(delta).toBeGreaterThan(0);
        expect(delta).toBeCloseTo(100); // (10-5)/5 * 100

        // goodDirection "down" on this metric means the PAGE passes inverseGood=true
        // to MetricCard → MetricDelta colours a positive delta as caution (red).
        expect(TESTOPS_MEASURES["PIPELINE_FAILURE_RATE"].goodDirection).toBe("down");
    });

    it("PASS_RATE increase: getDelta returns a positive number and goodDirection is 'up' (green)", () => {
        const passSeries = makeSeries("TEST_PASS_RATE", "team-a", [
            { date: "2024-01-01", value: 90 },
            { date: "2024-01-10", value: 99 },
        ]);
        const delta = getDelta([passSeries], "TEST_PASS_RATE");

        expect(delta).toBeGreaterThan(0);
        // goodDirection "up" → inverseGood=false → positive delta colours green (correct)
        expect(TESTOPS_MEASURES["TEST_PASS_RATE"].goodDirection).toBe("up");
    });

    it("all 'down' metrics in TESTOPS_MEASURES have goodDirection === 'down'", () => {
        const downMetrics = [
            "PIPELINE_FAILURE_RATE",
            "PIPELINE_DURATION_P95",
            "PIPELINE_QUEUE_TIME",
            "PIPELINE_RERUN_RATE",
            "TEST_FAILURE_RATE",
            "TEST_FLAKE_RATE",
            "TEST_SUITE_DURATION_P95",
        ];
        for (const id of downMetrics) {
            expect(TESTOPS_MEASURES[id]?.goodDirection).toBe("down");
        }
    });
});
