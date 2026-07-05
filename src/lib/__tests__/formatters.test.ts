import { describe, expect, it, beforeEach } from "vitest";
import {
    formatDelta,
    formatMetricValue,
    formatNumber,
    formatPercent,
    formatDateTimeUTC,
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

    it("formats rounded negative-zero deltas as zero", () => {
        expect(formatDelta(-0.2)).toBe("0%");
    });

    it("formats metric values by unit", () => {
        expect(formatMetricValue(3.4, "days")).toBe("3.4d");
        expect(formatMetricValue(11, "%")).toBe("11%");
        expect(formatMetricValue(8, "hours")).toBe("8h");
    });

    describe("formatMetricValue duration (unit='m')", () => {
        // Values arrive in minutes (fetcher normalises real seconds→minutes;
        // sample data is already in minutes). The formatter only labels the unit.

        it("formats an already-minutes value with 1 decimal and 'm' suffix", () => {
            // Sample: PIPELINE_DURATION_P95 ends at 12 → "12m"
            expect(formatMetricValue(12, "m")).toBe("12m");
        });

        it("formats a fractional-minutes value to 1 decimal", () => {
            // e.g. 9.345 minutes → "9.3m"
            expect(formatMetricValue(9.345, "m")).toBe("9.3m");
        });

        it("formats a sub-minute value (0.5 min = 30 s after normalisation)", () => {
            expect(formatMetricValue(0.5, "m")).toBe("0.5m");
        });

        it("does NOT divide by 60 — 12 stays 12, not 0.2", () => {
            // Regression guard: the old bug divided sample values by 60,
            // turning 12m into 0.2m. The formatter must not convert units.
            expect(formatMetricValue(12, "m")).not.toBe("0.2m");
        });

        it("does not affect non-duration units", () => {
            expect(formatMetricValue(42, "%")).toBe("42%");
            expect(formatMetricValue(3, "days")).toBe("3d");
        });
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
        const formatter = getFormatter({
            notation: "compact",
            maximumFractionDigits: 1,
        });
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
        const formatter = getFormatter({
            notation: "compact",
            maximumFractionDigits: 0,
        });
        expect(formatter).not.toBe(compactFormatter);
        expect(customFormatters.size).toBe(1);
    });
});

describe("formatDateTimeUTC", () => {
    it("formats a timestamp deterministically in UTC regardless of runtime timezone", () => {
        expect(formatDateTimeUTC("2025-01-01T12:34:00Z")).toBe("Jan 1, 2025, 12:34 PM UTC");
    });

    it("returns an em dash for a null or undefined value", () => {
        expect(formatDateTimeUTC(null)).toBe("—");
        expect(formatDateTimeUTC(undefined)).toBe("—");
    });

    it("returns an em dash for an unparseable value", () => {
        expect(formatDateTimeUTC("not-a-date")).toBe("—");
    });
});
