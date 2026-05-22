import { describe, expect, it } from "vitest";

import { metricFilterToAIFilter } from "@/lib/filters/ai";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import type { MetricFilter } from "@/lib/filters/types";

/**
 * CHAOS-1773: the AI surfaces (Impact, Review Load, Automations, Risk) now
 * consume the canonical FilterBar like every other view. The dashboards still
 * accept an AIFilter, so the page wrapper bridges MetricFilter → AIFilter.
 * These tests pin that bridging contract.
 */
describe("metricFilterToAIFilter", () => {
  it("derives a date range from time.range_days when no custom range is set", () => {
    const filter: MetricFilter = {
      ...defaultMetricFilter,
      time: { range_days: 30, compare_days: 30 },
    };

    const ai = metricFilterToAIFilter(filter);

    expect(ai.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ai.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const start = new Date(ai.startDate);
    const end = new Date(ai.endDate);
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    expect(days).toBe(29); // 30-day window is inclusive on both ends.
  });

  it("uses time.start_date / time.end_date when a custom range is set", () => {
    const filter: MetricFilter = {
      ...defaultMetricFilter,
      time: {
        range_days: 30,
        compare_days: 30,
        start_date: "2026-01-01",
        end_date: "2026-01-31",
      },
    };

    const ai = metricFilterToAIFilter(filter);

    expect(ai.startDate).toBe("2026-01-01");
    expect(ai.endDate).toBe("2026-01-31");
  });

  it("maps scope.ids[0] to teamId only when scope.level is 'team'", () => {
    const teamFilter: MetricFilter = {
      ...defaultMetricFilter,
      scope: { level: "team", ids: ["team-platform"] },
    };
    expect(metricFilterToAIFilter(teamFilter).teamId).toBe("team-platform");

    const orgFilter: MetricFilter = {
      ...defaultMetricFilter,
      scope: { level: "org", ids: ["org-1"] },
    };
    expect(metricFilterToAIFilter(orgFilter).teamId).toBeUndefined();
  });

  it("maps what.repos[0] to repoId and why.work_category[0] to workType", () => {
    const filter: MetricFilter = {
      ...defaultMetricFilter,
      what: { repos: ["repo-1", "repo-2"] },
      why: { work_category: ["feature_delivery", "maintenance"] },
    };

    const ai = metricFilterToAIFilter(filter);

    expect(ai.repoId).toBe("repo-1");
    expect(ai.workType).toBe("feature_delivery");
  });

  it("omits optional fields when their MetricFilter counterparts are absent", () => {
    const ai = metricFilterToAIFilter(defaultMetricFilter);

    expect(ai.teamId).toBeUndefined();
    expect(ai.repoId).toBeUndefined();
    expect(ai.workType).toBeUndefined();
    expect(ai.buckets).toBeUndefined();
  });
});
