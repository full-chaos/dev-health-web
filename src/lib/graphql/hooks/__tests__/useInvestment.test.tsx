import { describe, expect, it, vi } from "vitest";

import { renderHook } from "@testing-library/react";

type MockQueryResult = { data: unknown; fetching: boolean; error: unknown };

const mockUseQuery = vi.fn((..._args: unknown[]): [MockQueryResult, () => void] => [
    { data: undefined, fetching: false, error: undefined },
    vi.fn(),
]);

vi.mock("urql", () => ({
    useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

vi.mock("../../provider", () => ({
    useOrgId: () => "org-1",
}));

import type { MetricFilter } from "@/lib/filters/types";
import type { WorkItemTeamAttribution } from "../../__generated__/types";

import {
    INVESTMENT_EVIDENCE_QUALITY_QUERY,
    WORK_ITEM_TEAM_ATTRIBUTIONS_QUERY,
} from "../../queries";
import {
    useInvestmentEvidenceQualityGroups,
    useInvestmentFlow,
    useInvestmentMix,
    useInvestmentRepoTeamFlow,
    useWorkItemTeamAttributions,
} from "../useInvestment";

const baseFilters: MetricFilter = {
    scope: { level: "org", ids: [] },
    time: { range_days: 30, compare_days: 30 },
    who: { developers: [] },
    what: { repos: [] },
    why: { work_category: [] },
    how: {},
};

describe("useWorkItemTeamAttributions (CHAOS-7069)", () => {
    it("forwards orgId, de-duplicated+sorted workItemIds, and teamId to the query", () => {
        renderHook(() =>
            useWorkItemTeamAttributions({
                filters: baseFilters,
                workItemIds: ["linear:CHAOS-2", "linear:CHAOS-1", "linear:CHAOS-1"],
                teamId: "team-9",
            }),
        );

        expect(mockUseQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                query: WORK_ITEM_TEAM_ATTRIBUTIONS_QUERY,
                variables: {
                    orgId: "org-1",
                    workItemIds: ["linear:CHAOS-1", "linear:CHAOS-2"],
                    teamId: "team-9",
                },
            }),
        );
    });

    it("pauses when there are no work item ids", () => {
        renderHook(() => useWorkItemTeamAttributions({ filters: baseFilters, workItemIds: [] }));

        expect(mockUseQuery).toHaveBeenCalledWith(expect.objectContaining({ pause: true }));
    });

    it("indexes returned rows by workItemId — no client-side primary selection", () => {
        const rows: WorkItemTeamAttribution[] = [
            {
                workItemId: "linear:CHAOS-1",
                provider: "linear",
                teamId: "team-9",
                teamName: "Platform",
                source: "NATIVE_TEAM",
                confidence: "HIGH",
                isPrimary: true,
                evidence: "native team field",
            },
        ];
        mockUseQuery.mockReturnValueOnce([
            { data: { workItemTeamAttributions: rows }, fetching: false, error: undefined },
            vi.fn(),
        ]);

        const { result } = renderHook(() =>
            useWorkItemTeamAttributions({ filters: baseFilters, workItemIds: ["linear:CHAOS-1"] }),
        );

        expect(result.current.byWorkItemId.get("linear:CHAOS-1")).toEqual(rows[0]);
    });
});

describe("useInvestmentEvidenceQualityGroups (CHAOS-8745)", () => {
    const datedFilters: MetricFilter = {
        ...baseFilters,
        time: {
            range_days: 30,
            compare_days: 30,
            start_date: "2026-04-01",
            end_date: "2026-04-30",
        },
    };

    it.each([
        ["theme", "THEME"],
        ["subcategory", "SUBCATEGORY"],
        ["type", "WORK_TYPE"],
    ] as const)("requests the canonical %s grouping", (groupBy, evidenceQualityGroupBy) => {
        mockUseQuery.mockClear();

        renderHook(() => useInvestmentEvidenceQualityGroups({ filters: datedFilters, groupBy }));

        expect(mockUseQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                query: INVESTMENT_EVIDENCE_QUALITY_QUERY,
                variables: expect.objectContaining({
                    orgId: "org-1",
                    batch: expect.objectContaining({
                        useInvestment: true,
                        evidenceQualityGroupBy,
                        breakdowns: [
                            {
                                dimension: "THEME",
                                measure: "COUNT",
                                dateRange: { startDate: "2026-04-01", endDate: "2026-04-30" },
                                topN: 1,
                            },
                        ],
                    }),
                }),
            }),
        );
    });

    it("preserves a served zero and a served null without client aggregation", () => {
        mockUseQuery.mockReturnValueOnce([
            {
                data: {
                    analytics: {
                        evidenceQualityByGroup: [
                            {
                                key: "feature_delivery",
                                label: "Feature Delivery",
                                mean: 0,
                                total: 4,
                            },
                            { key: "quality", label: "Quality", mean: null, total: 2 },
                        ],
                    },
                },
                fetching: false,
                error: undefined,
            },
            vi.fn(),
        ]);

        const { result } = renderHook(() =>
            useInvestmentEvidenceQualityGroups({ filters: datedFilters, groupBy: "theme" }),
        );

        expect(result.current.groups).toEqual([
            { key: "feature_delivery", label: "Feature Delivery", mean: 0, total: 4 },
            { key: "quality", label: "Quality", mean: null, total: 2 },
        ]);
    });
});

