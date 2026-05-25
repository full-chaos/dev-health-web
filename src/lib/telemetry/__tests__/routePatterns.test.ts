import { describe, expect, it } from "vitest";

import { routePatternForPathname } from "../routePatterns";

describe("routePatternForPathname", () => {
  it("removes query strings and hashes", () => {
    expect(routePatternForPathname("/metrics?tab=dora#section")).toBe("/metrics");
  });

  it("normalizes dynamic identifiers", () => {
    expect(routePatternForPathname("/people/abc-123/metrics/cycle-time")).toBe(
      "/people/[person_id]/metrics/[metric]",
    );
    expect(routePatternForPathname("/reports/550e8400-e29b-41d4-a716-446655440000")).toBe(
      "/reports/[id]",
    );
  });
});
