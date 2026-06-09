import { describe, expect, it } from "vitest";
import { deriveConfidenceFromStats } from "./ConfidencePanel";

describe("deriveConfidenceFromStats", () => {
    it("returns null when stats is null or undefined", () => {
        expect(deriveConfidenceFromStats(null)).toBeNull();
        expect(deriveConfidenceFromStats(undefined)).toBeNull();
    });

    it("returns null (honest-empty) when there are no classified work units", () => {
        // No band_counts -> total 0 -> no confidence fabricated.
        expect(deriveConfidenceFromStats({ mean: 0.9, stddev: 0.1 })).toBeNull();
        // Empty band_counts -> total 0.
        expect(deriveConfidenceFromStats({ mean: 0.9, band_counts: {} })).toBeNull();
        // All-zero counts -> total 0.
        expect(
            deriveConfidenceFromStats({
                mean: 0.9,
                band_counts: { high: 0, low: 0 },
            }),
        ).toBeNull();
    });

    it("derives the level from the dominant PERSISTED band, not from the mean", () => {
        // Meridian 14d: high 51 / moderate 57 / low 34 -> moderate (mode), mean 0.726.
        expect(
            deriveConfidenceFromStats({
                mean: 0.726,
                stddev: 0.142,
                band_counts: { high: 51, moderate: 57, low: 34 },
            })?.level,
        ).toBe("moderate");
        // High mean but low-dominated bands -> low (proves it is NOT mean-thresholded).
        expect(
            deriveConfidenceFromStats({
                mean: 0.95,
                band_counts: { high: 1, low: 99 },
            })?.level,
        ).toBe("low");
        // High-dominated bands but low mean -> high.
        expect(
            deriveConfidenceFromStats({
                mean: 0.4,
                band_counts: { high: 80, moderate: 10, low: 5 },
            })?.level,
        ).toBe("high");
    });

    it("maps very_low and medium band aliases", () => {
        expect(deriveConfidenceFromStats({ band_counts: { very_low: 10 } })?.level).toBe("low");
        expect(deriveConfidenceFromStats({ band_counts: { medium: 10 } })?.level).toBe("moderate");
    });

    it("returns level 'unknown' when only unrecognized bands are present", () => {
        const result = deriveConfidenceFromStats({ band_counts: { weird: 5 } });
        expect(result?.level).toBe("unknown");
        expect(result?.band_mix).toEqual({ weird: 5 });
    });

    it("populates quality_mean and quality_stddev from valid stats", () => {
        const result = deriveConfidenceFromStats({
            mean: 0.726,
            stddev: 0.142,
            band_counts: { moderate: 3 },
        });
        expect(result?.quality_mean).toBeCloseTo(0.726);
        expect(result?.quality_stddev).toBeCloseTo(0.142);
    });

    it("rejects non-finite / out-of-range mean (quality_mean -> null) while still showing the band", () => {
        expect(
            deriveConfidenceFromStats({ mean: Number.NaN, band_counts: { high: 5 } })?.quality_mean,
        ).toBeNull();
        expect(
            deriveConfidenceFromStats({
                mean: Number.POSITIVE_INFINITY,
                band_counts: { high: 5 },
            })?.quality_mean,
        ).toBeNull();
        expect(
            deriveConfidenceFromStats({ mean: 1.5, band_counts: { high: 5 } })?.quality_mean,
        ).toBeNull();
        expect(
            deriveConfidenceFromStats({ mean: -0.1, band_counts: { high: 5 } })?.quality_mean,
        ).toBeNull();
    });

    it("rejects negative / non-finite stddev (quality_stddev -> null)", () => {
        expect(
            deriveConfidenceFromStats({ stddev: -1, band_counts: { high: 5 } })?.quality_stddev,
        ).toBeNull();
        expect(
            deriveConfidenceFromStats({
                stddev: Number.NaN,
                band_counts: { high: 5 },
            })?.quality_stddev,
        ).toBeNull();
    });

    it("excludes NaN / Infinity / negative band counts from total and band_mix", () => {
        const result = deriveConfidenceFromStats({
            band_counts: {
                high: 10,
                moderate: Number.NaN,
                low: -5,
                bad: Number.POSITIVE_INFINITY,
            },
        });
        expect(result?.band_mix).toEqual({ high: 10 });
        expect(result?.level).toBe("high");
    });

    it("returns null when every band count is invalid (total stays 0)", () => {
        expect(
            deriveConfidenceFromStats({ band_counts: { high: Number.NaN, low: -1 } }),
        ).toBeNull();
    });

    it("returns an empty drivers array (no AI recomputation)", () => {
        expect(deriveConfidenceFromStats({ band_counts: { high: 5 } })?.drivers).toEqual([]);
    });
});
