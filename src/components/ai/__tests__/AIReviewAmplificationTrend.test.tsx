import { describe, expect, it } from "vitest";

import { formatReviewTrendDay, reviewAmplificationTrendRows } from "../AIReviewAmplificationTrend";

describe("AIReviewAmplificationTrend helpers", () => {
  it("formats ISO days as MMM D labels", () => {
    expect(formatReviewTrendDay("2026-05-05")).toBe("May 5");
    expect(formatReviewTrendDay("2026-05-12")).toBe("May 12");
  });

  it("sorts daily rows chronologically by ISO day and keeps bucket series aligned", () => {
    const trend = reviewAmplificationTrendRows([
      { day: "2026-05-22", bucket: "AI_ASSISTED", prsTotal: 4, reviewsTotal: 8, reviewAmplification: 2.2 },
      { day: "2026-05-01", bucket: "AI_ASSISTED", prsTotal: 4, reviewsTotal: 4, reviewAmplification: 1.1 },
      { day: "2026-05-09", bucket: "AGENT_CREATED", prsTotal: 4, reviewsTotal: 7, reviewAmplification: 1.9 },
      { day: "2026-05-09", bucket: "AI_ASSISTED", prsTotal: 4, reviewsTotal: 5, reviewAmplification: 1.4 },
      { bucket: "UNKNOWN", prsTotal: 1, reviewsTotal: 9, reviewAmplification: 9.9 },
    ]);

    expect(trend.days).toEqual(["2026-05-01", "2026-05-09", "2026-05-22"]);
    expect(trend.labels).toEqual(["May 1", "May 9", "May 22"]);
    expect(trend.rows.map((row) => row.day)).not.toContain(undefined);
  });
});
