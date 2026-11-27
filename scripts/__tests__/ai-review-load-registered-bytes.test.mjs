import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { wireForm } from "../graphql-wire-parity.ts";
import { AI_REVIEW_LOAD_QUERY } from "../../src/lib/graphql/queries";

// query-api serves a document only when sha256(TrimSpace(wire text)) is a registered digest.
// This is the digest of the AIReviewLoad document that selects `day` under `daily`.
const REGISTERED_AI_REVIEW_LOAD_DIGEST =
    "3c0b56d86d8d3fe263849885ef5a652aba7948e2fc5fb1bba22b6f9bc95eca41";

describe("AI_REVIEW_LOAD_QUERY wire bytes", () => {
    it("selects day under daily", () => {
        const daily = AI_REVIEW_LOAD_QUERY.split("daily {")[1]?.split("}")[0] ?? "";
        expect(daily).toMatch(/^\s*day\s*$/m);
    });

    it("sends exactly the registered AIReviewLoad document", () => {
        const digest = createHash("sha256")
            .update(wireForm(AI_REVIEW_LOAD_QUERY).trim())
            .digest("hex");
        expect(digest).toBe(REGISTERED_AI_REVIEW_LOAD_DIGEST);
    });
});
