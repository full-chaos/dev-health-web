import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/graphql/urqlClient", () => ({
    graphqlFetch: vi.fn(),
}));

import { graphqlFetch } from "@/lib/graphql/urqlClient";
import { OPERATING_REVIEW_QUERY } from "@/lib/graphql/queries";
import { getOperatingReviewViaGraphQL } from "@/lib/graphql/operatingReviewFetchers";
import type { OperatingReview } from "@/lib/graphql/types";

describe("getOperatingReviewViaGraphQL", () => {
    it("fetches a team/week operating review with org scoping", async () => {
        const payload: OperatingReview = {
            orgId: "org-1",
            teamId: "team-a",
            weekStart: "2026-05-18",
            priorWeekStart: "2026-05-11",
            sections: [],
            recommendations: [],
            recommendationsEmptyState: "No operating review rules are configured.",
        };
        vi.mocked(graphqlFetch).mockResolvedValue({ operatingReview: payload });

        const result = await getOperatingReviewViaGraphQL("org-1", {
            teamId: "team-a",
            weekStart: "2026-05-18",
        });

        expect(result).toBe(payload);
        expect(graphqlFetch).toHaveBeenCalledWith(
            OPERATING_REVIEW_QUERY,
            {
                orgId: "org-1",
                input: { teamId: "team-a", weekStart: "2026-05-18" },
            },
            { orgId: "org-1" },
        );
    });
});
