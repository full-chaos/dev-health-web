import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@/test/utils";

import type { RepoCoverageBaseline } from "@/lib/testops/coverageBaselines";

import { CoverageBaselineCard } from "./CoverageBaselineCard";

afterEach(cleanup);

const repo = (
    lineCoverage: number | null,
    branchCoverage: number | null = null,
    branchOutsideList = false,
) => ({
    id: "repo-1",
    name: "dev-health-web",
    title: "full-chaos/dev-health-web",
    lineCoverage,
    branchCoverage,
    branchOutsideList,
});

const baseline = (over: Partial<RepoCoverageBaseline> = {}): RepoCoverageBaseline => ({
    repoId: "repo-1",
    repoName: "full-chaos/dev-health-web",
    lineBaselinePct: 58.2,
    lineDays: 22,
    branchBaselinePct: 51,
    branchDays: 20,
    ...over,
});

const rowsOf = (block: HTMLElement) => within(block).getAllByTestId("meter-row");
const fillOf = (row: HTMLElement) =>
    (within(row).queryByTestId("meter-fill") as HTMLElement | null)?.style.width ?? null;

describe("CoverageBaselineCard on the shared meter rows", () => {
    it("draws Line coverage as a meter row against 100 with the served value", () => {
        render(<CoverageBaselineCard repositories={[repo(60)]} baselines={[]} />);
        const block = screen.getByTestId("testops-coverage-meters");
        expect(block).toHaveAttribute("aria-label", "dev-health-web coverage");
        const [line] = rowsOf(block);
        expect(line).toHaveTextContent("Line coverage60% · baseline Not reported");
        expect(fillOf(line)).toBe("60%");
    });

    it("draws the served Branch coverage of the repository as a meter row against 100", () => {
        render(<CoverageBaselineCard repositories={[repo(60, 54)]} baselines={[]} />);
        const [, branch] = rowsOf(screen.getByTestId("testops-coverage-meters"));
        expect(branch).toHaveTextContent("Branch coverage54% · baseline Not reported");
        expect(branch).toHaveAttribute("data-reported", "true");
        expect(fillOf(branch)).toBe("54%");
    });

    it("draws a served Branch coverage of 0 as '0%', not as 'Not reported'", () => {
        render(<CoverageBaselineCard repositories={[repo(60, 0)]} baselines={[]} />);
        const [, branch] = rowsOf(screen.getByTestId("testops-coverage-meters"));
        expect(branch).toHaveTextContent("Branch coverage0% · baseline Not reported");
        expect(branch).toHaveAttribute("data-reported", "true");
    });

    it("reads a Line coverage that is not served as 'Not reported'", () => {
        render(<CoverageBaselineCard repositories={[repo(null, 54)]} baselines={[]} />);
        const [line] = rowsOf(screen.getByTestId("testops-coverage-meters"));
        expect(line).toHaveTextContent("Line coverageNot reported");
        expect(line).toHaveAttribute("data-reported", "false");
    });

    it("does not say 'Not reported' for a repository outside a cut branch answer: no branch row, and a note says why", () => {
        render(
            <CoverageBaselineCard repositories={[repo(60, null, true)]} baselines={[baseline()]} />,
        );
        const rows = rowsOf(screen.getByTestId("testops-coverage-meters"));
        expect(rows.map((row) => row.textContent)).toEqual(["Line coverage60% · baseline 58%"]);
        const block = screen.getByTestId("testops-coverage-baseline-repo");
        expect(block).not.toHaveTextContent("Not reported");
        expect(within(block).getByTestId("testops-coverage-branch-outside-list")).toHaveTextContent(
            "Branch coverage: this repository is outside the 100 repositories the branch answer lists.",
        );
    });

    it("shows no such note when the branch value is served or truly not reported", () => {
        render(
            <CoverageBaselineCard
                repositories={[repo(60, 54), { ...repo(60, null), id: "repo-2" }]}
                baselines={[]}
            />,
        );
        expect(screen.queryByTestId("testops-coverage-branch-outside-list")).toBeNull();
    });

    it("reads a Branch coverage that is not served as 'Not reported' with an empty track", () => {
        render(<CoverageBaselineCard repositories={[repo(60)]} baselines={[]} />);
        const [, branch] = rowsOf(screen.getByTestId("testops-coverage-meters"));
        expect(branch).toHaveTextContent("Branch coverageNot reported");
        expect(branch).toHaveAttribute("data-reported", "false");
        expect(fillOf(branch)).toBeNull();
    });

    it("draws a served 0 as an empty track and '0%', not as 'Not reported'", () => {
        render(<CoverageBaselineCard repositories={[repo(0)]} baselines={[]} />);
        const [line] = rowsOf(screen.getByTestId("testops-coverage-meters"));
        expect(line).toHaveTextContent("Line coverage0% · baseline Not reported");
        expect(line).toHaveAttribute("data-reported", "true");
        expect(fillOf(line)).toBeNull();
    });
});

