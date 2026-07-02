import { describe, expect, it } from "vitest";
import { buildExampleSnippets } from "../examples";

describe("buildExampleSnippets", () => {
    const args = {
        sourceSystem: "github" as const,
        sourceInstance: "acme/api",
    };

    it("returns all 5 tabs in the documented order", () => {
        const tabs = buildExampleSnippets(args);
        expect(tabs.map((t) => t.id)).toEqual([
            "github-actions",
            "gitlab-runner",
            "docker",
            "curl",
            "webhook-relay",
        ]);
    });

    it("the cURL tab contains the real external-ingest batches path — regression guard against pointing at the admin proxy", () => {
        const tabs = buildExampleSnippets(args);
        const curl = tabs.find((t) => t.id === "curl");
        expect(curl?.code).toContain("/api/v1/external-ingest/batches");
        expect(curl?.code).not.toContain("/api/v1/admin/customer-push");
    });

    it("marks only the webhook relay tab Experimental", () => {
        const tabs = buildExampleSnippets(args);
        const badges = Object.fromEntries(tabs.map((t) => [t.id, t.badge]));
        expect(badges["webhook-relay"]).toBe("Experimental");
        expect(badges["github-actions"]).toBeUndefined();
        expect(badges["curl"]).toBeUndefined();
    });

    it("interpolates the source system and instance into every snippet", () => {
        const tabs = buildExampleSnippets({ sourceSystem: "gitlab", sourceInstance: "group/proj" });
        for (const tab of tabs) {
            expect(tab.code).toContain("gitlab");
        }
    });

    it("uses --repo for github and --project for gitlab in the export command", () => {
        const githubTabs = buildExampleSnippets({ sourceSystem: "github", sourceInstance: "a/b" });
        const gitlabTabs = buildExampleSnippets({ sourceSystem: "gitlab", sourceInstance: "a/b" });
        expect(githubTabs.find((t) => t.id === "github-actions")?.code).toContain(
            '--repo "$GITHUB_REPOSITORY"',
        );
        expect(gitlabTabs.find((t) => t.id === "gitlab-runner")?.code).toContain(
            '--project "$CI_PROJECT_PATH"',
        );
    });
});
