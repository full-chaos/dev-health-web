import { describe, expect, it } from "vitest";
import {
    buildChangeSummary,
    getDatasetWarnings,
    getRepoScopeWarnings,
    type SyncFormSnapshot,
} from "./formDiff";

function snapshot(overrides: Partial<SyncFormSnapshot> = {}): SyncFormSnapshot {
    return {
        sync_targets: ["git"],
        is_active: true,
        schedule_cron: null,
        timezone: null,
        initial_sync_depth: 30,
        owner: "myorg",
        gitlab_url: "",
        auto_import_teams: false,
        repos: ["myorg/repo-a"],
        syncAllRepos: false,
        ...overrides,
    };
}

describe("getRepoScopeWarnings", () => {
    it("returns no warnings when scope is unchanged", () => {
        const baseline = snapshot();
        expect(getRepoScopeWarnings(baseline, baseline)).toEqual([]);
    });

    it("warns when a previously-synced repo is removed", () => {
        const baseline = snapshot({ repos: ["myorg/repo-a", "myorg/repo-b"] });
        const current = snapshot({ repos: ["myorg/repo-a"] });

        const warnings = getRepoScopeWarnings(baseline, current);

        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toMatch(/Removing 1 repository/);
        expect(warnings[0]).toContain("myorg/repo-b");
    });

    it("pluralizes when multiple repos are removed", () => {
        const baseline = snapshot({ repos: ["myorg/a", "myorg/b", "myorg/c"] });
        const current = snapshot({ repos: [] });

        expect(getRepoScopeWarnings(baseline, current)[0]).toMatch(/Removing 3 repositories/);
    });

    it("warns when sync-all-repos is turned off", () => {
        const baseline = snapshot({ syncAllRepos: true, repos: [] });
        const current = snapshot({ syncAllRepos: false, repos: [] });

        expect(getRepoScopeWarnings(baseline, current)[0]).toMatch(/sync all repositories/i);
    });

    it("does not warn when repos are only added", () => {
        const baseline = snapshot({ repos: ["myorg/repo-a"] });
        const current = snapshot({ repos: ["myorg/repo-a", "myorg/repo-b"] });

        expect(getRepoScopeWarnings(baseline, current)).toEqual([]);
    });
});

describe("getDatasetWarnings", () => {
    it("returns no warnings when datasets are unchanged or only added", () => {
        const baseline = snapshot({ sync_targets: ["git"] });
        const current = snapshot({ sync_targets: ["git", "prs"] });

        expect(getDatasetWarnings(baseline, current)).toEqual([]);
    });

    it("warns when a dataset is removed, resolving the human label", () => {
        const baseline = snapshot({ sync_targets: ["git", "prs"] });
        const current = snapshot({ sync_targets: ["git"] });

        const warnings = getDatasetWarnings(baseline, current);

        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("Pull Requests");
    });
});

describe("buildChangeSummary", () => {
    it("returns an empty summary when nothing changed", () => {
        const baseline = snapshot();
        expect(buildChangeSummary(baseline, baseline)).toEqual([]);
    });

    it("describes dataset additions and removals together", () => {
        const baseline = snapshot({ sync_targets: ["git", "prs"] });
        const current = snapshot({ sync_targets: ["git", "cicd"] });

        const summary = buildChangeSummary(baseline, current);

        expect(summary).toContainEqual(expect.stringContaining("+CI/CD Pipelines"));
        expect(summary).toContainEqual(expect.stringContaining("-Pull Requests"));
    });

    it("describes an initial depth change with both values", () => {
        const baseline = snapshot({ initial_sync_depth: 30 });
        const current = snapshot({ initial_sync_depth: 90 });

        expect(buildChangeSummary(baseline, current)).toContainEqual(
            expect.stringContaining("Initial depth: 30 days \u2192 90 days"),
        );
    });

    it("describes an owner change", () => {
        const baseline = snapshot({ owner: "oldorg" });
        const current = snapshot({ owner: "neworg" });

        expect(buildChangeSummary(baseline, current)).toContainEqual(
            expect.stringContaining("Owner: oldorg \u2192 neworg"),
        );
    });

    it("describes repo count deltas without syncAllRepos", () => {
        const baseline = snapshot({ repos: ["myorg/a"] });
        const current = snapshot({ repos: ["myorg/a", "myorg/b", "myorg/c"] });

        expect(buildChangeSummary(baseline, current)).toContainEqual(
            expect.stringContaining("Repositories: +2"),
        );
    });

    it("describes auto-import and active toggles", () => {
        const baseline = snapshot({ auto_import_teams: false, is_active: true });
        const current = snapshot({ auto_import_teams: true, is_active: false });

        const summary = buildChangeSummary(baseline, current);

        expect(summary).toContainEqual(expect.stringContaining("Auto-import teams: enabled"));
        expect(summary).toContainEqual(expect.stringContaining("Schedule: disabled"));
    });
});
