import { describe, it, expect } from "vitest";

import {
    getLatestValue,
    getSparkline,
    getDelta,
    seriesForScope,
    needsOneTeamPick,
} from "../aggregateSeries";
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

    it("returns no value for two team series and no ORG series (never their mean)", () => {
        const teamA = makeSeries("TEST_PASS_RATE", "team-a", [
            { date: "2024-01-01", value: 80 },
            { date: "2024-01-02", value: 90 },
        ]);
        const teamB = makeSeries("TEST_PASS_RATE", "team-b", [
            { date: "2024-01-01", value: 60 },
            { date: "2024-01-02", value: 70 },
        ]);
        expect(getLatestValue([teamA, teamB], "TEST_PASS_RATE")).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// getSparkline
// ---------------------------------------------------------------------------

describe("getSparkline", () => {
    it("returns undefined when no series match", () => {
        expect(getSparkline([], "TEST_FLAKE_RATE")).toBeUndefined();
    });

    it("returns no sparkline for two team series and no ORG series", () => {
        const teamA = makeSeries("TEST_FLAKE_RATE", "team-a", [
            { date: "2024-01-01", value: 4 },
            { date: "2024-01-02", value: 6 },
        ]);
        const teamB = makeSeries("TEST_FLAKE_RATE", "team-b", [
            { date: "2024-01-01", value: 8 },
            { date: "2024-01-02", value: 10 },
        ]);
        expect(getSparkline([teamA, teamB], "TEST_FLAKE_RATE")).toBeUndefined();
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

    it("returns no delta for two team series and no ORG series", () => {
        const teamA = makeSeries("PIPELINE_SUCCESS_RATE", "team-a", [
            { date: "2024-01-01", value: 20 },
            { date: "2024-01-10", value: 40 },
        ]);
        const teamB = makeSeries("PIPELINE_SUCCESS_RATE", "team-b", [
            { date: "2024-01-01", value: 80 },
            { date: "2024-01-10", value: 80 },
        ]);
        expect(getDelta([teamA, teamB], "PIPELINE_SUCCESS_RATE")).toBeUndefined();
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

// ---------------------------------------------------------------------------
// seriesForScope: one scope per tile or trend, never a mean across scopes
// ---------------------------------------------------------------------------

describe("seriesForScope", () => {
    const SUCCESS = "PIPELINE_SUCCESS_RATE";
    // The served shape: one series per team (scope DIMENSION) and the org-rate series (scope ORG).
    // team-a 1 of 1 = 100 %, team-b 1 of 9 = 11.1 %, org 2 of 10 = 20 %.
    const scoped = (
        dimensionValue: string,
        scope: "DIMENSION" | "ORG",
        values: number[],
        measure = SUCCESS,
    ): TimeseriesResult => ({
        dimension: "TEAM",
        dimensionValue,
        scope,
        measure,
        buckets: values.map((value, i) => ({ date: `2026-11-1${i}`, value })),
    });
    const served = [
        scoped("team-a", "DIMENSION", [100, 100]),
        scoped("team-b", "DIMENSION", [100 / 9, 100 / 9]),
        scoped("org", "ORG", [30, 20]),
    ];

    it("with no team selected reads the ORG series", () => {
        expect(seriesForScope(served, SUCCESS)?.scope).toBe("ORG");
        expect(getLatestValue(served, SUCCESS)).toBe(20);
    });

    it("never averages the ORG series in with the team series", () => {
        // The old reading: (100 + 11.1 + 20) / 3 = 43.70.
        expect(getLatestValue(served, SUCCESS)).not.toBeCloseTo(43.7, 1);
    });

    it("reads the spark and the change of the ORG series", () => {
        expect(getSparkline(served, SUCCESS)?.map((p) => p.value)).toEqual([30, 20]);
        expect(getDelta(served, SUCCESS)).toBeCloseTo(((20 - 30) / 30) * 100, 6);
    });

    it("with no ORG series and two team series served, reads no series (no merge)", () => {
        const teamsOnly = served.filter((series) => series.scope !== "ORG");
        expect(seriesForScope(teamsOnly, SUCCESS)).toBeUndefined();
    });

    it("with one team selected reads that team's series", () => {
        expect(getLatestValue(served, SUCCESS, ["team-b"])).toBeCloseTo(100 / 9, 6);
    });

    it("with one selected team that is not served reads no series", () => {
        expect(seriesForScope(served, SUCCESS, ["team-x"])).toBeUndefined();
        expect(getLatestValue(served, SUCCESS, ["team-x"])).toBeUndefined();
    });

    it("with several teams selected reads the ORG series, which the API reads under the team filter", () => {
        expect(seriesForScope(served, SUCCESS, ["team-a", "team-b"])?.scope).toBe("ORG");
    });
});

// ---------------------------------------------------------------------------
// No client-made series: the scope reads one served series, or none
// ---------------------------------------------------------------------------

describe("one served series per scope, never a merge of team series", () => {
    const series = (
        measure: string,
        dimensionValue: string,
        scope: "DIMENSION" | "ORG",
        values: number[],
    ): TimeseriesResult => ({
        dimension: "TEAM",
        dimensionValue,
        scope,
        measure,
        buckets: values.map((value, i) => ({ date: `2026-11-1${i}`, value })),
    });

    it("two team series that share one repository give a different merged value than the ORG series", () => {
        // team-a owns r1 (90 of 100 passed) and r2 (50 of 100); team-b owns r2 and r3 (100 of 100).
        // r2 is in both team series; the ORG series counts each repository once.
        const teamA = (90 + 50) / 200;
        const teamB = (50 + 100) / 200;
        const org = (90 + 50 + 100) / 300;
        const served = [
            series("TEST_PASS_RATE", "team-a", "DIMENSION", [teamA * 100]),
            series("TEST_PASS_RATE", "team-b", "DIMENSION", [teamB * 100]),
            series("TEST_PASS_RATE", "org", "ORG", [org * 100]),
        ];
        const oldMerge = ((teamA + teamB) / 2) * 100;
        expect(oldMerge).not.toBeCloseTo(org * 100, 1);
        expect(getLatestValue(served, "TEST_PASS_RATE")).toBeCloseTo(org * 100, 6);
        const teamsOnly = served.filter((s) => s.scope !== "ORG");
        expect(getLatestValue(teamsOnly, "TEST_PASS_RATE")).toBeUndefined();
        expect(getSparkline(teamsOnly, "TEST_PASS_RATE")).toBeUndefined();
        expect(getDelta(teamsOnly, "TEST_PASS_RATE")).toBeUndefined();
    });

    describe("a rate measure (it has an ORG series)", () => {
        const served = [
            series("TEST_FLAKE_RATE", "team-a", "DIMENSION", [2, 4]),
            series("TEST_FLAKE_RATE", "team-b", "DIMENSION", [6, 8]),
            series("TEST_FLAKE_RATE", "org", "ORG", [3, 5]),
        ];
        it("0 teams: the ORG series", () => {
            expect(getSparkline(served, "TEST_FLAKE_RATE")?.map((p) => p.value)).toEqual([3, 5]);
            expect(needsOneTeamPick(served, "TEST_FLAKE_RATE")).toBe(false);
        });
        it("1 team: that team's series", () => {
            expect(
                getSparkline(served, "TEST_FLAKE_RATE", ["team-b"])?.map((p) => p.value),
            ).toEqual([6, 8]);
        });
        it("several teams: the ORG series, read under the team filter", () => {
            expect(getLatestValue(served, "TEST_FLAKE_RATE", ["team-a", "team-b"])).toBe(5);
            expect(needsOneTeamPick(served, "TEST_FLAKE_RATE", ["team-a", "team-b"])).toBe(false);
        });
    });

    describe.each(["TEST_SUITE_DURATION_P95", "PIPELINE_DURATION_P95", "PIPELINE_QUEUE_TIME"])(
        "%s (no ORG series)",
        (measure) => {
            const a = series(measure, "team-a", "DIMENSION", [10, 12]);
            const b = series(measure, "team-b", "DIMENSION", [30, 40]);

            it("0 teams and one served team series: that series, as served", () => {
                expect(getLatestValue([a], measure)).toBe(12);
                expect(getSparkline([a], measure)?.map((p) => p.value)).toEqual([10, 12]);
                expect(needsOneTeamPick([a], measure)).toBe(false);
            });
            it("one team picked: that team's series", () => {
                expect(getLatestValue([a, b], measure, ["team-b"])).toBe(40);
                expect(needsOneTeamPick([a, b], measure, ["team-b"])).toBe(false);
            });
            it("two team series and no team picked: no value, the pick-one-team state", () => {
                expect(getLatestValue([a, b], measure)).toBeUndefined();
                expect(getSparkline([a, b], measure)).toBeUndefined();
                expect(getDelta([a, b], measure)).toBeUndefined();
                expect(needsOneTeamPick([a, b], measure)).toBe(true);
            });
            it("two team series and two teams picked: no value, the pick-one-team state", () => {
                expect(getLatestValue([a, b], measure, ["team-a", "team-b"])).toBeUndefined();
                expect(needsOneTeamPick([a, b], measure, ["team-a", "team-b"])).toBe(true);
            });
            it("nothing served: no value and no pick-one-team state", () => {
                expect(getLatestValue([], measure)).toBeUndefined();
                expect(needsOneTeamPick([], measure)).toBe(false);
            });
        },
    );
});
