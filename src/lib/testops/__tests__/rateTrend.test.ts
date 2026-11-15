import { describe, expect, it } from "vitest";

import type { TimeseriesResult } from "@/lib/graphql/schemas/analytics";

import { buildPipelineRateTrend, hasPipelineRateData } from "../rateTrend";

const series = (
    measure: string,
    buckets: Array<[string, number | null]>,
    dimensionValue = "team-a",
): TimeseriesResult => ({
    dimension: "TEAM",
    dimensionValue,
    measure,
    buckets: buckets.map(([date, value]) => ({ date, value })),
});

describe("buildPipelineRateTrend", () => {
    it("lines the served success and failure rates up by day, in day order", () => {
        const points = buildPipelineRateTrend([
            series("PIPELINE_SUCCESS_RATE", [
                ["2026-09-02", 94],
                ["2026-09-01", 91],
            ]),
            series("PIPELINE_FAILURE_RATE", [
                ["2026-09-01", 3],
                ["2026-09-02", 2],
            ]),
        ]);
        expect(points).toEqual([
            { day: "2026-09-01", success: 91, failure: 3 },
            { day: "2026-09-02", success: 94, failure: 2 },
        ]);
    });

    it("keeps a day that one series does not serve as a gap (null), never 0 and never 100 minus the other", () => {
        const points = buildPipelineRateTrend([
            series("PIPELINE_SUCCESS_RATE", [
                ["2026-09-01", 91],
                ["2026-09-02", null],
                ["2026-09-03", 80],
            ]),
            series("PIPELINE_FAILURE_RATE", [["2026-09-02", 11]]),
        ]);
        expect(points).toEqual([
            { day: "2026-09-01", success: 91, failure: null },
            { day: "2026-09-02", success: null, failure: 11 },
            { day: "2026-09-03", success: 80, failure: null },
        ]);
    });

    it("keeps a served 0 as 0", () => {
        const points = buildPipelineRateTrend([
            series("PIPELINE_SUCCESS_RATE", [["2026-09-01", 100]]),
            series("PIPELINE_FAILURE_RATE", [["2026-09-01", 0]]),
        ]);
        expect(points).toEqual([{ day: "2026-09-01", success: 100, failure: 0 }]);
    });

    it("draws no line from several team series and no ORG series (never their mean)", () => {
        const points = buildPipelineRateTrend([
            series("PIPELINE_SUCCESS_RATE", [["2026-09-01", 90]], "team-a"),
            series("PIPELINE_SUCCESS_RATE", [["2026-09-01", 70]], "team-b"),
            series("PIPELINE_SUCCESS_RATE", [["2026-09-01", null]], "team-c"),
        ]);
        expect(points).toEqual([]);
    });

    it("ignores other measures and returns no point without the two series", () => {
        expect(
            buildPipelineRateTrend([series("PIPELINE_DURATION_P95", [["2026-09-01", 9]])]),
        ).toEqual([]);
    });
});

describe("hasPipelineRateData", () => {
    it("is false with no point or with only gaps, true with one served value (0 counts)", () => {
        expect(hasPipelineRateData([])).toBe(false);
        expect(hasPipelineRateData([{ day: "2026-09-01", success: null, failure: null }])).toBe(
            false,
        );
        expect(hasPipelineRateData([{ day: "2026-09-01", success: null, failure: 0 }])).toBe(true);
    });
});

describe("buildPipelineRateTrend reads one scope per series", () => {
    const scoped = (
        measure: string,
        dimensionValue: string,
        scope: "DIMENSION" | "ORG",
        value: number,
    ): TimeseriesResult => ({
        dimension: "TEAM",
        dimensionValue,
        scope,
        measure,
        buckets: [{ date: "2026-11-13", value }],
    });

    it("draws the ORG success series, not a mean of the teams and the org", () => {
        const points = buildPipelineRateTrend([
            scoped("PIPELINE_SUCCESS_RATE", "team-a", "DIMENSION", 100),
            scoped("PIPELINE_SUCCESS_RATE", "team-b", "DIMENSION", 100 / 9),
            scoped("PIPELINE_SUCCESS_RATE", "org", "ORG", 20),
            scoped("PIPELINE_FAILURE_RATE", "team-a", "DIMENSION", 0),
            scoped("PIPELINE_FAILURE_RATE", "team-b", "DIMENSION", 800 / 9),
        ]);
        expect(points).toHaveLength(1);
        expect(points[0].success).toBe(20);
        // No ORG failure series and two team series: no failure value, never the merge of the teams.
        expect(points[0].failure).toBeNull();
    });

    it("with ORG series for both rates from the same rows, success and failure sum to 100", () => {
        const points = buildPipelineRateTrend([
            scoped("PIPELINE_SUCCESS_RATE", "team-a", "DIMENSION", 100),
            scoped("PIPELINE_SUCCESS_RATE", "team-b", "DIMENSION", 100 / 9),
            scoped("PIPELINE_SUCCESS_RATE", "org", "ORG", 20),
            scoped("PIPELINE_FAILURE_RATE", "team-a", "DIMENSION", 0),
            scoped("PIPELINE_FAILURE_RATE", "team-b", "DIMENSION", 800 / 9),
            scoped("PIPELINE_FAILURE_RATE", "org", "ORG", 80),
        ]);
        expect(points[0]).toEqual({ day: "2026-11-13", success: 20, failure: 80 });
        expect((points[0].success ?? 0) + (points[0].failure ?? 0)).toBe(100);
    });

    it("with one team selected draws that team's series", () => {
        const points = buildPipelineRateTrend(
            [
                scoped("PIPELINE_SUCCESS_RATE", "team-b", "DIMENSION", 100 / 9),
                scoped("PIPELINE_SUCCESS_RATE", "org", "ORG", 100 / 9),
                scoped("PIPELINE_FAILURE_RATE", "team-b", "DIMENSION", 800 / 9),
            ],
            ["team-b"],
        );
        expect(points[0].success).toBeCloseTo(100 / 9, 6);
        expect(points[0].failure).toBeCloseTo(800 / 9, 6);
    });
});
