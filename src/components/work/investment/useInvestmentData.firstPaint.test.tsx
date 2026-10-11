/**
 * CHAOS-9255: first-paint reads of the Investment tabs.
 *
 * Overview and Confidence draw no Sankey. The team-category flow feeds their coverage numbers;
 * the repository-team flow is only the fallback for a value the first flow lacks, so it starts
 * only then. Allocation still starts all three flows.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { MetricFilter } from "@/lib/filters/types";
import type { SankeyResponse } from "@/lib/types";
import type { InvestmentTab } from "./types";

type FlowState = { data: SankeyResponse | null; loading: boolean; error: Error | null };

const h = vi.hoisted(() => ({
    // Per render: the `pause` flag of each read, in call order (flow, baseline flow).
    flowPauses: [] as boolean[][],
    repoPauses: [] as boolean[],
    mixPauses: [] as boolean[],
    flow: { data: null, loading: true, error: null } as FlowState,
    repo: { data: null, loading: true, error: null } as FlowState,
}));

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
    useInvestmentMix: ({ pause }: { pause: boolean }) => {
        h.mixPauses.push(pause);
        return { data: null, loading: !pause, error: null, refetch: vi.fn() };
    },
    useInvestmentFlow: ({ pause }: { pause: boolean }) => {
        const last = h.flowPauses[h.flowPauses.length - 1];
        // The hook calls the current flow first, the baseline flow second, in each render.
        if (!last || last.length >= 2) h.flowPauses.push([pause]);
        else last.push(pause);
        const isCurrent = h.flowPauses[h.flowPauses.length - 1].length === 1;
        const state: FlowState = isCurrent
            ? pause
                ? { data: null, loading: false, error: null }
                : h.flow
            : { data: null, loading: false, error: null };
        return { ...state, refetch: vi.fn() };
    },
    useInvestmentRepoTeamFlow: ({ pause }: { pause: boolean }) => {
        h.repoPauses.push(pause);
        const state = pause ? { data: null, loading: false, error: null } : h.repo;
        return { ...state, refetch: vi.fn() };
    },
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

const flowWith = (coverage: SankeyResponse["coverage"], unassigned: boolean): SankeyResponse => ({
    mode: "investment",
    nodes: [
        { name: "Team A", group: "team" },
        ...(unassigned ? [{ name: "Unassigned", group: "team" as const }] : []),
        { name: "Theme", group: "category" },
    ],
    links: [
        { source: "Team A", target: "Theme", value: 6 },
        ...(unassigned ? [{ source: "Unassigned", target: "Theme", value: 4 }] : []),
    ],
    coverage,
});

const lastPauses = () => ({
    flow: h.flowPauses[h.flowPauses.length - 1][0],
    baseline: h.flowPauses[h.flowPauses.length - 1][1],
    repo: h.repoPauses[h.repoPauses.length - 1],
    mix: h.mixPauses[h.mixPauses.length - 1],
});

function reset() {
    h.flowPauses.length = 0;
    h.repoPauses.length = 0;
    h.mixPauses.length = 0;
    h.flow = { data: null, loading: true, error: null };
    h.repo = { data: null, loading: true, error: null };
}

describe("useInvestmentData first-paint reads (CHAOS-9255)", () => {
    beforeEach(reset);
    afterEach(() => reset());

    for (const tab of ["overview", "confidence"] as InvestmentTab[]) {
        describe(tab, () => {
            it("starts mix + the team-category flow only; the repository-team flow waits", () => {
                renderHook(() => useInvestmentData({ filters, activeTab: tab }));
                expect(lastPauses()).toEqual({
                    flow: false,
                    baseline: true,
                    repo: true,
                    mix: false,
                });
            });

            it("keeps the repository-team flow off when the first flow gives all three values", () => {
                h.flow = {
                    data: flowWith({ team: 0.9, repo: 0.8 }, true),
                    loading: false,
                    error: null,
                };
                const { result } = renderHook(() => useInvestmentData({ filters, activeTab: tab }));
                expect(lastPauses().repo).toBe(true);
                expect(result.current.isCoverageLoading).toBe(false);
            });

            it("starts the repository-team flow when the first flow lacks a coverage value, and shows loading meanwhile", () => {
                h.flow = { data: flowWith({ team: 0.9 }, true), loading: false, error: null };
                const { result } = renderHook(() => useInvestmentData({ filters, activeTab: tab }));
                expect(lastPauses().repo).toBe(false);
                expect(result.current.isCoverageLoading).toBe(true);
                h.repo = {
                    data: flowWith({ team: 0.9, repo: 0.7 }, true),
                    loading: false,
                    error: null,
                };
                const { result: settled } = renderHook(() =>
                    useInvestmentData({ filters, activeTab: tab }),
                );
                expect(settled.current.isCoverageLoading).toBe(false);
            });

            it("starts the repository-team flow when there is no unassigned team node (the share is missing)", () => {
                h.flow = {
                    data: flowWith({ team: 0.9, repo: 0.8 }, false),
                    loading: false,
                    error: null,
                };
                renderHook(() => useInvestmentData({ filters, activeTab: tab }));
                expect(lastPauses().repo).toBe(false);
            });

            it("starts the repository-team flow when the first flow failed (today's rule: the second flow fills in)", () => {
                h.flow = { data: null, loading: false, error: new Error("boom") };
                const { result } = renderHook(() => useInvestmentData({ filters, activeTab: tab }));
                expect(lastPauses().repo).toBe(false);
                expect(result.current.categoryFlowFailed).toBe(true);
            });
        });
    }

    it("allocation starts the three flows at once", () => {
        renderHook(() => useInvestmentData({ filters, activeTab: "allocation" }));
        expect(lastPauses()).toEqual({ flow: false, baseline: false, repo: false, mix: true });
    });

    it("overview -> allocation starts the baseline and repository-team flows and keeps the first", () => {
        h.flow = { data: flowWith({ team: 0.9, repo: 0.8 }, true), loading: false, error: null };
        const { rerender } = renderHook(
            ({ tab }: { tab: InvestmentTab }) => useInvestmentData({ filters, activeTab: tab }),
            { initialProps: { tab: "overview" as InvestmentTab } },
        );
        expect(lastPauses()).toMatchObject({ flow: false, baseline: true, repo: true });
        act(() => rerender({ tab: "allocation" }));
        expect(lastPauses()).toMatchObject({ flow: false, baseline: false, repo: false });
    });
});
