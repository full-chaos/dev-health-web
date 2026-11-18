import { describe, expect, it } from "vitest";

import { mapRiskMetricsPayload } from "../risk-metrics";

const payload = (extra: Record<string, unknown> = {}) => ({
    releaseConfidence: 0.8,
    qualityDragHours: 7,
    pipelineStability: 0.9,
    timeseries: [],
    qualityDragBreakdown: [{ category: "Retry Overhead", hours: 3 }],
    quadrantData: [],
    confidenceSpark: [],
    dragSpark: [],
    stabilitySpark: [],
    ...extra,
});

describe("mapRiskMetricsPayload: qualityDragPartial", () => {
    it.each([
        [true, true],
        [false, false],
    ])("carries qualityDragPartial %s as quality_drag_partial %s", (given, want) => {
        const mapped = mapRiskMetricsPayload(payload({ qualityDragPartial: given }));
        expect(mapped?.quality_drag_partial).toBe(want);
    });

    it("reads a payload from an older query-api (no qualityDragPartial) as not partial", () => {
        const mapped = mapRiskMetricsPayload(payload());
        expect(mapped).not.toBeNull();
        expect(mapped?.quality_drag_partial).toBeUndefined();
    });
});
