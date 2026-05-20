import { describe, expect, it } from "vitest";

import { decodeFilter } from "@/lib/filters/encode";
import type { MetricFilter } from "@/lib/filters/types";
import { buildInvestmentWorkGraphUrl } from "@/lib/workGraphDrilldownUrl";

const filters: MetricFilter = {
  scope: { level: "team", ids: ["team-1"] },
  time: { range_days: 14, compare_days: 0 },
  who: {},
  what: { repos: ["repo-1"] },
  why: {},
  how: {},
};

describe("buildInvestmentWorkGraphUrl", () => {
  it("preserves filters and role while adding theme context", () => {
    const href = buildInvestmentWorkGraphUrl({
      filters,
      role: "manager",
      themeKey: "quality",
    });
    const url = new URL(href, "http://localhost");
    const encodedFilter = url.searchParams.get("f");

    expect(url.pathname).toBe("/work");
    expect(url.searchParams.get("tab")).toBe("graph");
    expect(url.searchParams.get("role")).toBe("manager");
    expect(url.searchParams.get("graph_theme")).toBe("quality");
    expect(url.searchParams.get("graph_subcategory")).toBeNull();
    expect(encodedFilter).toBeTruthy();
    expect(decodeFilter(encodedFilter)).toEqual(filters);
  });

  it("adds subcategory context when provided", () => {
    const href = buildInvestmentWorkGraphUrl({
      filters,
      themeKey: "quality",
      subcategoryKey: "quality.bugfix",
    });
    const url = new URL(href, "http://localhost");

    expect(url.searchParams.get("graph_theme")).toBe("quality");
    expect(url.searchParams.get("graph_subcategory")).toBe("quality.bugfix");
  });
});
