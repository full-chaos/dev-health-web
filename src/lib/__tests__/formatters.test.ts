import { describe, expect, it } from "vitest";
import {
  formatDelta,
  formatMetricValue,
  formatNumber,
  formatPercent,
} from "@/lib/formatters";

describe("formatters", () => {
  it("formats numbers with defaults", () => {
    expect(formatNumber(1200)).toBe("1,200");
  });

  it("formats percent and delta", () => {
    expect(formatPercent(42)).toBe("42%");
    expect(formatDelta(12.4)).toBe("+12%");
    expect(formatDelta(-8.2)).toBe("-8%");
  });

  it("formats metric values by unit", () => {
    expect(formatMetricValue(3.4, "days")).toBe("3.4d");
    expect(formatMetricValue(11, "%")).toBe("11%");
    expect(formatMetricValue(8, "hours")).toBe("8h");
  });
});
