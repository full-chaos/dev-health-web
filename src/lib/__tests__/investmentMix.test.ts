import { describe, expect, it } from "vitest";

import { normalizeInvestmentMix } from "@/lib/investmentMix";

describe("normalizeInvestmentMix", () => {
    it("accepts the theme/subcategory distribution contract", () => {
        const normalized = normalizeInvestmentMix({
            theme_distribution: { feature_delivery: 40, quality: 20 },
            subcategory_distribution: {
                "feature_delivery.roadmap": 28,
                "quality.bugfix": 12,
            },
            unit: "loc",
        });

        expect(normalized.theme_distribution.feature_delivery).toBe(40);
        expect(normalized.subcategory_distribution["quality.bugfix"]).toBe(12);
        expect(normalized.unit).toBe("loc");
    });

    it("upgrades legacy category/subtype payloads", () => {
        const normalized = normalizeInvestmentMix({
            categories: [
                { key: "product", name: "Product", value: 40 },
                { key: "quality", name: "Quality", value: 20 },
            ],
            subtypes: [
                { name: "Bugs", value: 12, parentKey: "quality" },
                { name: "Features", value: 28, parentKey: "product" },
            ],
        });

        expect(normalized.theme_distribution.product).toBe(40);
        expect(normalized.subcategory_distribution["quality.bugs"]).toBe(12);
    });

    it("passes through evidence_quality_distribution when present", () => {
        const normalized = normalizeInvestmentMix({
            theme_distribution: { feature_delivery: 40 },
            subcategory_distribution: { "feature_delivery.roadmap": 40 },
            evidence_quality_distribution: { high: 51, moderate: 57, low: 34 },
        });
        expect(normalized.evidence_quality_distribution).toEqual({
            high: 51,
            moderate: 57,
            low: 34,
        });
    });

    it("passes through evidence_quality_stats when present", () => {
        const normalized = normalizeInvestmentMix({
            theme_distribution: { feature_delivery: 40 },
            subcategory_distribution: { "feature_delivery.roadmap": 40 },
            evidence_quality_stats: {
                mean: 0.726,
                stddev: 0.142,
                band_counts: { high: 51, moderate: 57, low: 34 },
            },
        } as Parameters<typeof normalizeInvestmentMix>[0]);
        expect(normalized.evidence_quality_stats?.mean).toBeCloseTo(0.726);
        expect(normalized.evidence_quality_stats?.stddev).toBeCloseTo(0.142);
        expect(normalized.evidence_quality_stats?.band_counts).toEqual({
            high: 51,
            moderate: 57,
            low: 34,
        });
    });

    it("produces undefined evidence_quality_stats when absent", () => {
        const normalized = normalizeInvestmentMix({
            theme_distribution: { feature_delivery: 40 },
            subcategory_distribution: { "feature_delivery.roadmap": 40 },
        });
        expect(normalized.evidence_quality_stats).toBeUndefined();
    });
});
