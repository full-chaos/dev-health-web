import { describe, expect, it } from "vitest";

import { defaultMetricFilter } from "@/lib/filters/defaults";
import type { MetricFilter } from "@/lib/filters/types";

import { REPO_UNSCOPED_METRICS, isRepoUnscopedMetric } from "../repoScope";

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
