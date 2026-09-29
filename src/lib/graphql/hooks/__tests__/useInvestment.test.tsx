import { describe, expect, it, vi } from "vitest";

import { renderHook } from "@testing-library/react";

const mockUseQuery = vi.fn(
    (..._args: unknown[]): [{ data: unknown; fetching: boolean; error: unknown }] => [
        { data: undefined, fetching: false, error: undefined },
    ],
);

vi.mock("urql", () => ({
    useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

vi.mock("../../provider", () => ({
    useOrgId: () => "org-1",
}));

import type { MetricFilter } from "@/lib/filters/types";
import type { WorkItemTeamAttribution } from "../../__generated__/types";

import { WORK_ITEM_TEAM_ATTRIBUTIONS_QUERY } from "../../queries";
import { useWorkItemTeamAttributions } from "../useInvestment";

const baseFilters: MetricFilter = {
    scope: { level: "org", ids: [] },
    time: { range_days: 30, compare_days: 30 },
    who: { developers: [] },
    what: { repos: [] },
    why: { work_category: [], issue_type: [] },
    how: { flow_stage: [] },
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
        ]);

        const { result } = renderHook(() =>
            useWorkItemTeamAttributions({ filters: baseFilters, workItemIds: ["linear:CHAOS-1"] }),
        );

        expect(result.current.byWorkItemId.get("linear:CHAOS-1")).toEqual(rows[0]);
    });
});
