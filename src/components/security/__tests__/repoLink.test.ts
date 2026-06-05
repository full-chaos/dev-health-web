import { describe, expect, it } from "vitest";
import { buildRepoHref } from "../repoLink";

describe("buildRepoHref", () => {
    it("returns base path when f is absent", () => {
        expect(buildRepoHref("my-repo")).toBe("/security/repos/my-repo");
    });

    it("returns base path when f is undefined", () => {
        expect(buildRepoHref("my-repo", undefined)).toBe("/security/repos/my-repo");
    });

    it("appends ?f= when f is provided", () => {
        expect(buildRepoHref("my-repo", "abc123")).toBe("/security/repos/my-repo?f=abc123");
    });

    it("URL-encodes special characters in repoId", () => {
        expect(buildRepoHref("org/repo-name", "xyz")).toBe("/security/repos/org%2Frepo-name?f=xyz");
    });

    it("URL-encodes repoId even without f param", () => {
        expect(buildRepoHref("org/repo-name")).toBe("/security/repos/org%2Frepo-name");
    });
});
