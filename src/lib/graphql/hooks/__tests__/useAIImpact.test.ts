import { describe, expect, it, vi } from "vitest";

vi.mock("urql", () => ({
    useQuery: vi.fn(),
}));

vi.mock("../../provider", () => ({
    useOrgId: () => "org",
}));

import { toAIQueryVariables } from "../useAIImpact";

describe("toAIQueryVariables", () => {
    it("maps AI filter fields to GraphQL dateRange and scope inputs", () => {
        const variables = toAIQueryVariables({
            startDate: "2026-04-20",
            endDate: "2026-05-19",
            repoId: "repo-a",
            teamId: "team-a",
            workType: "feature",
            buckets: ["AI_ASSISTED", "AGENT_CREATED"],
        });

        expect(variables).toEqual({
            dateRange: { startDate: "2026-04-20", endDate: "2026-05-19" },
            scope: {
                repoId: "repo-a",
                teamId: "team-a",
                workType: "feature",
                buckets: ["AI_ASSISTED", "AGENT_CREATED"],
            },
        });
    });

    it("uses nulls for omitted optional scope fields", () => {
        expect(
            toAIQueryVariables({ startDate: "2026-04-20", endDate: "2026-05-19" }).scope,
        ).toEqual({
            repoId: null,
            teamId: null,
            workType: null,
            buckets: null,
        });
    });
});
