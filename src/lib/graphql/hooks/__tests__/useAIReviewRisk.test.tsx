import { describe, expect, it, vi } from "vitest";

import { renderHook } from "@testing-library/react";

const mockUseQuery = vi.fn((..._args: unknown[]) => [
    { data: undefined, fetching: false, error: undefined },
]);

vi.mock("urql", () => ({
    useQuery: (...args: unknown[]) => mockUseQuery(...args),
}));

vi.mock("../../provider", () => ({
    useOrgId: () => "org-1",
}));

import type { AIFilter } from "@/lib/filters/ai";

import { AI_ATTRIBUTION_OVERVIEW_QUERY } from "../../queries";
import { useAIAttributionOverview } from "../useAIReviewRisk";

describe("useAIAttributionOverview variable wiring (CHAOS-2744 finding 5)", () => {
    it("forwards dateRange, scope, limit, and offset to the attribution overview query", () => {
        const filter: AIFilter = {
            startDate: "2026-04-01",
            endDate: "2026-05-01",
            repoId: "repo-1",
        };

        renderHook(() => useAIAttributionOverview(filter, 25, 50));

        expect(mockUseQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                query: AI_ATTRIBUTION_OVERVIEW_QUERY,
                variables: expect.objectContaining({
                    orgId: "org-1",
                    dateRange: { startDate: "2026-04-01", endDate: "2026-05-01" },
                    scope: expect.objectContaining({ repoId: "repo-1" }),
                    limit: 25,
                    offset: 50,
                }),
            }),
        );
    });

    it("defaults limit and offset when the caller omits them", () => {
        const filter: AIFilter = { startDate: "2026-01-01", endDate: "2026-01-31" };

        renderHook(() => useAIAttributionOverview(filter));

        expect(mockUseQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                variables: expect.objectContaining({ limit: 50, offset: 0, scope: null }),
            }),
        );
    });

    it("omits workType from scope -- AIAttributionScopeInput has no workType field (CHAOS-2744 ops #1098)", () => {
        const filter: AIFilter = {
            startDate: "2026-04-01",
            endDate: "2026-05-01",
            repoId: "repo-1",
            teamId: "team-1",
            workType: "feature",
            buckets: ["AI_ASSISTED"],
        };

        renderHook(() => useAIAttributionOverview(filter, 25, 50));

        expect(mockUseQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                query: AI_ATTRIBUTION_OVERVIEW_QUERY,
                variables: expect.objectContaining({
                    dateRange: { startDate: "2026-04-01", endDate: "2026-05-01" },
                    scope: expect.objectContaining({
                        repoId: "repo-1",
                        teamId: "team-1",
                        buckets: ["AI_ASSISTED"],
                    }),
                    limit: 25,
                    offset: 50,
                }),
            }),
        );

        const call = mockUseQuery.mock.calls.at(-1)?.[0] as
            { variables?: { scope?: Record<string, unknown> } } | undefined;
        expect(call?.variables?.scope).not.toHaveProperty("workType");
    });
});
