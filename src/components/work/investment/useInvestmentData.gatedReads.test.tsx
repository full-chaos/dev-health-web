/**
 * CHAOS-10711: the work-units and mix-explanation REST reads start only on the tabs that draw them.
 * Each runs several ClickHouse statements one after another, so every tab load that does not
 * need them pays for them for nothing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { MetricFilter } from "@/lib/filters/types";
import type { InvestmentTab } from "./types";

const h = vi.hoisted(() => ({
    getWorkUnits: vi.fn(() => new Promise(() => {})),
    explainInvestmentMix: vi.fn(() => new Promise(() => {})),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace: vi.fn() }),
    usePathname: () => "/investment",
    useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api/investment", () => ({
    explainInvestmentMix: h.explainInvestmentMix,
    getWorkUnitExplanation: vi.fn(() => new Promise(() => {})),
    getWorkUnits: h.getWorkUnits,
}));

vi.mock("@/lib/graphql/hooks", () => {
    const idle = { data: null, loading: false, error: null, refetch: vi.fn() };
    return {
        useInvestmentMix: () => idle,
        useInvestmentFlow: () => idle,
        useInvestmentRepoTeamFlow: () => idle,
    };
});

import { useInvestmentData } from "./useInvestmentData";

const filters: MetricFilter = {
    scope: { level: "org", ids: [] },
    time: { range_days: 30, compare_days: 30 },
    who: { developers: [] },
    what: { repos: [] },
    why: { work_category: [] },
    how: {},
};

const calls = () => ({
    units: h.getWorkUnits.mock.calls.length,
    explain: h.explainInvestmentMix.mock.calls.length,
});

describe("useInvestmentData REST reads per tab (CHAOS-10711)", () => {
    beforeEach(() => {
        h.getWorkUnits.mockClear();
        h.explainInvestmentMix.mockClear();
    });

    const expected: Record<InvestmentTab, { units: number; explain: number }> = {
        overview: { units: 1, explain: 1 },
        confidence: { units: 1, explain: 1 },
        evidence: { units: 1, explain: 0 },
        allocation: { units: 0, explain: 0 },
    };
    for (const tab of Object.keys(expected) as InvestmentTab[]) {
        it(`${tab} starts ${expected[tab].units} work-units read and ${expected[tab].explain} explanation read`, () => {
            renderHook(() => useInvestmentData({ filters, activeTab: tab }));
            expect(calls()).toEqual(expected[tab]);
        });
    }

    it("allocation starts the work units once a theme is selected, and still no explanation", () => {
        const { result } = renderHook(() =>
            useInvestmentData({ filters, activeTab: "allocation" }),
        );
        expect(calls()).toEqual({ units: 0, explain: 0 });
        act(() => result.current.setSelectedCategory("feature_delivery"));
        expect(calls()).toEqual({ units: 1, explain: 0 });
    });

    it("allocation -> overview starts both reads; going back does not ask again", () => {
        const { rerender } = renderHook(
            ({ tab }: { tab: InvestmentTab }) => useInvestmentData({ filters, activeTab: tab }),
            { initialProps: { tab: "allocation" as InvestmentTab } },
        );
        expect(calls()).toEqual({ units: 0, explain: 0 });
        act(() => rerender({ tab: "overview" }));
        expect(calls()).toEqual({ units: 1, explain: 1 });
        act(() => rerender({ tab: "allocation" }));
        act(() => rerender({ tab: "overview" }));
        expect(calls()).toEqual({ units: 1, explain: 1 });
    });
});
