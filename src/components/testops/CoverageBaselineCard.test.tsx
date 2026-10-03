import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@/test/utils";

import { CoverageBaselineCard } from "./CoverageBaselineCard";

afterEach(cleanup);

const repo = (lineCoverage: number | null, branchCoverage: number | null = null) => ({
    id: "repo-1",
    name: "dev-health-web",
    title: "full-chaos/dev-health-web",
    lineCoverage,
    branchCoverage,
});

const rowsOf = (block: HTMLElement) => within(block).getAllByTestId("meter-row");
const fillOf = (row: HTMLElement) =>
    (within(row).queryByTestId("meter-fill") as HTMLElement | null)?.style.width ?? null;

describe("CoverageBaselineCard on the shared meter rows", () => {
    it("draws Line coverage as a meter row against 100 with the served value", () => {
        render(<CoverageBaselineCard repositories={[repo(60)]} baselinePct={80} />);
        const block = screen.getByTestId("testops-coverage-meters");
        expect(block).toHaveAttribute("aria-label", "dev-health-web coverage");
        const [line] = rowsOf(block);
        expect(line).toHaveTextContent("Line coverage60%");
        expect(fillOf(line)).toBe("60%");
    });

    it("draws the served Branch coverage of the repository as a meter row against 100", () => {
        render(<CoverageBaselineCard repositories={[repo(60, 54)]} baselinePct={80} />);
        const [, branch] = rowsOf(screen.getByTestId("testops-coverage-meters"));
        expect(branch).toHaveTextContent("Branch coverage54%");
        expect(branch).toHaveAttribute("data-reported", "true");
        expect(fillOf(branch)).toBe("54%");
    });

    it("draws a served Branch coverage of 0 as '0%', not as 'Not reported'", () => {
        render(<CoverageBaselineCard repositories={[repo(60, 0)]} baselinePct={80} />);
        const [, branch] = rowsOf(screen.getByTestId("testops-coverage-meters"));
        expect(branch).toHaveTextContent("Branch coverage0%");
        expect(branch).toHaveAttribute("data-reported", "true");
    });

    it("reads a Line coverage that is not served as 'Not reported'", () => {
        render(<CoverageBaselineCard repositories={[repo(null, 54)]} baselinePct={80} />);
        const [line] = rowsOf(screen.getByTestId("testops-coverage-meters"));
        expect(line).toHaveTextContent("Line coverageNot reported");
        expect(line).toHaveAttribute("data-reported", "false");
    });

    it("says that only the per-repository baseline is not reported", () => {
        render(<CoverageBaselineCard repositories={[repo(60, 54)]} baselinePct={80} />);
        const card = screen.getByTestId("testops-coverage-baseline");
        expect(card).toHaveTextContent("A per-repository baseline is not reported yet.");
        expect(card).not.toHaveTextContent(/Branch coverage and/);
    });

    it("reads a Branch coverage that is not served as 'Not reported' with an empty track", () => {
        render(<CoverageBaselineCard repositories={[repo(60)]} baselinePct={80} />);
        const [, branch] = rowsOf(screen.getByTestId("testops-coverage-meters"));
        expect(branch).toHaveTextContent("Branch coverageNot reported");
        expect(branch).toHaveAttribute("data-reported", "false");
        expect(fillOf(branch)).toBeNull();
    });

    it("draws a served 0 as an empty track and '0%', not as 'Not reported'", () => {
        render(<CoverageBaselineCard repositories={[repo(0)]} baselinePct={80} />);
        const [line] = rowsOf(screen.getByTestId("testops-coverage-meters"));
        expect(line).toHaveTextContent("Line coverage0%");
        expect(line).toHaveAttribute("data-reported", "true");
        expect(fillOf(line)).toBeNull();
    });
});
