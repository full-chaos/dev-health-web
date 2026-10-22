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

    describe.each(["2026-10-19T00:30:00Z", "2026-10-19T23:30:00Z"])(
        "explicit end_date is never later than yesterday (UTC) at %s",
        (now) => {
            const run = (start_date: string, end_date: string) => {
                vi.useFakeTimers();
                vi.setSystemTime(new Date(now));
                return buildDateRange(filters({ start_date, end_date, range_days: 14 }));
            };

            it("clamps end = today to yesterday", () => {
                expect(run("2026-10-05", "2026-10-19")).toEqual({
                    startDate: "2026-10-05",
                    endDate: "2026-10-18",
                });
            });

            it("clamps end = tomorrow to yesterday", () => {
                expect(run("2026-10-05", "2026-10-20")).toEqual({
                    startDate: "2026-10-05",
                    endDate: "2026-10-18",
                });
            });

            it("leaves end = yesterday unchanged", () => {
                expect(run("2026-10-05", "2026-10-18")).toEqual({
                    startDate: "2026-10-05",
                    endDate: "2026-10-18",
                });
            });

            it("leaves an end before yesterday unchanged", () => {
                expect(run("2026-10-05", "2026-10-10")).toEqual({
                    startDate: "2026-10-05",
                    endDate: "2026-10-10",
                });
            });

            it("clamps start to the clamped end when start is later than it", () => {
                expect(run("2026-10-19", "2026-10-19")).toEqual({
                    startDate: "2026-10-18",
                    endDate: "2026-10-18",
                });
                expect(run("2026-10-25", "2026-10-30")).toEqual({
                    startDate: "2026-10-18",
                    endDate: "2026-10-18",
                });
            });

            it("keeps a start equal to the clamped end", () => {
                expect(run("2026-10-18", "2026-10-19")).toEqual({
                    startDate: "2026-10-18",
                    endDate: "2026-10-18",
                });
            });

            it("compares the date part when a URL param carries a time part", () => {
                expect(run("2026-10-05T00:00:00Z", "2026-10-19T08:00:00Z")).toEqual({
                    startDate: "2026-10-05T00:00:00Z",
                    endDate: "2026-10-18",
                });
                expect(run("2026-10-19T08:00:00Z", "2026-10-19T09:00:00Z")).toEqual({
                    startDate: "2026-10-18",
                    endDate: "2026-10-18",
                });
                expect(run("2026-10-05", "2026-10-18T23:59:59Z")).toEqual({
                    startDate: "2026-10-05",
                    endDate: "2026-10-18T23:59:59Z",
                });
            });

            it("passes an unparseable end through unchanged", () => {
                expect(run("2026-10-05", "not-a-date")).toEqual({
                    startDate: "2026-10-05",
                    endDate: "not-a-date",
                });
            });
        },
    );

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
