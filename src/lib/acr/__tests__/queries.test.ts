import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ACR_REPOSITORY_SCOPES_QUERY } from "../queries";

// sha256(TrimSpace(document)) of registeredAcrRepositoryScopesDocument in ops
// cmd/query-api/query_route.go. The ACR call is a raw fetch, not urql, so no
// exchange injects __typename: the constant itself must be the registered wire
// form or the ops dispatcher sees an unregistered document.
const REGISTERED_ACR_REPOSITORY_SCOPES_DIGEST =
    "1fe3d5c84c8c047b57cdaf71a71370583d615156e78dcb8991b8f954fae41773";

describe("ACR_REPOSITORY_SCOPES_QUERY", () => {
    it("digests to the document ops query-api registers", () => {
        const digest = createHash("sha256")
            .update(ACR_REPOSITORY_SCOPES_QUERY.trim())
            .digest("hex");
        expect(digest).toBe(REGISTERED_ACR_REPOSITORY_SCOPES_DIGEST);
    });
});
