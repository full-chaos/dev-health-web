import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { complexityWindowFromFilter } from "@/lib/complexity/filters";
import { defaultAIFilter, metricFilterToAIFilter } from "@/lib/filters/ai";
import { defaultMetricFilter } from "@/lib/filters/defaults";
import type { MetricFilter } from "@/lib/filters/types";
import { getBaselineFilters } from "@/lib/investment/transforms";

const rel = (range_days: number): MetricFilter => ({
    ...defaultMetricFilter,
    time: { range_days, compare_days: range_days },
});
const explicit = (start_date: string, end_date: string): MetricFilter => ({
    ...defaultMetricFilter,
    time: { range_days: 7, compare_days: 7, start_date, end_date },
});

describe.each(["2026-10-22T00:30:00Z", "2026-10-22T23:30:00Z"])(
    "shared trailing UTC window [today-N, today) at %s",
    (now) => {
        afterEach(() => vi.useRealTimers());
        const at = () => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date(now));
        };

        it("AI impact window ends yesterday", () => {
            at();
            const ai = metricFilterToAIFilter(rel(7));
            expect(ai.startDate).toBe("2026-10-15");
            expect(ai.endDate).toBe("2026-10-21");
        });

        it("AI impact explicit end later than yesterday is clamped", () => {
            at();
            expect(metricFilterToAIFilter(explicit("2026-10-10", "2026-10-22")).endDate).toBe(
                "2026-10-21",
            );
        });

        it("default AI filter is 30 full days ending yesterday", () => {
            at();
            expect(defaultAIFilter()).toEqual({ startDate: "2026-09-22", endDate: "2026-10-21" });
        });

        it("complexity window ends yesterday 23:59:59Z", () => {
            at();
            expect(complexityWindowFromFilter(rel(7).time)).toEqual({
                sinceUtc: "2026-10-15T00:00:00Z",
                untilUtc: "2026-10-21T23:59:59Z",
            });
        });

        it("complexity explicit end of today is clamped to yesterday", () => {
            at();
            expect(complexityWindowFromFilter(explicit("2026-10-10", "2026-10-22").time)).toEqual({
                sinceUtc: "2026-10-10T00:00:00Z",
                untilUtc: "2026-10-21T23:59:59Z",
            });
        });

        it("baseline ends the day before the shown window starts", () => {
            at();
            const b = getBaselineFilters(rel(7)).time;
            expect(b.start_date).toBe("2026-10-08");
            expect(b.end_date).toBe("2026-10-14");
        });

        it("explicit baseline is unchanged", () => {
            at();
            const b = getBaselineFilters(explicit("2026-10-10", "2026-10-16")).time;
            expect(b.start_date).toBe("2026-10-03");
            expect(b.end_date).toBe("2026-10-09");
        });
    },
);

describe("no second window formula", () => {
    it("the three readers read no clock and use the shared window", () => {
        for (const file of ["ai.ts", "../complexity/filters.ts", "../investment/transforms.ts"]) {
            const src = readFileSync(join(__dirname, "..", file), "utf8");
            expect(src).not.toMatch(/new Date\(\)|Date\.now\(/);
            expect(src).toMatch(/buildDateRange/);
        }
    });
});
