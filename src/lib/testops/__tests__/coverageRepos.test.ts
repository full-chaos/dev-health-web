import { describe, expect, it } from "vitest";

import { BRANCH_BREAKDOWN_TOP_N, buildRepositoryCoverage } from "../coverageRepos";

const UUID = "0f2b9c1e-1111-4222-8333-944455556666";

const line = (items: Array<{ key: string; value: number | null; label?: string }>) => ({
    dimension: "REPO",
    measure: "COVERAGE_LINE_PCT",
    items,
});
const branch = (items: Array<{ key: string; value: number | null; label?: string }>) => ({
    dimension: "REPO",
    measure: "COVERAGE_BRANCH_PCT",
    items,
});

// CHAOS-8112: branch coverage by repository is served as a second breakdown. The rows stay the
// line-coverage rows, in the served order; the branch value is joined by the repository key.
describe("buildRepositoryCoverage", () => {
    it("joins the branch value by repository key, not by position", () => {
        const rows = buildRepositoryCoverage(
            line([
                { key: "repo-1", label: "dev-health-web", value: 60 },
                { key: "repo-2", label: "dev-health-ops", value: 72.4 },
            ]),
            // The branch answer is ordered by its own measure.
            branch([
                { key: "repo-2", value: 41 },
                { key: "repo-1", value: 54 },
            ]),
        );
        expect(rows.map((row) => [row.id, row.lineCoverage, row.branchCoverage])).toEqual([
            ["repo-1", 60, 54],
            ["repo-2", 72.4, 41],
        ]);
    });

    it("keeps a served null branch value as null (not reported), never 0", () => {
        const [row] = buildRepositoryCoverage(
            line([{ key: "repo-1", value: 60 }]),
            branch([{ key: "repo-1", value: null }]),
        );
        expect(row.branchCoverage).toBeNull();
    });

    it("gives null for a repository that the branch answer does not list", () => {
        const [row] = buildRepositoryCoverage(
            line([{ key: "repo-1", value: 60 }]),
            branch([{ key: "other", value: 99 }]),
        );
        expect(row.branchCoverage).toBeNull();
    });

    it("gives null for every repository when no branch breakdown is served", () => {
        const rows = buildRepositoryCoverage(
            line([
                { key: "repo-1", value: 60 },
                { key: "repo-2", value: 72.4 },
            ]),
        );
        expect(rows.map((row) => row.branchCoverage)).toEqual([null, null]);
    });

    it("keeps a served 0 as 0 on both values", () => {
        const [row] = buildRepositoryCoverage(
            line([{ key: "repo-1", value: 0 }]),
            branch([{ key: "repo-1", value: 0 }]),
        );
        expect([row.lineCoverage, row.branchCoverage]).toEqual([0, 0]);
    });

    it("keeps a served null line value as null, never 0", () => {
        const [row] = buildRepositoryCoverage(line([{ key: "repo-1", value: null }]));
        expect(row.lineCoverage).toBeNull();
    });

    it("adds no row for a repository that only the branch answer lists", () => {
        const rows = buildRepositoryCoverage(
            line([{ key: "repo-1", value: 60 }]),
            branch([
                { key: "repo-1", value: 54 },
                { key: "branch-only", value: 80 },
            ]),
        );
        expect(rows.map((row) => row.id)).toEqual(["repo-1"]);
    });

    it("names a repository by the served label, and never shows a bare id", () => {
        const rows = buildRepositoryCoverage(
            line([
                { key: "repo-1", label: "dev-health-web", value: 60 },
                { key: UUID, value: 72.4 },
            ]),
        );
        expect(rows[0].name).toBe("dev-health-web");
        expect(rows[1].name).not.toContain(UUID);
        expect(rows[1].title).toBe(UUID);
    });

    // The branch answer is asked with the largest topN the API accepts. A list shorter than that is
    // complete: a repository it does not list has no branch figure. A list of exactly that length
    // was cut: a repository it does not list can have a figure that the cut removed.
    it("marks a repository as outside the list, not as not reported, when the branch answer was cut", () => {
        const cut = branch(
            Array.from({ length: BRANCH_BREAKDOWN_TOP_N }, (_, i) => ({
                key: `other-${i}`,
                value: 50,
            })),
        );
        const [row] = buildRepositoryCoverage(line([{ key: "repo-1", value: 60 }]), cut);
        expect(row.branchCoverage).toBeNull();
        expect(row.branchOutsideList).toBe(true);
    });

    it("keeps a served value from a cut branch answer", () => {
        const cut = branch([
            { key: "repo-1", value: 54 },
            ...Array.from({ length: BRANCH_BREAKDOWN_TOP_N - 1 }, (_, i) => ({
                key: `other-${i}`,
                value: 50,
            })),
        ]);
        const [row] = buildRepositoryCoverage(line([{ key: "repo-1", value: 60 }]), cut);
        expect([row.branchCoverage, row.branchOutsideList]).toEqual([54, false]);
    });

    it("keeps a served null from a cut branch answer as not reported (the repository is in the list)", () => {
        const cut = branch([
            { key: "repo-1", value: null },
            ...Array.from({ length: BRANCH_BREAKDOWN_TOP_N - 1 }, (_, i) => ({
                key: `other-${i}`,
                value: 50,
            })),
        ]);
        const [row] = buildRepositoryCoverage(line([{ key: "repo-1", value: 60 }]), cut);
        expect([row.branchCoverage, row.branchOutsideList]).toEqual([null, false]);
    });

    it("reads a missing repository as not reported when the branch answer is complete (one item under the cap)", () => {
        const complete = branch(
            Array.from({ length: BRANCH_BREAKDOWN_TOP_N - 1 }, (_, i) => ({
                key: `other-${i}`,
                value: 50,
            })),
        );
        const [row] = buildRepositoryCoverage(line([{ key: "repo-1", value: 60 }]), complete);
        expect([row.branchCoverage, row.branchOutsideList]).toEqual([null, false]);
    });

    it("asks for the largest topN the API accepts (ops maxTopN)", () => {
        expect(BRANCH_BREAKDOWN_TOP_N).toBe(100);
    });

    it("gives no rows when the line breakdown is missing", () => {
        expect(buildRepositoryCoverage(undefined, branch([{ key: "repo-1", value: 54 }]))).toEqual(
            [],
        );
    });
});
