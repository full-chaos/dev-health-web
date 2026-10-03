import { describe, expect, it } from "vitest";

import { JobFailuresResultSchema, jobFailureCutNote, jobFailureRows } from "../jobFailures";

const group = (over: Record<string, unknown> = {}) => ({
    workflowName: "CI",
    jobName: "unit-tests",
    provider: "github",
    runs: 12,
    failedRuns: 3,
    failureRate: 0.25,
    ...over,
});

// CHAOS-8514: the API serves one group per (workflow, job, provider) with its runs, failed runs
// and failure rate (a share from 0 to 1). The web writes the served numbers; it computes none.
describe("jobFailureRows", () => {
    it("writes one meter row per served group, in the served order", () => {
        const rows = jobFailureRows([
            group(),
            group({
                workflowName: "Deploy",
                jobName: "smoke",
                runs: 4,
                failedRuns: 4,
                failureRate: 1,
            }),
        ]);
        expect(rows.map((row) => [row.label, row.value, row.display])).toEqual([
            ["unit-tests · CI", 0.25, "25% · 3 of 12 runs failed"],
            ["smoke · Deploy", 1, "100% · 4 of 4 runs failed"],
        ]);
    });

    it("writes the job name alone when no workflow name is served", () => {
        const [row] = jobFailureRows([group({ workflowName: null, provider: null })]);
        expect(row.label).toBe("unit-tests");
    });

    it("says 1 run, not 1 runs", () => {
        const [row] = jobFailureRows([group({ runs: 1, failedRuns: 1, failureRate: 1 })]);
        expect(row.display).toBe("100% · 1 of 1 run failed");
    });

    it("keeps a rate that is not served as not reported, and still shows the served counts", () => {
        const [row] = jobFailureRows([group({ failureRate: null })]);
        expect(row.value).toBeNull();
        expect(row.label).toBe("unit-tests · CI (3 of 12 runs failed)");
    });

    it("uses the served rate, never failedRuns / runs", () => {
        // A served rate that does not equal the ratio of the two counts stays as served.
        const [row] = jobFailureRows([group({ runs: 10, failedRuns: 5, failureRate: 0.4 })]);
        expect(row.value).toBe(0.4);
        expect(row.display).toBe("40% · 5 of 10 runs failed");
    });

    it("gives two groups with the same job name different keys", () => {
        const rows = jobFailureRows([
            group(),
            group({ workflowName: "Nightly" }),
            group({ provider: "gitlab" }),
        ]);
        expect(new Set(rows.map((row) => row.key)).size).toBe(3);
    });
});

describe("jobFailureCutNote", () => {
    it("says how many groups are shown of the served total when the list was cut", () => {
        expect(
            jobFailureCutNote({ groups: [group(), group()], totalCount: 31, truncated: true }),
        ).toBe("Showing 2 of 31 job groups, the ones with the most failed runs.");
    });

    it("says nothing when the list is complete", () => {
        expect(
            jobFailureCutNote({ groups: [group()], totalCount: 1, truncated: false }),
        ).toBeNull();
    });
});

describe("JobFailuresResultSchema", () => {
    it("accepts the served shape, with null workflow, provider and rate", () => {
        const parsed = JobFailuresResultSchema.safeParse({
            groups: [group({ workflowName: null, provider: null, failureRate: null })],
            totalCount: 1,
            truncated: false,
        });
        expect(parsed.success).toBe(true);
    });

    it.each([
        ["no groups list", { totalCount: 0, truncated: false }],
        [
            "a count that is text",
            { groups: [group({ runs: "12" })], totalCount: 1, truncated: false },
        ],
        ["no job name", { groups: [group({ jobName: null })], totalCount: 1, truncated: false }],
        ["no truncated flag", { groups: [], totalCount: 0 }],
    ])("refuses %s", (_name, value) => {
        expect(JobFailuresResultSchema.safeParse(value).success).toBe(false);
    });
});
