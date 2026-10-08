import { describe, expect, it } from "vitest";

import { mapRiskMetricsPayload } from "../risk-metrics";

const base = {
    releaseConfidence: 0.9,
    qualityDragHours: 1,
    pipelineStability: 0.8,
    timeseries: [],
    qualityDragBreakdown: [],
    confidenceSpark: [],
    dragSpark: [],
    stabilitySpark: [],
};

describe("risk quadrant point name (CHAOS-8954)", () => {
    it("carries the served name, and undefined when null or absent", () => {
        const mapped = mapRiskMetricsPayload({
            ...base,
            quadrantData: [
                { id: "r1", name: "full-chaos/web", pipelineSuccessRate: 0.9, testPassRate: 0.8 },
                { id: "r2", name: null, pipelineSuccessRate: 0.9, testPassRate: 0.8 },
                { id: "r3", pipelineSuccessRate: 0.9, testPassRate: 0.8 },
            ],
        });
        expect(mapped?.quadrant_data.map((p) => p.name)).toEqual([
            "full-chaos/web",
            undefined,
            undefined,
        ]);
    });
});
