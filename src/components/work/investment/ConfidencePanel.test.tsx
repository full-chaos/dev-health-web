import { describe, expect, it } from "vitest";
import { deriveConfidenceFromStats } from "./ConfidencePanel";

describe("deriveConfidenceFromStats", () => {
    it("returns null when stats is null", () => {
        expect(deriveConfidenceFromStats(null)).toBeNull();
    });

    it("returns null when stats is undefined", () => {
        expect(deriveConfidenceFromStats(undefined)).toBeNull();
    });

    it("returns null when mean is null", () => {
        expect(deriveConfidenceFromStats({ mean: null, stddev: null })).toBeNull();
    });

    it("returns 'high' level when mean >= 0.75", () => {
        const result = deriveConfidenceFromStats({ mean: 0.75, stddev: 0.1 });
        expect(result?.level).toBe("high");
    });

    it("returns 'high' level when mean is 0.9", () => {
        const result = deriveConfidenceFromStats({ mean: 0.9, stddev: 0.05 });
        expect(result?.level).toBe("high");
    });

    it("returns 'moderate' level when mean >= 0.6 and < 0.75", () => {
        // Meridian 14d: mean=0.726 -> moderate
        const result = deriveConfidenceFromStats({ mean: 0.726, stddev: 0.142 });
        expect(result?.level).toBe("moderate");
        expect(result?.quality_mean).toBeCloseTo(0.726);
        expect(result?.quality_stddev).toBeCloseTo(0.142);
    });

    it("returns 'low' level when mean < 0.6", () => {
        const result = deriveConfidenceFromStats({ mean: 0.45, stddev: 0.2 });
        expect(result?.level).toBe("low");
    });

    it("populates quality_mean and quality_stddev from stats", () => {
        const result = deriveConfidenceFromStats({ mean: 0.726, stddev: 0.142 });
        expect(result?.quality_mean).toBeCloseTo(0.726);
        expect(result?.quality_stddev).toBeCloseTo(0.142);
    });

    it("returns empty drivers array (no AI recomputation)", () => {
        const result = deriveConfidenceFromStats({ mean: 0.7, stddev: 0.1 });
        expect(result?.drivers).toEqual([]);
    });

    it("populates band_mix from band_counts", () => {
        const result = deriveConfidenceFromStats({
            mean: 0.726,
            stddev: 0.142,
            band_counts: { high: 51, moderate: 57, low: 34 },
        });
        expect(result?.band_mix).toEqual({ high: 51, moderate: 57, low: 34 });
    });

    it("returns empty band_mix when band_counts absent", () => {
        const result = deriveConfidenceFromStats({ mean: 0.7, stddev: 0.1 });
        expect(result?.band_mix).toEqual({});
    });

    it("handles missing stddev gracefully (quality_stddev is null)", () => {
        const result = deriveConfidenceFromStats({ mean: 0.7 });
        expect(result?.quality_stddev).toBeNull();
    });
});
