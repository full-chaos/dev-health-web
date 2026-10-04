import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { graphqlFetchMock } = vi.hoisted(() => ({ graphqlFetchMock: vi.fn() }));
vi.mock("../server", () => ({ graphqlFetch: graphqlFetchMock }));

import { REVIEW_EDGES_QUERY } from "../queries";
import { getReviewEdgesViaGraphQL } from "../reviewEdgesFetchers";

// The reviewEdges request as the page sends it (CHAOS-2077). query-api resolves an operation by
// the hash of the exact request TEXT, so a change to the document needs a paired ops swap; the
// hash below makes such a change fail here instead of in production (CHAOS-7732 follow-up).

const ok = { reviewEdges: { edges: [], totalCount: 0 } };

describe("reviewEdges request", () => {
    beforeEach(() => {
        graphqlFetchMock.mockReset();
        graphqlFetchMock.mockResolvedValue(ok);
    });

    // CHAOS-8533: the text changed with its paired ops change (CHAOS-8485): it asks for the
    // served keys and names (reviewerKey, authorKey, reviewerName, authorName) and no longer for
    // the stored identities. The pin is the sha256 of that new text.
    it("the document text is unchanged (its sha256 is pinned: a change needs a paired ops swap)", () => {
        expect(createHash("sha256").update(REVIEW_EDGES_QUERY).digest("hex")).toBe(
            "128394769f0cf448d9e7adbea62e080ffb44b3c29c6fa2edc4e75ad83ff6a0e8",
        );
    });

    it("sends org, window, repoIds (null when absent) and the default limit 500", async () => {
        await getReviewEdgesViaGraphQL({
            orgId: "org-1",
            sinceDate: "2026-09-01",
            untilDate: "2026-09-30",
        });
        expect(graphqlFetchMock).toHaveBeenCalledWith(
            REVIEW_EDGES_QUERY,
            {
                input: {
                    orgId: "org-1",
                    sinceDate: "2026-09-01",
                    untilDate: "2026-09-30",
                    repoIds: null,
                    limit: 500,
                },
            },
            { orgId: "org-1" },
        );
    });

    it("passes repoIds as given", async () => {
        await getReviewEdgesViaGraphQL({
            orgId: "org-1",
            sinceDate: "2026-09-01",
            untilDate: "2026-09-30",
            repoIds: ["repo-a", "repo-b"],
        });
        expect(graphqlFetchMock.mock.calls[0][1].input.repoIds).toEqual(["repo-a", "repo-b"]);
    });

    it("returns the result object as the server gave it", async () => {
        graphqlFetchMock.mockResolvedValue({ reviewEdges: { edges: [], totalCount: 7 } });
        await expect(
            getReviewEdgesViaGraphQL({
                orgId: "o",
                sinceDate: "2026-09-01",
                untilDate: "2026-09-02",
            }),
        ).resolves.toEqual({ edges: [], totalCount: 7 });
    });

    it("sends teamIds, in order, only when there are some (CHAOS-7785)", async () => {
        const base = { orgId: "org-1", sinceDate: "2026-09-01", untilDate: "2026-09-30" };
        await getReviewEdgesViaGraphQL({ ...base, teamIds: ["team-b", "team-a"] });
        expect(graphqlFetchMock.mock.calls[0][1].input.teamIds).toEqual(["team-b", "team-a"]);
        for (const none of [undefined, null, []]) {
            graphqlFetchMock.mockClear();
            await getReviewEdgesViaGraphQL({ ...base, teamIds: none });
            expect(
                Object.keys(graphqlFetchMock.mock.calls[0][1].input),
                String(none),
            ).not.toContain("teamIds");
        }
    });
});
