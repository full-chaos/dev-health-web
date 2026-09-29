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

import type { Recommendation } from "../../__generated__/types";

import { RECOMMENDATIONS_QUERY } from "../../queries";
import { useRecommendations } from "../useRecommendations";

describe("useRecommendations (CHAOS-7068)", () => {
    it("forwards orgId, team, and a default 4-week window", () => {
        renderHook(() => useRecommendations({ team: "team-9" }));

        expect(mockUseQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                query: RECOMMENDATIONS_QUERY,
                variables: {
                    orgId: "org-1",
                    team: "team-9",
                    window: { value: 4, unit: "WEEK" },
                },
            }),
        );
    });

    it("forwards a caller-supplied window instead of the default", () => {
        renderHook(() =>
            useRecommendations({ team: "team-9", window: { value: 2, unit: "CYCLE" } }),
        );

        expect(mockUseQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                variables: expect.objectContaining({ window: { value: 2, unit: "CYCLE" } }),
            }),
        );
    });

    it("pauses when there is no team", () => {
        renderHook(() => useRecommendations({ team: "" }));

        expect(mockUseQuery).toHaveBeenCalledWith(expect.objectContaining({ pause: true }));
    });

    it("returns the recommendations list from the query result", () => {
        const rows: Recommendation[] = [
            {
                ruleId: "rule-1",
                teamId: "team-9",
                orgId: "org-1",
                computedAt: "2026-09-28T00:00:00Z",
                windowStart: "2026-09-01",
                windowEnd: "2026-09-28",
                severity: "WARNING",
                title: "Reduce review latency",
                rationale: "Review latency exceeds the team's trailing baseline.",
                successCriterion: "Median review time under 24h for 2 consecutive weeks.",
                evidence: [],
            },
        ];
        mockUseQuery.mockReturnValueOnce([
            { data: { recommendations: rows }, fetching: false, error: undefined },
        ]);

        const { result } = renderHook(() => useRecommendations({ team: "team-9" }));

        expect(result.current.data).toEqual(rows);
    });
});
