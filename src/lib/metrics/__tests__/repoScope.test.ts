import { describe, expect, it } from "vitest";

import { defaultMetricFilter } from "@/lib/filters/defaults";
import type { MetricFilter } from "@/lib/filters/types";

import { REPO_UNSCOPED_METRICS, isRepoUnscopedMetric, withRepoScopeNote } from "../repoScope";

const withRepo: MetricFilter = {
    ...defaultMetricFilter,
    what: { repos: ["full-chaos/dev-health-web"] },
};

describe("isRepoUnscopedMetric", () => {
    it("pins the four metrics the ops Home reader does not scope by repository", () => {
        expect([...REPO_UNSCOPED_METRICS].sort()).toEqual([
            "blocked_work",
            "cycle_time",
            "throughput",
            "wip_saturation",
        ]);
    });

    it("is true for those metrics when a repository is selected", () => {
        for (const metric of REPO_UNSCOPED_METRICS) {
            expect(isRepoUnscopedMetric(metric, withRepo)).toBe(true);
        }
    });

    it("is true when the scope itself is a repository", () => {
        const scoped: MetricFilter = {
            ...defaultMetricFilter,
            scope: { level: "repo", ids: ["r1"] },
        };
        expect(isRepoUnscopedMetric("cycle_time", scoped)).toBe(true);
    });

    it("is false with no repository selected", () => {
        expect(isRepoUnscopedMetric("cycle_time", defaultMetricFilter)).toBe(false);
        expect(isRepoUnscopedMetric("cycle_time", { ...withRepo, what: { repos: [] } })).toBe(
            false,
        );
    });

    it("is false for repository-scoped metrics", () => {
        for (const metric of ["review_latency", "deploy_freq", "churn", "rework_ratio"]) {
            expect(isRepoUnscopedMetric(metric, withRepo)).toBe(false);
        }
    });
});

describe("isRepoUnscopedMetric with the served flag (CHAOS-9078)", () => {
    it("false: the note, whatever the metric key is", () => {
        expect(
            isRepoUnscopedMetric("review_latency", withRepo, { repo_filter_applied: false }),
        ).toBe(true);
    });

    it("true: no note, also for one of the four fallback keys", () => {
        expect(isRepoUnscopedMetric("cycle_time", withRepo, { repo_filter_applied: true })).toBe(
            false,
        );
    });

    it("null: no note, also for one of the four fallback keys", () => {
        expect(isRepoUnscopedMetric("cycle_time", withRepo, { repo_filter_applied: null })).toBe(
            false,
        );
    });

    it("undefined with a repository selected: the fallback set decides", () => {
        expect(isRepoUnscopedMetric("cycle_time", withRepo, {})).toBe(true);
        expect(isRepoUnscopedMetric("review_latency", withRepo, {})).toBe(false);
    });

    it("no row (Explore): the fallback set decides", () => {
        expect(isRepoUnscopedMetric("throughput", withRepo)).toBe(true);
        expect(isRepoUnscopedMetric("throughput", defaultMetricFilter)).toBe(false);
    });

    it("withRepoScopeNote follows the served flag", () => {
        expect(
            withRepoScopeNote("cap", "cycle_time", withRepo, { repo_filter_applied: true }),
        ).toBe("cap");
        expect(
            withRepoScopeNote("cap", "cycle_time", withRepo, { repo_filter_applied: false }),
        ).toBe("cap · Not filtered by repository");
    });
});
