import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CHAOS-8494 (same rule as ruling 51): no e-mail address leaves the server on the PR detail read.
 * The tests go through the fetcher (the real producer of the rows the page gets); only the network
 * call is replaced.
 */
vi.mock("../server", () => ({ graphqlFetch: vi.fn() }));

import { graphqlFetch } from "../server";
import { getPrDetailViaGraphQL } from "../workGraphFetchers";

const mockedFetch = vi.mocked(graphqlFetch);

const served = (over: Record<string, unknown> = {}) => ({
    id: "repo#pr1",
    orgId: "org-1",
    repoId: "repo",
    number: 1,
    title: "PR",
    createdAt: "2026-06-01T12:00:00Z",
    changesRequestedCount: 0,
    reviewsCount: 2,
    commentsCount: 0,
    authorName: null,
    authorEmail: "ada@example.com",
    reviews: [
        { reviewId: "r1", reviewer: "grace@example.com", state: "APPROVED", submittedAt: "x" },
        { reviewId: "r2", reviewer: "grace-h", state: "COMMENTED", submittedAt: "x" },
    ],
    commits: [
        {
            hash: "abc",
            message: "m",
            authorName: "Ada <ada@example.com>",
            authorEmail: "ada@example.com",
        },
        { hash: "def", message: "n", authorName: "Ada", authorEmail: "ada@example.com" },
    ],
    linkedIssues: [],
    ...over,
});

describe("getPrDetailViaGraphQL: no e-mail address", () => {
    beforeEach(() => mockedFetch.mockReset());

    it("drops every address field and holds no '@' in the result", async () => {
        mockedFetch.mockResolvedValueOnce({ pr: served() });
        const pr = await getPrDetailViaGraphQL({ orgId: "org-1", id: "repo#pr1" });
        expect(pr).not.toBeNull();
        expect(JSON.stringify(pr)).not.toContain("@");
        expect(pr).not.toHaveProperty("authorEmail");
        expect(pr?.commits.every((c) => !("authorEmail" in c))).toBe(true);
    });

    it("keeps a served name and a non-address reviewer; an address reads Not reported", async () => {
        mockedFetch.mockResolvedValueOnce({ pr: served({ authorName: "Ada" }) });
        const pr = await getPrDetailViaGraphQL({ orgId: "org-1", id: "repo#pr1" });
        expect(pr?.authorName).toBe("Ada");
        expect(pr?.reviews.map((r) => r.reviewer)).toEqual(["Not reported", "grace-h"]);
        expect(pr?.commits.map((c) => c.authorName)).toEqual([null, "Ada"]);
    });

    it("takes out a name that is itself an address", async () => {
        mockedFetch.mockResolvedValueOnce({ pr: served({ authorName: "ada@example.com" }) });
        const pr = await getPrDetailViaGraphQL({ orgId: "org-1", id: "repo#pr1" });
        expect(pr?.authorName).toBeNull();
    });

    it("leaves free text alone: a version pin is not an address", async () => {
        mockedFetch.mockResolvedValueOnce({
            pr: served({
                title: "Bump lodash@4.17.21 and actions/checkout@v4",
                commits: [{ hash: "abc", message: "Upgrade to react@19" }],
            }),
        });
        const pr = await getPrDetailViaGraphQL({ orgId: "org-1", id: "repo#pr1" });
        expect(pr?.title).toBe("Bump lodash@4.17.21 and actions/checkout@v4");
        expect(pr?.commits[0].message).toBe("Upgrade to react@19");
    });

    it("passes a missing PR through", async () => {
        mockedFetch.mockResolvedValueOnce({ pr: null });
        expect(await getPrDetailViaGraphQL({ orgId: "org-1", id: "x" })).toBeNull();
    });
});
