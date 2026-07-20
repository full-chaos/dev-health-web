import { describe, expect, it } from "vitest";

import { getAuthMethodLabel, hasGitHubAppCredential, isGitHubAppCredential } from "./authMethod";
import type { IntegrationCredential } from "@/lib/admin/types";

function makeCredential(overrides: Partial<IntegrationCredential> = {}): IntegrationCredential {
    return {
        id: "cred-1",
        provider: "github",
        name: "default",
        is_active: true,
        config: {},
        last_test_at: null,
        last_test_success: null,
        last_test_error: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        ...overrides,
    };
}

describe("isGitHubAppCredential", () => {
    it("is true for a github credential with config.auth_mode === github_app", () => {
        const credential = makeCredential({
            name: "github-app",
            config: { auth_mode: "github_app", installation_id: 42 },
        });

        expect(isGitHubAppCredential(credential)).toBe(true);
    });

    it("is false for a manual github token credential (no auth_mode)", () => {
        const credential = makeCredential({ name: "default", config: {} });

        expect(isGitHubAppCredential(credential)).toBe(false);
    });

    it("is false for a non-github provider even if config.auth_mode is set", () => {
        const credential = makeCredential({
            provider: "gitlab",
            config: { auth_mode: "github_app" },
        });

        expect(isGitHubAppCredential(credential)).toBe(false);
    });
});

describe("hasGitHubAppCredential", () => {
    it("is true when an active GitHub App credential exists", () => {
        const credentials = [
            makeCredential({ name: "github-app", config: { auth_mode: "github_app" } }),
        ];

        expect(hasGitHubAppCredential(credentials)).toBe(true);
    });

    it("is true when the GitHub App credential is INACTIVE — existence, not activity, gates the CTA", () => {
        const credentials = [
            makeCredential({
                name: "github-app",
                config: { auth_mode: "github_app" },
                is_active: false,
            }),
        ];

        expect(hasGitHubAppCredential(credentials)).toBe(true);
    });

    it("is false when only a manual token credential exists", () => {
        const credentials = [makeCredential({ name: "default", config: {} })];

        expect(hasGitHubAppCredential(credentials)).toBe(false);
    });

    it("is false for an empty credential list", () => {
        expect(hasGitHubAppCredential([])).toBe(false);
    });
});

describe("getAuthMethodLabel", () => {
    it('labels a GitHub App credential "GitHub App"', () => {
        const credential = makeCredential({
            name: "github-app",
            config: { auth_mode: "github_app" },
        });

        expect(getAuthMethodLabel("github", credential)).toBe("GitHub App");
    });

    it('labels a manual github credential "Personal access token"', () => {
        expect(getAuthMethodLabel("github", makeCredential())).toBe("Personal access token");
    });

    it('labels gitlab "Personal access token"', () => {
        expect(getAuthMethodLabel("gitlab", makeCredential({ provider: "gitlab" }))).toBe(
            "Personal access token",
        );
    });

    it('labels jira "API token"', () => {
        expect(getAuthMethodLabel("jira", makeCredential({ provider: "jira" }))).toBe("API token");
    });

    it('labels linear "API key"', () => {
        expect(getAuthMethodLabel("linear", makeCredential({ provider: "linear" }))).toBe(
            "API key",
        );
    });

    it('labels launchdarkly "Service token"', () => {
        expect(
            getAuthMethodLabel("launchdarkly", makeCredential({ provider: "launchdarkly" })),
        ).toBe("Service token");
    });

    it("derives PagerDuty auth labels from the persisted descriptor auth mode", () => {
        expect(
            getAuthMethodLabel(
                "pagerduty",
                makeCredential({ provider: "pagerduty", config: { auth_mode: "oauth" } }),
            ),
        ).toBe("OAuth");
        expect(
            getAuthMethodLabel(
                "pagerduty",
                makeCredential({
                    provider: "pagerduty",
                    config: { auth_mode: "client_credentials" },
                }),
            ),
        ).toBe("Client credentials");
        expect(
            getAuthMethodLabel(
                "pagerduty",
                makeCredential({ provider: "pagerduty", config: { auth_mode: "api_token" } }),
            ),
        ).toBe("API token");
    });

    it("uses an honest fallback when a PagerDuty auth mode was not persisted", () => {
        expect(getAuthMethodLabel("pagerduty", makeCredential({ provider: "pagerduty" }))).toBe(
            "Not recorded",
        );
    });
});
