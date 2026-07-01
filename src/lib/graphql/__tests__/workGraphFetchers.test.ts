import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../server", () => ({
    graphqlFetch: vi.fn(),
}));

import { graphqlFetch } from "../server";
import { getPrDetailViaGraphQL } from "../workGraphFetchers";

const mockedFetch = vi.mocked(graphqlFetch);

describe("getPrDetailViaGraphQL", () => {
    beforeEach(() => {
        mockedFetch.mockReset();
    });

    it("returns the pr(id) payload from GraphQL", async () => {
        const pr = {
            id: "repo#pr1",
            orgId: "org-1",
            repoId: "repo",
            number: 1,
            title: "PR",
            createdAt: "2026-06-01T12:00:00Z",
            changesRequestedCount: 0,
            reviewsCount: 0,
            commentsCount: 0,
            reviews: [],
            commits: [],
            linkedIssues: [],
        };
        mockedFetch.mockResolvedValueOnce({ pr });

        const result = await getPrDetailViaGraphQL({ orgId: "org-1", id: "repo#pr1" });

        expect(result).toEqual(pr);
        expect(mockedFetch).toHaveBeenCalledTimes(1);
        expect(mockedFetch.mock.calls[0][1]).toEqual({ orgId: "org-1", id: "repo#pr1" });
        expect(mockedFetch.mock.calls[0][2]).toEqual({ orgId: "org-1" });
    });

    it("returns null when GraphQL has no PR for the id", async () => {
        mockedFetch.mockResolvedValueOnce({ pr: null });

        const result = await getPrDetailViaGraphQL({ orgId: "org-1", id: "missing" });

        expect(result).toBeNull();
    });
});
