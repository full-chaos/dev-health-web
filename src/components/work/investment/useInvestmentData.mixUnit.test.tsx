/**
 * CHAOS-9688: a mix served in lines of code, hours or churn is never drawn as work units. The
 * mix, the treemap, the sunburst and the classification table all read `investmentMix`, so a
 * dropped mix becomes the unavailable state for all of them.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { MetricFilter } from "@/lib/filters/types";

const h = vi.hoisted(() => ({
    mix: null as Record<string, unknown> | null,
}));

const { debug } = vi.hoisted(() => ({ debug: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { debug } }));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace: vi.fn() }),
    usePathname: () => "/investment",
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api/investment", () => ({
    explainInvestmentMix: vi.fn(() => new Promise(() => {})),
    getWorkUnitExplanation: vi.fn(() => new Promise(() => {})),
    getWorkUnits: vi.fn(() => new Promise(() => {})),
}));

vi.mock("@/lib/graphql/hooks", () => ({
    useInvestmentMix: () => ({ data: h.mix, loading: false, error: null, refetch: vi.fn() }),
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

const mixWith = (unit: string) => ({
    theme_distribution: { quality: 10 },
    subcategory_distribution: {},
    unit,
});

describe("useInvestmentData mix unit guard (CHAOS-9688)", () => {
    afterEach(() => vi.restoreAllMocks());

    for (const unit of ["loc", "LOC", "lines_changed", "active_hours", "churn_loc", "effort"]) {
        it(`drops a mix served in "${unit}" and logs the unit class`, () => {
            debug.mockClear();
            h.mix = mixWith(unit);
            const { result } = renderHook(() => useInvestmentData({ filters }));
            expect(result.current.investmentMix).toBeNull();
            expect(result.current.mixFailed).toBe(true);
            expect(debug).toHaveBeenCalledWith(
                expect.objectContaining({ unitClass: unit }),
                expect.stringContaining("not a work-unit count"),
            );
        });
    }

    for (const unit of ["work_units", "delivery_units"]) {
        it(`keeps a mix served in "${unit}"`, () => {
            h.mix = mixWith(unit);
            const { result } = renderHook(() => useInvestmentData({ filters }));
            expect(result.current.investmentMix).not.toBeNull();
            expect(result.current.mixFailed).toBe(false);
        });
    }
});
