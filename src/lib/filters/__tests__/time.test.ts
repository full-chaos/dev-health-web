import { describe, it, expect } from "vitest";
import { toRangeDays, applyWindowToFilters } from "../time";
import { defaultMetricFilter } from "../defaults";

describe("toRangeDays", () => {
  it("returns null for missing dates", () => {
    expect(toRangeDays()).toBe(null);
    expect(toRangeDays("2025-01-01")).toBe(null);
    expect(toRangeDays(undefined, "2025-01-01")).toBe(null);
  });

  it("returns null for invalid dates", () => {
    expect(toRangeDays("invalid", "2025-01-01")).toBe(null);
    expect(toRangeDays("2025-01-01", "not-a-date")).toBe(null);
  });

  it("calculates correct number of days", () => {
    expect(toRangeDays("2025-01-01", "2025-01-01")).toBe(1);
    expect(toRangeDays("2025-01-01", "2025-01-02")).toBe(1);
    expect(toRangeDays("2025-01-01", "2025-01-08")).toBe(7);
    expect(toRangeDays("2025-01-01", "2025-01-31")).toBe(30);
  });

  it("handles reversed dates", () => {
    expect(toRangeDays("2025-01-08", "2025-01-01")).toBe(7);
  });
});

describe("applyWindowToFilters", () => {
  it("returns original filter when no window is provided", () => {
    const result = applyWindowToFilters(defaultMetricFilter);
    expect(result).toBe(defaultMetricFilter);
  });

  it("applies window start date", () => {
    const result = applyWindowToFilters(
      defaultMetricFilter,
      "2025-01-15"
    );
    expect(result.time.start_date).toBe("2025-01-15");
    expect(result.time.end_date).toBe(defaultMetricFilter.time.end_date);
  });

  it("applies window end date", () => {
    const result = applyWindowToFilters(
      defaultMetricFilter,
      undefined,
      "2025-01-31"
    );
    expect(result.time.end_date).toBe("2025-01-31");
    expect(result.time.start_date).toBe(defaultMetricFilter.time.start_date);
  });

  it("applies both dates and recalculates range_days", () => {
    const result = applyWindowToFilters(
      defaultMetricFilter,
      "2025-01-01",
      "2025-01-08"
    );
    expect(result.time.start_date).toBe("2025-01-01");
    expect(result.time.end_date).toBe("2025-01-08");
    expect(result.time.range_days).toBe(7);
  });

  it("preserves other filter properties", () => {
    const result = applyWindowToFilters(
      defaultMetricFilter,
      "2025-01-01",
      "2025-01-08"
    );
    expect(result.scope).toEqual(defaultMetricFilter.scope);
    expect(result.who).toEqual(defaultMetricFilter.who);
    expect(result.what).toEqual(defaultMetricFilter.what);
    expect(result.why).toEqual(defaultMetricFilter.why);
    expect(result.how).toEqual(defaultMetricFilter.how);
  });
});
