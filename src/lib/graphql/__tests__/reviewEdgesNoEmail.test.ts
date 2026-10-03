import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * CHAOS-7973 (ruling 51) and CHAOS-8485: no e-mail address leaves the server on the Review
 * Network read.
 *
 * `reviewEdges` serves, for the reviewer and for the author, a display name (null when no name is
 * known) and an opaque key. The contract says that neither is an e-mail address. The fetcher is
 * the last server step before the rows go to the page, so it still checks: these tests go through
 * the fetcher itself (the real producer of the rows the page gets), with only the network call
 * replaced.
 */
const graphqlFetch = vi.hoisted(() => vi.fn());
vi.mock("../server", () => ({ graphqlFetch }));

import { REVIEW_EDGES_QUERY } from "../queries";
import { getReviewEdgesViaGraphQL } from "../reviewEdgesFetchers";

type Person = [key: string, name: string | null];
type Served = {
    reviewerKey: string;
    authorKey: string;
    reviewerName: string | null;
    authorName: string | null;
    reviewsCount: number;
    day: string;
    repoId: string | null;
};
const served = (
    [reviewerKey, reviewerName]: Person,
    [authorKey, authorName]: Person,
    reviewsCount = 1,
    day = "2026-09-01",
): Served => ({
    reviewerKey,
    authorKey,
    reviewerName,
    authorName,
    reviewsCount,
    day,
    repoId: "repo-1",
});

const ANA: Person = ["k-ana", "Ana Fake"];
const BO: Person = ["k-bo", "Bo Fake"];
const NO_NAME: Person = ["k-none", null];

async function read(edges: object[], totalCount = edges.length) {
    graphqlFetch.mockResolvedValue({ reviewEdges: { edges, totalCount } });
    return getReviewEdgesViaGraphQL({
        orgId: "org-1",
        sinceDate: "2026-06-01",
        untilDate: "2026-09-01",
    });
}

beforeEach(() => graphqlFetch.mockReset());

describe("getReviewEdgesViaGraphQL — the served names and keys", () => {
    it("asks with the request that selects the served names and keys", async () => {
        await read([served(ANA, BO)]);
        expect(graphqlFetch.mock.calls[0][0]).toBe(REVIEW_EDGES_QUERY);
    });

    it("gives the page the served display names", async () => {
        const { edges } = await read([served(ANA, BO, 6), served(BO, ANA, 2)]);
        expect(edges.map((edge) => [edge.reviewerName, edge.authorName])).toEqual([
            ["Ana Fake", "Bo Fake"],
            ["Bo Fake", "Ana Fake"],
        ]);
    });

    it("keeps a name that is not served as null: the page reads Not reported, it makes no name", async () => {
        const { edges } = await read([served(NO_NAME, ANA)]);
        expect(edges[0].reviewerName).toBeNull();
        expect(edges[0].authorName).toBe("Ana Fake");
    });

    it("tells people apart by the served key: one key per person, as reviewer and as author", async () => {
        const { edges } = await read([
            served(ANA, BO),
            served(BO, ANA),
            // two persons with the same display name are two persons
            served(["k-ana-2", "Ana Fake"], ANA, 3, "2026-09-02"),
        ]);

        const [first, second, third] = edges;
        expect(second.author).toBe(first.reviewer); // ana
        expect(second.reviewer).toBe(first.author); // bo
        expect(third.author).toBe(first.reviewer); // ana again, another day
        expect(third.reviewer).not.toBe(first.reviewer); // the other Ana Fake
        expect(new Set([first.reviewer, first.author, third.reviewer]).size).toBe(3);
    });

    it("gives the same key for the same served key in every answer", async () => {
        const one = await read([served(ANA, BO)]);
        const other = await read([served(NO_NAME, BO), served(BO, ANA)]);
        expect(other.edges[1].author).toBe(one.edges[0].reviewer); // ana
        expect(other.edges[0].author).toBe(one.edges[0].author); // bo
    });

    it("keeps the counts, the day, the repository and the total as served", async () => {
        const result = await read([served(ANA, BO, 7, "2026-08-30")], 42);

        expect(result.totalCount).toBe(42);
        expect(result.edges[0]).toMatchObject({
            reviewsCount: 7,
            day: "2026-08-30",
            repoId: "repo-1",
        });
    });
});

