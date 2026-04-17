import { describe, expect, it } from "vitest";
import type { MetricFilter } from "@/lib/filters/types";
import { buildInvestmentMixVariables } from "../investmentHydration";

const baseFilters = (overrides: Partial<MetricFilter> = {}): MetricFilter => ({
  time: { range_days: 30, compare_days: 30 },
  scope: { level: "org", ids: ["acme"] },
  who: {},
  what: {},
  why: {},
  how: {},
  ...overrides,
});

describe("buildInvestmentMixVariables", () => {
  it("uses explicit start_date/end_date when provided", () => {
    const vars = buildInvestmentMixVariables(
      baseFilters({
        time: {
          range_days: 30,
          compare_days: 30,
          start_date: "2025-01-01",
          end_date: "2025-01-31",
        },
      }),
      "org-1"
    );

    expect(vars.orgId).toBe("org-1");
    expect(vars.batch.breakdowns).toHaveLength(2);
    expect(vars.batch.breakdowns?.[0]).toEqual({
      dimension: "THEME",
      measure: "COUNT",
      dateRange: { startDate: "2025-01-01", endDate: "2025-01-31" },
      topN: 50,
    });
    expect(vars.batch.breakdowns?.[1]).toEqual({
      dimension: "SUBCATEGORY",
      measure: "COUNT",
      dateRange: { startDate: "2025-01-01", endDate: "2025-01-31" },
      topN: 100,
    });
    expect(vars.batch.useInvestment).toBe(true);
  });

  it("translates scope.level to uppercase", () => {
    const vars = buildInvestmentMixVariables(
      baseFilters({ scope: { level: "team", ids: ["team-a"] } }),
      "org-1"
    );
    expect(vars.batch.filters?.scope).toEqual({
      level: "TEAM",
      ids: ["team-a"],
    });
  });

  it("omits who/what/why/how subkeys when their arrays are empty", () => {
    const vars = buildInvestmentMixVariables(baseFilters(), "org-1");
    expect(vars.batch.filters?.who).toBeUndefined();
    expect(vars.batch.filters?.what).toBeUndefined();
    expect(vars.batch.filters?.why).toBeUndefined();
    expect(vars.batch.filters?.how).toBeUndefined();
  });

  it("includes who/what/why/how when their arrays are populated", () => {
    const vars = buildInvestmentMixVariables(
      baseFilters({
        who: { developers: ["alice"] },
        what: { repos: ["repo-a"] },
        why: { work_category: ["roadmap"], issue_type: ["bug"] },
        how: { flow_stage: ["in_progress"] },
      }),
      "org-1"
    );
    expect(vars.batch.filters?.who).toEqual({ developers: ["alice"] });
    expect(vars.batch.filters?.what).toEqual({ repos: ["repo-a"] });
    expect(vars.batch.filters?.why).toEqual({
      workCategory: ["roadmap"],
      issueType: ["bug"],
    });
    expect(vars.batch.filters?.how).toEqual({ flowStage: ["in_progress"] });
  });

  it("produces a stable shape suitable as an urql cache key", () => {
    const vars1 = buildInvestmentMixVariables(
      baseFilters({
        time: {
          range_days: 30,
          compare_days: 30,
          start_date: "2025-01-01",
          end_date: "2025-01-31",
        },
      }),
      "org-1"
    );
    const vars2 = buildInvestmentMixVariables(
      baseFilters({
        time: {
          range_days: 30,
          compare_days: 30,
          start_date: "2025-01-01",
          end_date: "2025-01-31",
        },
      }),
      "org-1"
    );
    expect(JSON.stringify(vars1)).toBe(JSON.stringify(vars2));
  });
});

describe("buildInvestmentMixVariables parity with useInvestmentMix", () => {
  it("emits the exact shape that useInvestmentMix constructs (see hooks/useInvestment.ts:72-84)", () => {
    const filters = baseFilters({
      time: {
        range_days: 30,
        compare_days: 30,
        start_date: "2025-01-01",
        end_date: "2025-01-31",
      },
      what: { repos: ["repo-a"] },
    });
    const vars = buildInvestmentMixVariables(filters, "org-1");

    const expected = {
      orgId: "org-1",
      batch: {
        breakdowns: [
          {
            dimension: "THEME",
            measure: "COUNT",
            dateRange: { startDate: "2025-01-01", endDate: "2025-01-31" },
            topN: 50,
          },
          {
            dimension: "SUBCATEGORY",
            measure: "COUNT",
            dateRange: { startDate: "2025-01-01", endDate: "2025-01-31" },
            topN: 100,
          },
        ],
        useInvestment: true,
        filters: {
          scope: { level: "ORG", ids: ["acme"] },
          who: undefined,
          what: { repos: ["repo-a"] },
          why: undefined,
          how: undefined,
        },
      },
    };

    expect(vars).toEqual(expected);
  });
});
