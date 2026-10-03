import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@/test/utils";

import { CoverageBaselineCard } from "./CoverageBaselineCard";

afterEach(cleanup);

const repo = (lineCoverage: number) => ({
    id: "repo-1",
    name: "dev-health-web",
    title: "full-chaos/dev-health-web",
    lineCoverage,
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

    it("reads Branch coverage, which is not served, as 'Not reported' with an empty track", () => {
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
