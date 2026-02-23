import { describe, expect, it } from "vitest";

import { getOrgId } from "@/lib/graphql/investmentFetchers";
import type { MetricFilter } from "@/lib/filters/types";

/**
 * Helper factory to create MetricFilter instances with sensible defaults.
 * Allows partial overrides for specific test cases.
 */
function makeFilter(overrides?: Partial<MetricFilter>): MetricFilter {
  return {
    time: { range_days: 30, compare_days: 0 },
    scope: { level: "org", ids: [] },
    who: {},
    what: {},
    why: {},
    how: {},
    ...overrides,
  };
}

describe("getOrgId", () => {
  it("returns org id from filters when scope level is org and ids are present", () => {
    const filter = makeFilter({ scope: { level: "org", ids: ["org-abc"] } });
    expect(getOrgId(filter)).toBe("org-abc");
  });

  it("returns first org id when multiple ids present", () => {
    const filter = makeFilter({
      scope: { level: "org", ids: ["org-1", "org-2"] },
    });
    expect(getOrgId(filter)).toBe("org-1");
  });

  it("returns contextOrgId when scope level is org but ids are empty", () => {
    const filter = makeFilter({ scope: { level: "org", ids: [] } });
    expect(getOrgId(filter, "ctx-org")).toBe("ctx-org");
  });

  it("returns contextOrgId when scope level is not org", () => {
    const filter = makeFilter({ scope: { level: "team", ids: ["team-1"] } });
    expect(getOrgId(filter, "ctx-org")).toBe("ctx-org");
  });

  it("returns contextOrgId when scope level is repo", () => {
    const filter = makeFilter({ scope: { level: "repo", ids: ["repo-1"] } });
    expect(getOrgId(filter, "ctx-org")).toBe("ctx-org");
  });

  it("throws error when no org id available from filters or context", () => {
    const filter = makeFilter({ scope: { level: "team", ids: [] } });
    expect(() => getOrgId(filter)).toThrow("org_id is required");
  });

  it("throws error when scope is org but ids empty and no context", () => {
    const filter = makeFilter({ scope: { level: "org", ids: [] } });
    expect(() => getOrgId(filter)).toThrow("org_id is required");
  });

  it("prefers filter org over context org", () => {
    const filter = makeFilter({
      scope: { level: "org", ids: ["filter-org"] },
    });
    expect(getOrgId(filter, "ctx-org")).toBe("filter-org");
  });

  it("never returns 'default' as org id", () => {
    const filter = makeFilter({ scope: { level: "team", ids: [] } });
    expect(() => getOrgId(filter)).toThrow("org_id is required");
  });
});
