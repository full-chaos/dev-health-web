import { buildSchema, parse, validate } from "graphql";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { REVIEW_EDGES_QUERY } from "../queries";

// CHAOS-8485: the Review Network asks for the served display name and the served key of each
// person. The text of this query is what query-api matches against its registered document (the
// paired ops change), so it is pinned.
describe("REVIEW_EDGES_QUERY", () => {
    const compact = REVIEW_EDGES_QUERY.replace(/\s+/g, " ");

    it("asks for the served key and the served display name of the reviewer and of the author", () => {
        expect(compact).toContain(
            "edges { reviewerKey authorKey reviewerName authorName reviewsCount day repoId } totalCount",
        );
    });

    // `reviewer` and `author` are the STORED identities and can be e-mail addresses (CHAOS-7973):
    // a view that may not show an address does not ask for them, so none comes to the web server.
    it("does not ask for the stored identities, which can be e-mail addresses", () => {
        const fields = compact.match(/[A-Za-z]+/g) ?? [];
        expect(fields).not.toContain("reviewer");
        expect(fields).not.toContain("author");
    });

    it("is a valid request against the schema copy", () => {
        const schema = buildSchema(
            readFileSync(path.join(process.cwd(), "src/lib/graphql/schema.graphql"), "utf8"),
        );
        expect(validate(schema, parse(REVIEW_EDGES_QUERY))).toEqual([]);
    });
});