describe("investment hooks surface the query error and never adapt data beside it", () => {
    const sankeyData = {
        analytics: {
            sankey: {
                nodes: [
                    { id: "t", label: "Alpha", dimension: "TEAM", value: 1 },
                    { id: "r", label: "repo-a", dimension: "REPO", value: 1 },
                ],
                edges: [{ source: "t", target: "r", value: 1 }],
                coverage: { teamCoverage: 0.5, repoCoverage: 0.5 },
            },
        },
    };
    const mixData = {
        analytics: {
            breakdowns: [
                { dimension: "THEME", items: [{ key: "feature_delivery", value: 3 }] },
                { dimension: "SUBCATEGORY", items: [] },
            ],
        },
    };
    const err = new Error("coverage query failed");
    const result = (data: unknown, error?: Error): [MockQueryResult, () => void] => [
        { data, fetching: false, error },
        vi.fn(),
    ];

    type HookCase = readonly [string, () => { data: unknown; error: Error | null }, unknown];
    const cases: HookCase[] = [
        ["useInvestmentFlow", () => useInvestmentFlow({ filters: baseFilters }), sankeyData],
        [
            "useInvestmentRepoTeamFlow",
            () => useInvestmentRepoTeamFlow({ filters: baseFilters }),
            sankeyData,
        ],
        ["useInvestmentMix", () => useInvestmentMix({ filters: baseFilters }), mixData],
    ];

    it.each(cases)("%s: data only -> data, no error", (_name, hook, data) => {
        mockUseQuery.mockReturnValue(result(data));
        const { result: r } = renderHook(hook);
        expect(r.current.data).not.toBeNull();
        expect(r.current.error).toBeNull();
    });

    it.each(cases)("%s: data + error -> error, data null", (_name, hook, data) => {
        mockUseQuery.mockReturnValue(result(data, err));
        const { result: r } = renderHook(hook);
        expect(r.current.error).toBe(err);
        expect(r.current.data).toBeNull();
    });

    it.each(cases)("%s: error only -> error, data null", (_name, hook) => {
        mockUseQuery.mockReturnValue(result(undefined, err));
        const { result: r } = renderHook(hook);
        expect(r.current.error).toBe(err);
        expect(r.current.data).toBeNull();
    });

    it("useInvestmentEvidenceQualityGroups: data + error -> no groups beside the error", () => {
        mockUseQuery.mockReturnValue(
            result(
                {
                    analytics: {
                        evidenceQualityByGroup: [{ key: "a", label: "A", mean: 1, total: 2 }],
                    },
                },
                err,
            ),
        );
        const { result: r } = renderHook(() =>
            useInvestmentEvidenceQualityGroups({ filters: baseFilters, groupBy: "theme" }),
        );
        expect(r.current.error).toBe(err);
        expect(r.current.groups).toEqual([]);
    });
});
