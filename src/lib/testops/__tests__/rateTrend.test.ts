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

    it("uses the same team roll-up as the tiles (mean of the teams that served a value)", () => {
        const points = buildPipelineRateTrend([
            series("PIPELINE_SUCCESS_RATE", [["2026-09-01", 90]], "team-a"),
            series("PIPELINE_SUCCESS_RATE", [["2026-09-01", 70]], "team-b"),
            series("PIPELINE_SUCCESS_RATE", [["2026-09-01", null]], "team-c"),
        ]);
        expect(points).toEqual([{ day: "2026-09-01", success: 80, failure: null }]);
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
