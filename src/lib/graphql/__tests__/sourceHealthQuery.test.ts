import { describe, expect, it } from "vitest";

import { sha256Trim, wireForm } from "../../../../scripts/graphql-wire-parity";
import { SOURCE_HEALTH_QUERY } from "../queries";

// CHAOS-8906: the text is matched by digest against the ops-registered document, so it is pinned.
describe("SOURCE_HEALTH_QUERY", () => {
    it("selects only provider, scope, lastSyncAt and lastFailure", () => {
        const compact = SOURCE_HEALTH_QUERY.replace(/\s+/g, " ");
        expect(compact).toContain(
            "sourceHealth(orgId: $orgId) { provider scope lastSyncAt lastFailure { occurredAt stage } }",
        );
    });

    it("has the wire digest the ops registry holds", () => {
        expect(sha256Trim(wireForm(SOURCE_HEALTH_QUERY))).toBe(
            "f9196883f03de7e9689294590f40c0216374a8301ed8712830ec4b9836034fc0",
        );
    });
});
