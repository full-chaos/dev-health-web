import { describe, expect, it } from "vitest";
import { adaptEvidenceQualityStats } from "../evidenceQualityStats";

describe("adaptEvidenceQualityStats", () => {
    it("carries the total and the count of work units left out of the mix", () => {
        expect(
            adaptEvidenceQualityStats({
                mean: 0.5,
                total: 10,
                bandCounts: { high: 6, unknown: 4 },
                uncategorizedCount: 4,
            }),
        ).toEqual({
            mean: 0.5,
            stddev: null,
            band_counts: { high: 6, unknown: 4 },
            quality_drivers: [],
            total: 10,
            uncategorized_count: 4,
        });
    });

    it("keeps a count the API did not send as null, a produced 0 as 0", () => {
        const base = { total: 10, bandCounts: {} };
        expect(adaptEvidenceQualityStats(base)?.uncategorized_count).toBeNull();
        expect(
            adaptEvidenceQualityStats({ ...base, uncategorizedCount: null })?.uncategorized_count,
        ).toBeNull();
        expect(
            adaptEvidenceQualityStats({ ...base, uncategorizedCount: 0 })?.uncategorized_count,
        ).toBe(0);
    });

    it("has nothing to adapt without stats", () => {
        expect(adaptEvidenceQualityStats(null)).toBeUndefined();
        expect(adaptEvidenceQualityStats(undefined)).toBeUndefined();
    });
});
