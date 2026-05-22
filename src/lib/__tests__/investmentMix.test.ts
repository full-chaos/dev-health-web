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
});
