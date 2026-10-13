import { describe, expect, it } from "vitest";

import { ACR_SCOPE_LABELS, scopeLabel, UNKNOWN_SCOPE_LABEL } from "../scope-labels";

// Closed set acr sends on a device preview (`requested_scopes`) and an OAuth consent preview.
export const ISSUABLE_SCOPES = ["context:read", "evidence:read", "data:read"] as const;

describe("scope labels", () => {
    it("Given every issuable scope, then each has its own non-empty label", () => {
        for (const scope of ISSUABLE_SCOPES) {
            expect(ACR_SCOPE_LABELS[scope]).toBeTruthy();
            expect(scopeLabel(scope)).not.toBe(scope);
            expect(scopeLabel(scope)).not.toBe(UNKNOWN_SCOPE_LABEL);
        }
        expect(Object.keys(ACR_SCOPE_LABELS).sort()).toEqual([...ISSUABLE_SCOPES].sort());
    });

    it("Given an unknown scope, then the generic line is returned", () => {
        expect(scopeLabel("future:write")).toBe(UNKNOWN_SCOPE_LABEL);
        expect(scopeLabel("toString")).toBe(UNKNOWN_SCOPE_LABEL);
    });
});
