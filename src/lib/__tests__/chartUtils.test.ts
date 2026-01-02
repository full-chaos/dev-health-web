import { describe, expect, it } from "vitest";
import {
  formatTooltipValue,
  formatPercent,
  calcPercent,
  buildTooltipHtml,
  buildPathString,
  createAreaGradient,
  GRADIENT_COLORS,
} from "@/lib/chartUtils";

describe("chartUtils", () => {
  describe("formatTooltipValue", () => {
    it("formats valid numbers with unit", () => {
      expect(formatTooltipValue(1234.56, "hours")).toBe("1,234.6 hours");
      expect(formatTooltipValue(100, "items")).toBe("100 items");
    });

    it("handles undefined values", () => {
      expect(formatTooltipValue(undefined, "hours")).toBe("--");
    });

    it("handles NaN values", () => {
      expect(formatTooltipValue(NaN, "items")).toBe("--");
    });

    it("handles zero", () => {
      expect(formatTooltipValue(0, "hours")).toBe("0 hours");
    });

    it("formats with maximum fraction digits", () => {
      expect(formatTooltipValue(1.23456, "days")).toBe("1.2 days");
    });
  });

  describe("formatPercent", () => {
    it("calculates and formats valid percentages", () => {
      expect(formatPercent(50, 100)).toBe("50.0%");
      expect(formatPercent(25, 200)).toBe("12.5%");
      expect(formatPercent(1, 3)).toBe("33.3%");
    });

    it("handles zero total", () => {
      expect(formatPercent(10, 0)).toBe("--");
    });

    it("handles negative total", () => {
      expect(formatPercent(10, -100)).toBe("--");
    });

    it("handles non-finite values", () => {
      expect(formatPercent(NaN, 100)).toBe("--");
      expect(formatPercent(100, NaN)).toBe("--");
      expect(formatPercent(Infinity, 100)).toBe("--");
    });

    it("handles 100% case", () => {
      expect(formatPercent(100, 100)).toBe("100.0%");
    });
  });

  describe("calcPercent", () => {
    it("calculates valid percentages", () => {
      expect(calcPercent(50, 100)).toBe(50);
      expect(calcPercent(25, 200)).toBe(12.5);
      expect(calcPercent(1, 3)).toBeCloseTo(33.333, 2);
    });

    it("returns 0 for zero total", () => {
      expect(calcPercent(10, 0)).toBe(0);
    });

    it("returns 0 for negative total", () => {
      expect(calcPercent(10, -100)).toBe(0);
    });

    it("returns 0 for non-finite values", () => {
      expect(calcPercent(NaN, 100)).toBe(0);
      expect(calcPercent(100, NaN)).toBe(0);
      expect(calcPercent(Infinity, 100)).toBe(0);
    });

    it("returns 100 for equal value and total", () => {
      expect(calcPercent(100, 100)).toBe(100);
    });
  });

  describe("buildTooltipHtml", () => {
    it("builds basic tooltip with title and value", () => {
      const html = buildTooltipHtml({
        title: "Test Item",
        value: 100,
        unit: "items",
      });
      expect(html).toContain("Test Item");
      expect(html).toContain("100");
      expect(html).toContain("items");
    });

    it("includes subtitle when provided", () => {
      const html = buildTooltipHtml({
        title: "Test",
        subtitle: "Category",
        value: 50,
        unit: "hours",
      });
      expect(html).toContain("Category");
    });

    it("includes percentage when provided", () => {
      const html = buildTooltipHtml({
        title: "Test",
        value: 50,
        unit: "items",
        percent: 25.5,
      });
      expect(html).toContain("25.5%");
    });

    it("includes extra text when provided", () => {
      const html = buildTooltipHtml({
        title: "Test",
        value: 100,
        unit: "items",
        extra: "Additional info",
      });
      expect(html).toContain("Additional info");
    });

    it("handles string values", () => {
      const html = buildTooltipHtml({
        title: "Test",
        value: "N/A",
        unit: "items",
      });
      expect(html).toContain("N/A");
    });

    it("uses custom colors when provided", () => {
      const html = buildTooltipHtml({
        title: "Test",
        subtitle: "Category",
        value: 100,
        unit: "items",
        percent: 50,
        mutedColor: "#ff0000",
        accentColor: "#00ff00",
      });
      expect(html).toContain("#ff0000");
      expect(html).toContain("#00ff00");
    });

    it("handles non-finite percent values gracefully", () => {
      const html = buildTooltipHtml({
        title: "Test",
        value: 100,
        unit: "items",
        percent: NaN,
      });
      expect(html).not.toContain("NaN%");
    });
  });

  describe("buildPathString", () => {
    it("joins path segments with arrow separator", () => {
      expect(buildPathString(["root", "category", "item"])).toBe("root → category → item");
    });

    it("handles single element path", () => {
      expect(buildPathString(["root"])).toBe("root");
    });

    it("handles empty path", () => {
      expect(buildPathString([])).toBe("");
    });
  });

  describe("createAreaGradient", () => {
    it("creates vertical linear gradient", () => {
      const gradient = createAreaGradient({
        start: "rgba(255, 0, 0, 0.8)",
        end: "rgba(255, 0, 0, 0.1)",
      });

      expect(gradient.type).toBe("linear");
      expect(gradient.x).toBe(0);
      expect(gradient.y).toBe(0);
      expect(gradient.x2).toBe(0);
      expect(gradient.y2).toBe(1);
      expect(gradient.colorStops).toHaveLength(2);
      expect(gradient.colorStops[0].offset).toBe(0);
      expect(gradient.colorStops[0].color).toBe("rgba(255, 0, 0, 0.8)");
      expect(gradient.colorStops[1].offset).toBe(1);
      expect(gradient.colorStops[1].color).toBe("rgba(255, 0, 0, 0.1)");
    });
  });

  describe("GRADIENT_COLORS", () => {
    it("has predefined gradient colors", () => {
      expect(GRADIENT_COLORS.planned).toBeDefined();
      expect(GRADIENT_COLORS.unplanned).toBeDefined();
      expect(GRADIENT_COLORS.rework).toBeDefined();
      expect(GRADIENT_COLORS.abandonment).toBeDefined();
    });

    it("has start and end colors for each type", () => {
      Object.values(GRADIENT_COLORS).forEach((gradient) => {
        expect(gradient.start).toMatch(/^rgba\(/);
        expect(gradient.end).toMatch(/^rgba\(/);
      });
    });
  });
});
