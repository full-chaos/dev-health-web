import { describe, expect, it } from "vitest";

import type { MetricFilter } from "@/lib/filters/types";
import { selectedOperatingReviewTeamIds } from "@/lib/operatingReviewScope";

const baseFilter: MetricFilter = {
  time: { range_days: 30, compare_days: 30 },
  scope: { level: "org", ids: [] },
  who: {},
  what: {},
  why: {},
  how: {},
};

describe("selectedOperatingReviewTeamIds", () => {
  it("uses every selected team from the filter scope", () => {
    expect(
      selectedOperatingReviewTeamIds(undefined, {
        ...baseFilter,
        scope: { level: "team", ids: ["platform", "growth"] },
      }),
    ).toEqual(["platform", "growth"]);
  });

  it("keeps all-teams mode when the scope is not team", () => {
    expect(
      selectedOperatingReviewTeamIds(undefined, {
        ...baseFilter,
        scope: { level: "repo", ids: ["web"] },
      }),
    ).toEqual([]);
  });

  it("lets explicit team query params override the encoded filter", () => {
    expect(
      selectedOperatingReviewTeamIds(["ops", "", "ops", " product "], {
        ...baseFilter,
        scope: { level: "team", ids: ["platform"] },
      }),
    ).toEqual(["ops", "product"]);
  });
});
