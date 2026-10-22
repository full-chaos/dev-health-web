import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { MetricFilter } from "@/lib/filters/types";

const h = vi.hoisted(() => ({
    mixOptions: [] as Array<{ dateRange?: { startDate: string; endDate: string } }>,
    explain: vi.fn(() => new Promise(() => {})),
    workUnits: vi.fn(() => new Promise(() => {})),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace: vi.fn() }),
    usePathname: () => "/investment",
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api/investment", () => ({
    explainInvestmentMix: h.explain,
    getWorkUnitExplanation: vi.fn(() => new Promise(() => {})),
    getWorkUnits: h.workUnits,
}));

vi.mock("@/lib/graphql/hooks", () => ({
    useInvestmentMix: (options: { dateRange?: { startDate: string; endDate: string } }) => {
        h.mixOptions.push(options);
        return { data: null, loading: false, error: null, refetch: vi.fn() };
    },
    useInvestmentFlow: () => ({ data: null, loading: false, error: null, refetch: vi.fn() }),
    useInvestmentRepoTeamFlow: () => ({
        data: null,
        loading: false,
        error: null,
        refetch: vi.fn(),
    }),
}));

import { useInvestmentData } from "./useInvestmentData";

const filters: MetricFilter = {
    scope: { level: "org", ids: [] },
    time: { range_days: 30, compare_days: 30 },
    who: { developers: [] },
    what: { repos: [] },
    why: { work_category: [] },
    how: {},
};

describe("useInvestmentData explain window", () => {
    it("names the one range the mix is read over when it asks for the explanation", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-18T23:59:00Z"));
        try {
            renderHook(() => useInvestmentData({ filters }));
        } finally {
            vi.useRealTimers();
        }
        const mixRange = h.mixOptions.at(-1)?.dateRange;
        expect(mixRange).toEqual({ startDate: "2026-09-18", endDate: "2026-10-17" });
        expect(h.explain).toHaveBeenCalledWith(expect.objectContaining({ dateRange: mixRange }));
    });

    it("reads the work-unit table over the same range as the mix", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-18T23:59:00Z"));
        h.workUnits.mockClear();
        try {
            renderHook(() => useInvestmentData({ filters }));
        } finally {
            vi.useRealTimers();
        }
        expect(h.workUnits).toHaveBeenCalledTimes(1);
        expect(h.workUnits).toHaveBeenCalledWith(
            expect.objectContaining({
                dateRange: { startDate: "2026-09-18", endDate: "2026-10-17" },
            }),
        );
    });

    it("asks again after UTC midnight for an equivalent filters object, so the explanation follows the mix's new window", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-18T23:59:00Z"));
        h.explain.mockClear();
        h.explain.mockResolvedValue({ summary: "s" });
        try {
            const { rerender } = renderHook(({ f }) => useInvestmentData({ filters: f }), {
                initialProps: { f: filters },
            });
            await vi.advanceTimersByTimeAsync(0);
            expect(h.explain).toHaveBeenCalledTimes(1);
            vi.setSystemTime(new Date("2026-10-19T00:01:00Z"));
            rerender({ f: JSON.parse(JSON.stringify(filters)) as MetricFilter });
            await vi.advanceTimersByTimeAsync(0);
        } finally {
            vi.useRealTimers();
        }
        expect(h.explain).toHaveBeenCalledTimes(2);
        expect(h.explain).toHaveBeenLastCalledWith(
            expect.objectContaining({
                dateRange: { startDate: "2026-09-19", endDate: "2026-10-18" },
            }),
        );
    });
});