// The contract says a name and a key are never an e-mail address. The server step does not rely
// on it: an answer that breaks the contract still gives the page no address.
describe("getReviewEdgesViaGraphQL — no e-mail address leaves the server", () => {
    it("shows no name that is, or holds, an e-mail address", async () => {
        const result = await read([
            served(["k-1", "cy.fake@example.test"], ["k-2", "Ana Fake <ana.fake@example.test>"]),
        ]);

        const wire = JSON.stringify(result);
        expect(wire).not.toContain("@");
        for (const part of ["cy.fake", "ana.fake", "Ana Fake", "example.test"]) {
            expect(wire).not.toContain(part);
        }
        expect(result.edges[0].reviewerName).toBeNull();
        expect(result.edges[0].authorName).toBeNull();
    });

    it("replaces a key that holds an e-mail address: one opaque key per address, made from the order and not from the address", async () => {
        const one = await read([
            served(["ana.fake@example.test", "Ana Fake"], BO),
            served(BO, ["ana.fake@example.test", "Ana Fake"]),
            served(["cy.fake@example.test", null], BO),
        ]);
        const other = await read([
            served(["zed.fake@other.test", "Zed Fake"], BO),
            served(BO, ["zed.fake@other.test", "Zed Fake"]),
            served(["xu.fake@other.test", null], BO),
        ]);

        expect(JSON.stringify(one)).not.toContain("@");
        expect(JSON.stringify(one)).not.toContain("example.test");
        // the same person keeps one key as reviewer and as author; another address is another key
        expect(one.edges[1].author).toBe(one.edges[0].reviewer);
        expect(one.edges[2].reviewer).not.toBe(one.edges[0].reviewer);
        // the name of that person is still shown
        expect(one.edges[0].reviewerName).toBe("Ana Fake");
        const keys = (rows: typeof one.edges) => rows.map((edge) => [edge.reviewer, edge.author]);
        expect(keys(other.edges)).toEqual(keys(one.edges));
    });

    it("cannot mix a served key with the key of a person whose key was replaced", async () => {
        const first = await read([served(["ana.fake@example.test", null], BO)]);
        const opaqueKey = first.edges[0].reviewer;
        // A served key that spells the same text as that opaque key is still another person.
        const { edges } = await read([served(["ana.fake@example.test", null], [opaqueKey, "X"])]);
        expect(edges[0].author).not.toBe(edges[0].reviewer);
    });

    it("takes nothing but the selected fields: a stored identity in the answer does not reach the page", async () => {
        const result = await read([
            {
                ...served(ANA, BO),
                reviewer: "ana.fake@example.test",
                author: "bo.fake@example.test",
            },
        ]);
        expect(JSON.stringify(result)).not.toContain("@");
        expect(Object.keys(result.edges[0]).sort()).toEqual([
            "author",
            "authorName",
            "day",
            "repoId",
            "reviewer",
            "reviewerName",
            "reviewsCount",
        ]);
        expect(result.edges[0].reviewerName).toBe("Ana Fake");
    });

    // `reviewerKey` and `authorKey` are non-null in the schema. An answer with a row that has no
    // key is a broken answer: the read fails. The row is not dropped (the totals would be wrong
    // with no notice) and the people with no key are not made one person.
    it.each([
        ["absent", undefined],
        ["null", null],
        ["empty", ""],
        ["not a text", 7],
    ])("fails the read when a row has no person key (%s)", async (_name, badKey) => {
        for (const field of ["reviewerKey", "authorKey"] as const) {
            const row = { ...served(ANA, BO), [field]: badKey };
            await expect(read([served(BO, ANA), row]), field).rejects.toThrow(
                "reviewEdges: a row has no person key",
            );
        }
    });

    it('gives the stored placeholder "unknown" no name: it is not a person\'s name', async () => {
        const { edges } = await read([served(["k-unknown", "unknown"], ANA)]);
        expect(edges[0].reviewerName).toBeNull();
    });
});
