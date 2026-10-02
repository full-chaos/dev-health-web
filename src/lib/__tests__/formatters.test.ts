import { describe, expect, it, beforeEach } from "vitest";
import {
    formatDelta,
    formatMetricParts,
    formatMetricValue,
    formatNumber,
    formatPercent,
    formatTimestamp,
    formatDateTimeUTC,
    parseTimestampDate,
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

    it("formats a zero delta, and a served -0, as 0% (never -0%)", () => {
        expect(formatDelta(0)).toBe("0%");
        expect(formatDelta(-0)).toBe("0%");
    });

    it("a served delta that is not 0 never shows as 0%", () => {
        expect(formatDelta(0.3)).toBe("+0.3%");
        expect(formatDelta(-0.2)).toBe("-0.2%");
        expect(formatDelta(0.04)).toBe("+<0.1%");
        expect(formatDelta(-0.04)).toBe("-<0.1%");
        // From 0.5 the whole-percent rule shows it, the same both ways.
        expect(formatDelta(0.5)).toBe("+1%");
        expect(formatDelta(-0.5)).toBe("-1%");
        expect(formatDelta(12.4)).toBe("+12%");
        for (const value of [0.001, 0.04, 0.05, 0.3, 0.49, -0.001, -0.3, -0.49, -0.5]) {
            expect(formatDelta(value), String(value)).not.toMatch(/^[+-]?0%$/);
        }
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

describe("formatMetricParts (number and unit apart, for the metric tile)", () => {
    it("gives the number and the served unit word as two parts", () => {
        expect(formatMetricParts(3.4, "days")).toEqual({ value: "3.4", unit: "days" });
        expect(formatMetricParts(8, "hours")).toEqual({ value: "8", unit: "hours" });
        expect(formatMetricParts(11, "%")).toEqual({ value: "11", unit: "%" });
        expect(formatMetricParts(181, "items")).toEqual({ value: "181", unit: "items" });
        expect(formatMetricParts(16, "deploys")).toEqual({ value: "16", unit: "deploys" });
    });

    it("reads 'loc' as LOC with the compact number, and 'm' as min", () => {
        expect(formatMetricParts(1_300_000, "loc")).toEqual({ value: "1.3M", unit: "LOC" });
        expect(formatMetricParts(9.345, "m")).toEqual({ value: "9.3", unit: "min" });
    });

    it("uses the singular word only when the shown number is exactly 1", () => {
        expect(formatMetricParts(1, "days")).toEqual({ value: "1", unit: "day" });
        expect(formatMetricParts(1, "hours")).toEqual({ value: "1", unit: "hour" });
        expect(formatMetricParts(1.5, "days")).toEqual({ value: "1.5", unit: "days" });
        expect(formatMetricParts(0, "hours")).toEqual({ value: "0", unit: "hours" });
        expect(formatMetricParts(2, "hours")).toEqual({ value: "2", unit: "hours" });
        // Units with no singular rule stay as served.
        expect(formatMetricParts(1, "items")).toEqual({ value: "1", unit: "items" });
    });

    it("gives an empty unit for a metric with no unit, and keeps a served zero as 0", () => {
        expect(formatMetricParts(12, "")).toEqual({ value: "12", unit: "" });
        expect(formatMetricParts(0, "%")).toEqual({ value: "0", unit: "%" });
    });

    it("shows the same number as formatMetricValue for every unit (one digits rule)", () => {
        const suffix: Record<string, string> = { "%": "%", days: "d", hours: "h", loc: "", m: "m" };
        const values = [0, 0.04, 0.3, 0.96, 1, 1.5, 9.94, 9.96, 12.345, 181, 1234.5, 1_300_000];
        for (const unit of ["%", "days", "hours", "loc", "m", "items", ""]) {
            for (const value of values) {
                const joined = formatMetricValue(value, unit);
                const expected =
                    unit in suffix
                        ? joined.slice(0, joined.length - suffix[unit].length)
                        : joined.slice(0, joined.length - (unit ? unit.length + 1 : 0));
                expect(formatMetricParts(value, unit).value, `${value} ${unit}`).toBe(expected);
            }
        }
    });
});

describe("small served values never show as 0", () => {
    // Rule: hours and percent keep one decimal below 10 and none from 10; days and minutes keep
    // one decimal; a served non-zero value that the digits cannot show is "<0.1", never "0".
    it("hours: a served 0.3 hours is 0.3, not 0", () => {
        expect(formatMetricValue(0.3, "hours")).toBe("0.3h");
        expect(formatMetricParts(0.3, "hours")).toEqual({ value: "0.3", unit: "hours" });
        expect(formatMetricValue(9.94, "hours")).toBe("9.9h");
        expect(formatMetricValue(12.6, "hours")).toBe("13h");
        expect(formatMetricValue(0.04, "hours")).toBe("<0.1h");
        expect(formatMetricParts(0.04, "hours")).toEqual({ value: "<0.1", unit: "hours" });
    });

    it("percent: a served 0.4% is 0.4%, not 0%", () => {
        expect(formatMetricValue(0.4, "%")).toBe("0.4%");
        expect(formatMetricParts(0.4, "%")).toEqual({ value: "0.4", unit: "%" });
        expect(formatMetricValue(4.24, "%")).toBe("4.2%");
        expect(formatMetricValue(42.4, "%")).toBe("42%");
        expect(formatMetricValue(0.04, "%")).toBe("<0.1%");
    });

    it("days and minutes: one decimal, and a value too small for it is <0.1", () => {
        expect(formatMetricValue(0.2, "days")).toBe("0.2d");
        expect(formatMetricValue(0.04, "days")).toBe("<0.1d");
        expect(formatMetricParts(0.04, "days")).toEqual({ value: "<0.1", unit: "days" });
        expect(formatMetricValue(0.5, "m")).toBe("0.5m");
        expect(formatMetricValue(0.04, "m")).toBe("<0.1m");
        expect(formatMetricParts(0.04, "m")).toEqual({ value: "<0.1", unit: "min" });
    });

    it("other units: a value too small for one decimal is <0.1", () => {
        expect(formatMetricValue(0.04, "items")).toBe("<0.1 items");
        expect(formatMetricParts(0.04, "")).toEqual({ value: "<0.1", unit: "" });
    });

    it("a served 0 stays 0, and a small negative value is never '-0'", () => {
        for (const unit of ["hours", "%", "days", "m", "items"]) {
            expect(formatMetricParts(0, unit).value, unit).toBe("0");
        }
        expect(formatMetricParts(-0, "hours").value).toBe("0");
        expect(formatMetricValue(-0.04, "hours")).toBe(">-0.1h");
        expect(formatMetricValue(-0.3, "hours")).toBe("-0.3h");
    });

    it("never shows a served non-zero value as 0, for any unit", () => {
        const values = [0.001, 0.04, 0.049, 0.05, 0.3, 0.45, 0.96, 4.24, 9.94];
        for (const unit of ["hours", "%", "days", "m", "loc", "items", ""]) {
            for (const value of values) {
                expect(formatMetricParts(value, unit).value, `${value} ${unit}`).not.toMatch(
                    /^-?0$/,
                );
            }
        }
    });
});

describe("timestamp formatting", () => {
    it("parses API timestamps without an explicit timezone as UTC", () => {
        expect(parseTimestampDate("2026-07-08T17:06:00.000")?.toISOString()).toBe(
            "2026-07-08T17:06:00.000Z",
        );
    });

    it("formats timezone-less and explicit UTC timestamps identically", () => {
        expect(formatTimestamp("2026-07-08T17:06:00.000")).toBe(
            formatTimestamp("2026-07-08T17:06:00.000Z"),
        );
    });

    it("uses the provided fallback for missing or invalid values", () => {
        expect(formatTimestamp(null, "—")).toBe("—");
        expect(formatTimestamp("not-a-date", "—")).toBe("—");
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
