import { describe, expect, it } from "vitest";

import { formatSparklineTooltipDate } from "./SparklineChart";

describe("formatSparklineTooltipDate", () => {
    it("formats an ISO datetime string as a short date (not the raw ISO)", () => {
        // Raw input mirrors what Pydantic serialises: YYYY-MM-DDT00:00:00
        const result = formatSparklineTooltipDate("2026-06-04T00:00:00");
        // Must NOT echo back the raw ISO string
        expect(result).not.toBe("2026-06-04T00:00:00");
        // Must contain the day number
        expect(result).toMatch(/4/);
        // Must contain a month abbreviation
        expect(result).toMatch(/Jun/i);
    });

    it("formats a plain ISO date string (no time component)", () => {
        const result = formatSparklineTooltipDate("2026-01-15");
        expect(result).not.toBe("2026-01-15");
        expect(result).toMatch(/15/);
        expect(result).toMatch(/Jan/i);
    });

    it("returns the raw string unchanged for non-date input", () => {
        expect(formatSparklineTooltipDate("not-a-date")).toBe("not-a-date");
        expect(formatSparklineTooltipDate("Week 42")).toBe("Week 42");
        expect(formatSparklineTooltipDate("Sprint 3")).toBe("Sprint 3");
    });

    it("handles numeric categories by converting to string", () => {
        // Numeric index categories (e.g. 1, 2, 3) should return the raw stringified number
        // because integers are not valid dates
        expect(formatSparklineTooltipDate(1)).toBe("1");
        expect(formatSparklineTooltipDate(42)).toBe("42");
    });
});
