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

    describe("github: token OR a complete GitHub App triple satisfies the gate", () => {
        it("is true for a bare personal access token", () => {
            expect(hasPrimaryCredentialField("github", { token: "ghp_abc" })).toBe(true);
        });

        it("is true for a complete manual GitHub App triple with no token", () => {
            expect(
                hasPrimaryCredentialField("github", {
                    appId: "123456",
                    installationId: "987654",
                    privateKey: "-----BEGIN PRIVATE KEY-----",
                }),
            ).toBe(true);
        });

        it("is false when the GitHub App triple is only partially filled in", () => {
            expect(
                hasPrimaryCredentialField("github", {
                    appId: "123456",
                    installationId: "987654",
                    // privateKey missing
                }),
            ).toBe(false);
            expect(
                hasPrimaryCredentialField("github", {
                    appId: "123456",
                    // installationId and privateKey missing
                }),
            ).toBe(false);
        });

        it("is false when neither the token nor the triple is filled in", () => {
            expect(hasPrimaryCredentialField("github", { org: "my-org" })).toBe(false);
        });

        it("treats whitespace-only triple fields as blank", () => {
            expect(
                hasPrimaryCredentialField("github", {
                    appId: "   ",
                    installationId: "987654",
                    privateKey: "-----BEGIN PRIVATE KEY-----",
                }),
            ).toBe(false);
        });
    });
});
