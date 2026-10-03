import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CHAOS-7973 (ruling 51): no e-mail address leaves the server on the Review Network read.
 *
 * `reviewEdges` serves the STORED identity of the reviewer and of the author, and in the data the
 * author is the pull request's author e-mail first. The fetcher is the last server step before
 * the rows go to the page, so these tests go through the fetcher itself (the real producer of the
 * rows the page gets), with only the network call replaced.
 */
const graphqlFetch = vi.hoisted(() => vi.fn());
vi.mock("../server", () => ({ graphqlFetch }));

import { getReviewEdgesViaGraphQL } from "../reviewEdgesFetchers";

type Served = {
    reviewer: string;
    author: string;
    reviewsCount: number;
    day: string;
    repoId: string | null;
};
const served = (
    reviewer: string,
    author: string,
    reviewsCount = 1,
    day = "2026-09-01",
): Served => ({
    reviewer,
    author,
    reviewsCount,
    day,
    repoId: "repo-1",
});

async function read(edges: Served[], totalCount = edges.length) {
    graphqlFetch.mockResolvedValue({ reviewEdges: { edges, totalCount } });
    return getReviewEdgesViaGraphQL({
        orgId: "org-1",
        sinceDate: "2026-06-01",
        untilDate: "2026-09-01",
    });
}

beforeEach(() => graphqlFetch.mockReset());

describe("getReviewEdgesViaGraphQL — no e-mail address leaves the server", () => {
    it("gives back no e-mail address in any field, and no name for those people", async () => {
        const result = await read([
            served("cy.fake@example.test", "ana.fake@example.test", 6),
            served("octo-fake", "bo.fake@example.test", 2),
        ]);

        const wire = JSON.stringify(result);
        expect(wire).not.toContain("@");
        // No part of an address either (the old cell showed the part before "@").
        for (const part of ["cy.fake", "ana.fake", "bo.fake", "example.test"]) {
            expect(wire).not.toContain(part);
        }
        expect(result.edges.map((edge) => [edge.reviewerName, edge.authorName])).toEqual([
            [null, null],
            ["octo-fake", null],
        ]);
    });

    it("gives each distinct address one key; the same person has the same key as reviewer and as author", async () => {
        const { edges } = await read([
            served("ana.fake@example.test", "bo.fake@example.test"),
            served("bo.fake@example.test", "ana.fake@example.test"),
            served("cy.fake@example.test", "ana.fake@example.test", 3, "2026-09-02"),
        ]);

        const [first, second, third] = edges;
        expect(second.author).toBe(first.reviewer); // ana
        expect(second.reviewer).toBe(first.author); // bo
        expect(third.author).toBe(first.reviewer); // ana again, another day
        expect(new Set([first.reviewer, first.author, third.reviewer]).size).toBe(3);
    });

    it("makes the key from the order in the answer, never from the address", async () => {
        const one = await read([
            served("ana.fake@example.test", "bo.fake@example.test"),
            served("cy.fake@example.test", "ana.fake@example.test"),
        ]);
        const other = await read([
            served("zed.fake@other.test", "yan.fake@other.test"),
            served("xu.fake@other.test", "zed.fake@other.test"),
        ]);

        const keys = (rows: typeof one.edges) => rows.map((edge) => [edge.reviewer, edge.author]);
        expect(keys(other.edges)).toEqual(keys(one.edges));
        // Two people, three places: the reviewer of the second row is the third person.
        expect(new Set(keys(one.edges).flat()).size).toBe(3);
    });

    it("keeps an identity that is not an address, and shows it as the name", async () => {
        const { edges } = await read([
            served("octo-fake", "Ana Fake"),
            served("fake-ci[bot]", "@odd"),
        ]);

        expect(edges.map((edge) => [edge.reviewerName, edge.authorName])).toEqual([
            ["octo-fake", "Ana Fake"],
            ["fake-ci[bot]", "@odd"],
        ]);
        expect(new Set(edges.flatMap((edge) => [edge.reviewer, edge.author])).size).toBe(4);
    });

    it("takes out an address that sits inside a longer text", async () => {
        const result = await read([served("octo-fake", "Ana Fake <ana.fake@example.test>")]);

        expect(JSON.stringify(result)).not.toContain("@");
        expect(JSON.stringify(result)).not.toContain("Ana Fake");
        expect(result.edges[0].authorName).toBeNull();
    });

    it('gives the placeholder "unknown" no name: it is not a person\'s name', async () => {
        const { edges } = await read([
            served("unknown", "octo-fake"),
            served("unknown", "bo.fake@example.test"),
        ]);

        expect(edges.map((edge) => edge.reviewerName)).toEqual([null, null]);
        // One stored placeholder = one key; it is not mixed with a person whose address was taken out.
        expect(edges[0].reviewer).toBe(edges[1].reviewer);
        expect(edges[1].author).not.toBe(edges[1].reviewer);
    });

    it("cannot mix a kept identity with the key of a person whose address was taken out", async () => {
        const first = await read([served("ana.fake@example.test", "octo-fake")]);
        const opaqueKey = first.edges[0].reviewer;
        // A stored identity that spells the same text as that key is still another person.
        const { edges } = await read([served("ana.fake@example.test", opaqueKey)]);

        expect(edges[0].author).not.toBe(edges[0].reviewer);
        expect(edges[0].authorName).toBe(opaqueKey);
    });

    it("keeps the counts, the day, the repository and the total as served", async () => {
        const result = await read(
            [served("octo-fake", "bo.fake@example.test", 7, "2026-08-30")],
            42,
        );

        expect(result.totalCount).toBe(42);
        expect(result.edges[0]).toMatchObject({
            reviewsCount: 7,
            day: "2026-08-30",
            repoId: "repo-1",
        });
    });
});
