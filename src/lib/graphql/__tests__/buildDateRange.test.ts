import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MetricFilter } from "@/lib/filters/types";
import { buildDateRange } from "../investmentFetchers";

const filters = (time: Record<string, unknown>) => ({ time }) as unknown as MetricFilter;

describe("buildDateRange", () => {
    afterEach(() => vi.useRealTimers());

    it("is the trailing window [today-N, today) for a relative range", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-19T00:30:00Z"));
        expect(buildDateRange(filters({ range_days: 30, compare_days: 30 }))).toEqual({
            startDate: "2026-09-19",
            endDate: "2026-10-19",
        });
    });

    it("passes explicit dates through", () => {
        expect(
            buildDateRange(
                filters({ start_date: "2026-09-30", end_date: "2026-10-14", range_days: 14 }),
            ),
        ).toEqual({ startDate: "2026-09-30", endDate: "2026-10-14" });
    });

    it("has no second copy: every reader of the investment mix imports this one", () => {
        for (const file of ["investmentHydration.ts", "hooks/useInvestment.ts"]) {
            const source = readFileSync(join(__dirname, "..", file), "utf8");
            expect(source).not.toMatch(/function buildDateRange/);
            expect(source).toMatch(/buildDateRange[^;]*from "(\.\/|\.\.\/)investmentFetchers"/);
        }
    });
});
