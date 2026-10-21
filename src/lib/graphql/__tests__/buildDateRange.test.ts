import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MetricFilter } from "@/lib/filters/types";
import { buildDateRange } from "../investmentFetchers";

const filters = (time: Record<string, unknown>) => ({ time }) as unknown as MetricFilter;

describe("buildDateRange", () => {
    afterEach(() => vi.useRealTimers());

    it.each(["2026-10-19T00:30:00Z", "2026-10-19T23:30:00Z"])(
        "ends yesterday (inclusive, UTC) and holds N full days for a relative range at %s",
        (now) => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date(now));
            const range = buildDateRange(filters({ range_days: 30, compare_days: 30 }));
            expect(range).toEqual({ startDate: "2026-09-19", endDate: "2026-10-18" });
            expect(range.endDate).not.toBe("2026-10-19");
        },
    );

    it("holds one day for range_days = 1", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
        expect(buildDateRange(filters({ range_days: 1 }))).toEqual({
            startDate: "2026-10-18",
            endDate: "2026-10-18",
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
        for (const file of [
            "investmentHydration.ts",
            "hooks/useInvestment.ts",
            "../../components/work/investment/useInvestmentData.ts",
        ]) {
            const source = readFileSync(join(__dirname, "..", file), "utf8");
            expect(source).not.toMatch(/function buildDateRange/);
            expect(source).not.toMatch(/range_days \* 24/);
            expect(source).toMatch(
                /buildDateRange[^;]*from "(\.\/|\.\.\/|@\/lib\/graphql\/)investmentFetchers"/,
            );
        }
    });

    it("computes the window once: InvestmentCharts takes it as a prop and reads no clock", () => {
        const source = readFileSync(
            join(__dirname, "../../../components/work/investment/InvestmentCharts.tsx"),
            "utf8",
        );
        expect(source).not.toMatch(/new Date\(|Date\.now\(|buildDateRange/);
        expect(source).toMatch(/dateRange: \{ startDate: string; endDate: string \}/);
        const view = readFileSync(
            join(__dirname, "../../../components/work/InvestmentView.tsx"),
            "utf8",
        );
        expect(view).toMatch(/dateRange: data\.mixDateRange/);
    });
});
