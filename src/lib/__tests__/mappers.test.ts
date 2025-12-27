import { describe, expect, it } from "vitest";
import { mapInvestmentToNestedPie } from "@/lib/mappers";

const sample = {
  categories: [
    { key: "product", name: "Product", value: 40 },
    { key: "quality", name: "Quality", value: 20 },
  ],
  subtypes: [
    { name: "Bugs", value: 12, parentKey: "quality" },
    { name: "Features", value: 28, parentKey: "product" },
  ],
};

describe("mapInvestmentToNestedPie", () => {
  it("maps investment response to nested pie shape", () => {
    const mapped = mapInvestmentToNestedPie(sample);
    expect(mapped.categories).toHaveLength(2);
    expect(mapped.subtypes).toHaveLength(2);
    expect(mapped.subtypes[0]).toHaveProperty("parentKey", "quality");
  });
});
