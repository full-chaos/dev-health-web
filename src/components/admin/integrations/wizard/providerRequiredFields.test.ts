import { describe, expect, it } from "vitest";

import { hasPrimaryCredentialField } from "./providerRequiredFields";

describe("hasPrimaryCredentialField", () => {
    it("is false when the primary field is missing", () => {
        expect(hasPrimaryCredentialField("github", {})).toBe(false);
    });

    it("is false when the primary field is blank/whitespace", () => {
        expect(hasPrimaryCredentialField("gitlab", { token: "   " })).toBe(false);
    });

    it("is true when the primary field has a value", () => {
        expect(hasPrimaryCredentialField("github", { token: "ghp_abc" })).toBe(true);
    });

    it("maps each provider to its own primary field name", () => {
        expect(hasPrimaryCredentialField("jira", { token: "x" })).toBe(true);
        expect(hasPrimaryCredentialField("linear", { apiKey: "x" })).toBe(true);
        expect(hasPrimaryCredentialField("launchdarkly", { api_key: "x" })).toBe(true);
    });
});