// The baseline of a repository is served per repository: its own 30-day average.
describe("CoverageBaselineCard: the served baseline of each repository", () => {
    it("writes the served line and branch baseline beside the served value", () => {
        render(<CoverageBaselineCard repositories={[repo(60, 54)]} baselines={[baseline()]} />);
        const [line, branch] = rowsOf(screen.getByTestId("testops-coverage-meters"));
        expect(line).toHaveTextContent("Line coverage60% · baseline 58%");
        expect(branch).toHaveTextContent("Branch coverage54% · baseline 51%");
        // The fill is the served coverage, not the baseline.
        expect(fillOf(line)).toBe("60%");
        expect(fillOf(branch)).toBe("54%");
    });

    it("joins the baseline by repository id, not by order", () => {
        render(
            <CoverageBaselineCard
                repositories={[repo(60, 54)]}
                baselines={[baseline({ repoId: "repo-0", lineBaselinePct: 99 }), baseline()]}
            />,
        );
        const [line] = rowsOf(screen.getByTestId("testops-coverage-meters"));
        expect(line).toHaveTextContent("Line coverage60% · baseline 58%");
    });

    it("reads a null baseline as 'Not reported': never 0, never the current value", () => {
        render(
            <CoverageBaselineCard
                repositories={[repo(60, 54)]}
                baselines={[baseline({ lineBaselinePct: null, lineDays: 3 })]}
            />,
        );
        const [line, branch] = rowsOf(screen.getByTestId("testops-coverage-meters"));
        expect(line).toHaveTextContent("Line coverage60% · baseline Not reported");
        expect(branch).toHaveTextContent("Branch coverage54% · baseline 51%");
    });

    it("reads a repository with no baseline row as 'Not reported'", () => {
        render(
            <CoverageBaselineCard
                repositories={[repo(60, 54)]}
                baselines={[baseline({ repoId: "repo-2" })]}
            />,
        );
        const [line, branch] = rowsOf(screen.getByTestId("testops-coverage-meters"));
        expect(line).toHaveTextContent("Line coverage60% · baseline Not reported");
        expect(branch).toHaveTextContent("Branch coverage54% · baseline Not reported");
    });

    it("writes a served baseline of 0 as '0%'", () => {
        render(
            <CoverageBaselineCard
                repositories={[repo(60, 54)]}
                baselines={[baseline({ branchBaselinePct: 0 })]}
            />,
        );
        const [, branch] = rowsOf(screen.getByTestId("testops-coverage-meters"));
        expect(branch).toHaveTextContent("Branch coverage54% · baseline 0%");
    });

    it("says 'Could not be read' for the baseline when its read failed, and keeps the coverage values", () => {
        render(
            <CoverageBaselineCard
                repositories={[repo(60, 54)]}
                baselines={{ fetchFailed: true }}
            />,
        );
        const [line, branch] = rowsOf(screen.getByTestId("testops-coverage-meters"));
        expect(line).toHaveTextContent("Line coverage60% · baseline Could not be read");
        expect(branch).toHaveTextContent("Branch coverage54% · baseline Could not be read");
        expect(fillOf(line)).toBe("60%");
        expect(screen.getByTestId("testops-coverage-baseline")).not.toHaveTextContent(
            "baseline Not reported",
        );
    });

    it("keeps a served baseline when the coverage value is not served: it goes beside the row name", () => {
        render(<CoverageBaselineCard repositories={[repo(null, 54)]} baselines={[baseline()]} />);
        const [line] = rowsOf(screen.getByTestId("testops-coverage-meters"));
        expect(line).toHaveTextContent("Line coverage (baseline 58%)Not reported");
        expect(line).toHaveAttribute("data-reported", "false");
    });

    it("has no pill with one baseline for all repositories, and no 80% target", () => {
        render(<CoverageBaselineCard repositories={[repo(60, 54)]} baselines={[baseline()]} />);
        expect(screen.queryByTestId("testops-coverage-baseline-pill")).toBeNull();
        const card = screen.getByTestId("testops-coverage-baseline");
        expect(card).not.toHaveTextContent("80%");
        expect(card).not.toHaveTextContent("A per-repository baseline is not reported yet.");
    });

    it("says what the baseline is and when a repository has none", () => {
        render(<CoverageBaselineCard repositories={[repo(60, 54)]} baselines={[baseline()]} />);
        expect(screen.getByTestId("testops-coverage-baseline-note")).toHaveTextContent(
            "The baseline of a repository is its own average coverage over the 30 days that end on the last day of the window. A repository with fewer than 7 days of coverage in those 30 days has no baseline.",
        );
    });
});
