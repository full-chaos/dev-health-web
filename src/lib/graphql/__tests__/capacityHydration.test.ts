import { describe, expect, it } from "vitest";
import type { MetricFilter } from "@/lib/filters/types";
import { buildCapacityForecastVariables } from "../capacityHydration";

const baseFilters = (overrides: Partial<MetricFilter> = {}): MetricFilter => ({
  time: { range_days: 30, compare_days: 30 },
  scope: { level: "org", ids: ["acme"] },
  who: {},
  what: {},
  why: {},
  how: {},
  ...overrides,
});

describe("buildCapacityForecastVariables", () => {
  it("uses the selected team id when filters are scoped to a team", () => {
    const vars = buildCapacityForecastVariables(
      baseFilters({
        time: { range_days: 60, compare_days: 30 },
        scope: { level: "team", ids: ["team-42"] },
      }),
      "org-1",
    );

    expect(vars).toEqual({
      orgId: "org-1",
      input: {
        teamId: "team-42",
        historyDays: 60,
      },
    });
  });

  it("omits teamId for non-team scopes while preserving historyDays", () => {
    const vars = buildCapacityForecastVariables(
      baseFilters({
        time: { range_days: 45, compare_days: 30 },
        scope: { level: "org", ids: ["acme"] },
      }),
      "org-1",
    );

    expect(vars.orgId).toBe("org-1");
    expect(vars.input.historyDays).toBe(45);
    expect(vars.input.teamId).toBeUndefined();
  });

  it("produces a stable shape suitable as an urql cache key", () => {
    const vars1 = buildCapacityForecastVariables(
      baseFilters({
        time: { range_days: 90, compare_days: 30 },
        scope: { level: "team", ids: ["team-a"] },
      }),
      "org-1",
    );
    const vars2 = buildCapacityForecastVariables(
      baseFilters({
        time: { range_days: 90, compare_days: 30 },
        scope: { level: "team", ids: ["team-a"] },
      }),
      "org-1",
    );

    expect(JSON.stringify(vars1)).toBe(JSON.stringify(vars2));
  });
});

describe("buildCapacityForecastVariables parity with useCapacityForecast", () => {
  it("emits the exact shape that useCapacityForecast constructs (see hooks/useCapacityForecast.ts:52-58)", () => {
    const filters = baseFilters({
      time: { range_days: 30, compare_days: 30 },
      scope: { level: "team", ids: ["team-a"] },
    });

    const vars = buildCapacityForecastVariables(filters, "org-1");

    const expected = {
      orgId: "org-1",
      input: {
        teamId: "team-a",
        historyDays: 30,
      },
    };

    expect(vars).toEqual(expected);
  });
});
