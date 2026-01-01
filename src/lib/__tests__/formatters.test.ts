import { describe, expect, it, beforeEach } from "vitest";
import {
  formatDelta,
  formatMetricValue,
  formatNumber,
  formatPercent,
  defaultFormatter,
  integerFormatter,
  compactFormatter,
  customFormatters,
  getFormatter,
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

describe("formatter caching", () => {
  beforeEach(() => {
    customFormatters.clear();
  });

  it("returns pre-created default formatter for no options", () => {
    const formatter = getFormatter();
    expect(formatter).toBe(defaultFormatter);
  });

  it("returns pre-created integer formatter for maximumFractionDigits: 0", () => {
    const formatter = getFormatter({ maximumFractionDigits: 0 });
    expect(formatter).toBe(integerFormatter);
  });

  it("returns pre-created compact formatter for notation: compact", () => {
    const formatter = getFormatter({ notation: "compact" });
    expect(formatter).toBe(compactFormatter);
  });

  it("returns pre-created compact formatter for notation: compact with default maximumFractionDigits", () => {
    const formatter = getFormatter({ notation: "compact", maximumFractionDigits: 1 });
    expect(formatter).toBe(compactFormatter);
  });

  it("caches custom formatters and returns same instance", () => {
    const options = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
    const formatter1 = getFormatter(options);
    const formatter2 = getFormatter(options);
    expect(formatter1).toBe(formatter2);
    expect(customFormatters.size).toBe(1);
  });

  it("creates different cached formatters for different options", () => {
    const formatter1 = getFormatter({ maximumFractionDigits: 2 });
    const formatter2 = getFormatter({ maximumFractionDigits: 3 });
    expect(formatter1).not.toBe(formatter2);
    expect(customFormatters.size).toBe(2);
  });

  it("does not use pre-created compact formatter when other options differ", () => {
    const formatter = getFormatter({ notation: "compact", maximumFractionDigits: 0 });
    expect(formatter).not.toBe(compactFormatter);
    expect(customFormatters.size).toBe(1);
  });
});
