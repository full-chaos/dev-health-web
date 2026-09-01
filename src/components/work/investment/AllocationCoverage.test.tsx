/**
 * AllocationCoverage reducer tests (CHAOS-4756).
 *
 * The "Unassigned ownership" tile read a hardcoded 0% while the Allocation
 * Sankey on the same page showed ~71% of effort flowing through
 * `TEAM:unassigned`. Two compounding defects in `readCoverage`:
 *
 *   1. It summed only links whose TARGET was an unassigned node. The
 *      primary flow is `TEAM -> THEME -> REPO`, where an unassigned TEAM
 *      node is only ever a link SOURCE (first hop) -- so the sum was
 *      structurally always 0, no matter how much flow passed through it.
 *   2. `totalValue > 0 ? unassignedValue / totalValue : ...` made that
 *      spurious 0 a real number, not `null` -- so the `?? ` fallback to the
 *      secondary (repo -> team) flow never engaged.
 *
 * These tests exercise the reducer directly with fixtures shaped like the
 * real Allocation payload (measured evidence: unassigned 199.276 /
 * Fullchaos 80.275 / Operations 1.104 of 280.655 total team throughput =
 * ~71%), and assert the tile and the Sankey computation AGREE rather than
 * pinning a magic constant.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";
import { AllocationCoverage, readCoverage } from "./AllocationCoverage";
import type { SankeyResponse } from "@/lib/types";

// Real measured shape (CHAOS-4756 evidence, org 70d529e0, 2026-08-18..09-01):
// TEAM throughput unassigned=199.276, Fullchaos=80.275, Operations=1.104.
const UNASSIGNED = 199.276;
const FULLCHAOS = 80.275;
const OPERATIONS = 1.104;
const TEAM_TOTAL = UNASSIGNED + FULLCHAOS + OPERATIONS;

/** Primary flow: TEAM -> THEME -> REPO. Unassigned TEAM is only ever a link SOURCE. */
const primaryFlow: SankeyResponse = {
    mode: "investment",
    nodes: [
        { name: "Unassigned", group: "team" },
        { name: "Fullchaos", group: "team" },
        { name: "Operations", group: "team" },
        { name: "Feature Delivery", group: "category" },
        { name: "Maintenance", group: "category" },
        { name: "repo-a", group: "repo" },
        { name: "repo-b", group: "repo" },
    ],
    links: [
        // hop 1: TEAM -> THEME
        { source: "Unassigned", target: "Feature Delivery", value: UNASSIGNED },
        { source: "Fullchaos", target: "Feature Delivery", value: FULLCHAOS },
        { source: "Operations", target: "Maintenance", value: OPERATIONS },
        // hop 2: THEME -> REPO (conserves each theme's inbound total)
        { source: "Feature Delivery", target: "repo-a", value: UNASSIGNED + FULLCHAOS },
        { source: "Maintenance", target: "repo-b", value: OPERATIONS },
    ],
};

/** Secondary flow: REPO -> TEAM. Unassigned TEAM is a link TARGET here. */
const secondaryFlow: SankeyResponse = {
    mode: "investment",
    nodes: [
        { name: "repo-a", group: "repo" },
        { name: "repo-b", group: "repo" },
        { name: "Unassigned", group: "team" },
        { name: "Fullchaos", group: "team" },
        { name: "Operations", group: "team" },
    ],
    links: [
        { source: "repo-a", target: "Unassigned", value: 150 },
        { source: "repo-b", target: "Unassigned", value: UNASSIGNED - 150 },
        { source: "repo-a", target: "Fullchaos", value: FULLCHAOS },
        { source: "repo-b", target: "Operations", value: OPERATIONS },
    ],
};

describe("readCoverage — unassignedShare", () => {
    it("[RED on fcc3c1db] counts throughput on the hop the node appears on, not just inbound links", () => {
        const { unassignedShare } = readCoverage(primaryFlow);

        // Prior behavior: unassignedValue only summed links TARGETING an
        // unassigned node. Unassigned is a SOURCE-only node here, so the
        // old reducer returned exactly 0 (a real number, not null).
        expect(unassignedShare).not.toBe(0);
        expect(unassignedShare).not.toBeNull();
        expect(unassignedShare).toBeCloseTo(UNASSIGNED / TEAM_TOTAL, 4);
    });

    it("agrees with the secondary (repo -> team) flow's computation of the same underlying share", () => {
        const primary = readCoverage(primaryFlow);
        const secondary = readCoverage(secondaryFlow);

        expect(primary.unassignedShare).not.toBeNull();
        expect(secondary.unassignedShare).not.toBeNull();
        // The contradiction (CHAOS-4716) was the tile and the Sankey
        // disagreeing on the same page load. Assert agreement, not a
        // constant: both flows describe the same assignment, so both
        // readings must land on the same share.
        expect(primary.unassignedShare).toBeCloseTo(secondary.unassignedShare as number, 4);
    });

    it("returns null (not 0) when no unassigned node exists — cannot express a share", () => {
        const flow: SankeyResponse = {
            mode: "investment",
            nodes: [
                { name: "Fullchaos", group: "team" },
                { name: "Feature Delivery", group: "category" },
            ],
            links: [{ source: "Fullchaos", target: "Feature Delivery", value: 10 }],
        };

        expect(readCoverage(flow).unassignedShare).toBeNull();
    });

    it("returns a real 0 when an unassigned node exists but genuinely carries zero flow", () => {
        const flow: SankeyResponse = {
            mode: "investment",
            nodes: [
                { name: "Unassigned", group: "team" },
                { name: "Fullchaos", group: "team" },
                { name: "Feature Delivery", group: "category" },
            ],
            links: [{ source: "Fullchaos", target: "Feature Delivery", value: 10 }],
        };

        expect(readCoverage(flow).unassignedShare).toBe(0);
    });

    it("does not fall through to the ?? fallback when the primary flow legitimately reads 0", () => {
        const zeroUnassignedPrimary: SankeyResponse = {
            mode: "investment",
            nodes: [
                { name: "Unassigned", group: "team" },
                { name: "Fullchaos", group: "team" },
                { name: "Feature Delivery", group: "category" },
            ],
            links: [{ source: "Fullchaos", target: "Feature Delivery", value: 10 }],
        };

        render(
            <AllocationCoverage
                teamCategoryFlow={zeroUnassignedPrimary}
                repoTeamFlow={secondaryFlow}
                isLoading={false}
            />,
        );

        expect(screen.getByText("0%")).toBeInTheDocument();
    });
});

describe("AllocationCoverage — unassigned ownership tile", () => {
    it("renders the true unassigned share (~71%) instead of a stuck 0%", () => {
        render(
            <AllocationCoverage
                teamCategoryFlow={primaryFlow}
                repoTeamFlow={secondaryFlow}
                isLoading={false}
            />,
        );

        const expectedPct = Math.round((UNASSIGNED / TEAM_TOTAL) * 100);
        expect(screen.getByText(`${expectedPct}%`)).toBeInTheDocument();
        expect(screen.queryByText("0%")).not.toBeInTheDocument();
    });
});
