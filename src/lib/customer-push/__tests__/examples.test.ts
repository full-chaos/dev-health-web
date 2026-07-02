import { describe, expect, it } from "vitest";
import { buildExampleSnippets } from "../examples";

describe("buildExampleSnippets", () => {
    const base = { sourceSystem: "github" as const, sourceInstance: "meridian/api" };

    it("returns exactly 5 tabs in the documented order", () => {
        const tabs = buildExampleSnippets(base);
        expect(tabs.map((t) => t.id)).toEqual([
            "github-actions",
            "gitlab-runner",
            "docker",
            "curl",
            "webhook-relay",
        ]);
    });

    it("marks only the webhook relay tab as Experimental", () => {
        const tabs = buildExampleSnippets(base);
        expect(tabs.find((t) => t.id === "webhook-relay")?.badge).toBe("Experimental");
        expect(tabs.filter((t) => t.badge).length).toBe(1);
    });

    it("the cURL tab uses the real external-ingest data-plane path", () => {
        const tabs = buildExampleSnippets(base);
        const curl = tabs.find((t) => t.id === "curl");
        expect(curl?.code).toContain("/api/v1/external-ingest/batches");
    });

    it("uses --repo for github and --project for gitlab in the export command", () => {
        const githubTabs = buildExampleSnippets({ ...base, sourceSystem: "github" });
        const gitlabTabs = buildExampleSnippets({ ...base, sourceSystem: "gitlab" });
        expect(githubTabs.find((t) => t.id === "github-actions")?.code).toContain(
            '--repo "$GITHUB_REPOSITORY"',
        );
        expect(gitlabTabs.find((t) => t.id === "gitlab-runner")?.code).toContain(
            '--project "$CI_PROJECT_PATH"',
        );
    });

    it("substitutes a custom apiUrl when provided", () => {
        const tabs = buildExampleSnippets({ ...base, apiUrl: "https://api.example.com" });
        const curl = tabs.find((t) => t.id === "curl");
        expect(curl?.code).toContain("https://api.example.com/api/v1/external-ingest/batches");
    });
});
