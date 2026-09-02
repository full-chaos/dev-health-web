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

    // CHAOS-4756 codex round 1 (P1, EXECUTED): a mid-path unassigned THEME
    // node alongside an unassigned TEAM node in the SAME primary flow used
    // to blend the two groups' hop totals into one denominator, producing
    // 0.5 instead of the true 60/100 = 0.6 team-unassigned share.
    it("scopes the share to TEAM throughput — a mid-path unassigned THEME does not blend in", () => {
        const flow: SankeyResponse = {
            mode: "investment",
            nodes: [
                { name: "Unassigned", group: "team" },
                { name: "Assigned Team", group: "team" },
                { name: "Assigned Theme", group: "category" },
                { name: "Unassigned Theme", group: "category" },
                { name: "repo-a", group: "repo" },
            ],
            links: [
                { source: "Unassigned", target: "Assigned Theme", value: 60 },
                { source: "Assigned Team", target: "Unassigned Theme", value: 40 },
                // Unassigned Theme is a genuine mid-path node: target of the
                // TEAM->THEME hop above, source of THEME->REPO here.
                { source: "Unassigned Theme", target: "repo-a", value: 40 },
            ],
        };

        expect(readCoverage(flow).unassignedShare).toBeCloseTo(0.6, 10);
    });

    // CHAOS-4756 codex round 2 (P1, EXECUTED): SankeyLink references nodes by
    // `name` alone (no id on the wire). When a mid-path unassigned THEME
    // node happens to share the EXACT SAME name string as the unassigned
    // TEAM node ("Unassigned"), name-only Set lookups can't tell them apart
    // -- a link sourced from the THEME node was wrongly counted as team
    // flow, inflating the share from the true 0.6 to 0.714.
    it("degrades to null (not a wrong number) when a TEAM name collides with a THEME name", () => {
        const collidingPrimary: SankeyResponse = {
            mode: "investment",
            nodes: [
                { name: "Unassigned", group: "team" }, // TEAM:unassigned
                { name: "Fullchaos", group: "team" },
                { name: "Assigned Theme", group: "category" },
                { name: "Unassigned", group: "category" }, // THEME:unassigned — SAME name string
                { name: "repo-a", group: "repo" },
            ],
            links: [
                { source: "Unassigned", target: "Assigned Theme", value: 60 }, // TEAM:unassigned's link
                { source: "Fullchaos", target: "Unassigned", value: 40 }, // -> THEME:unassigned (mid-path)
                { source: "Unassigned", target: "repo-a", value: 40 }, // THEME:unassigned's outbound
            ],
        };
        const correctSecondary: SankeyResponse = {
            mode: "investment",
            nodes: [
                { name: "repo-a", group: "repo" },
                { name: "repo-b", group: "repo" },
                { name: "Unassigned", group: "team" },
                { name: "Fullchaos", group: "team" },
            ],
            links: [
                { source: "repo-a", target: "Unassigned", value: 60 },
                { source: "repo-b", target: "Fullchaos", value: 40 },
            ],
        };

        // The colliding name makes the primary flow's own data structurally
        // ambiguous -- readCoverage must not guess a number from it.
        expect(readCoverage(collidingPrimary).unassignedShare).toBeNull();

        // The tile as a whole must still land on the true share (0.6) via
        // the ?? fallback to the unambiguous secondary flow, not the wrong
        // 0.714 the ambiguous primary would otherwise produce.
        render(
            <AllocationCoverage
                teamCategoryFlow={collidingPrimary}
                repoTeamFlow={correctSecondary}
                isLoading={false}
            />,
        );
        expect(screen.getByText("60%")).toBeInTheDocument();
        expect(screen.queryByText("71%")).not.toBeInTheDocument();
    });

    // CHAOS-4756 codex round 4 (P1, EXECUTED): the round-2 guard only
    // excluded a name shared across DIFFERENT groups. It missed the same
    // class of ambiguity within a SINGLE group: two distinct TEAM node
    // entries sharing the identical name "Unassigned" (e.g. two independent
    // "no team resolved" placeholder rows, or a real team literally named
    // that) collapsed into one Set entry and returned share=1 instead of
    // null -- neither of the colliding links can be attributed to either
    // node. The fix generalizes to "any node name occurring more than once
    // in flow.nodes is ambiguous," which subsumes round 2's cross-group case
    // too.
    it("degrades to null when two DISTINCT team node entries share one name (same group)", () => {
        const duplicateTeamName: SankeyResponse = {
            mode: "investment",
            nodes: [
                { name: "Unassigned", group: "team" }, // e.g. TEAM:missing
                { name: "Unassigned", group: "team" }, // e.g. TEAM:literal — same name, different node
                { name: "Delivery", group: "category" },
            ],
            links: [
                { source: "Unassigned", target: "Delivery", value: 60 },
                { source: "Unassigned", target: "Delivery", value: 40 },
            ],
        };

        expect(readCoverage(duplicateTeamName).unassignedShare).toBeNull();
    });

    // CHAOS-4756 codex round 5 (P1, EXECUTED): excluding only the ambiguous
    // name from consideration, while still measuring its unambiguous
    // siblings, lets the REMAINING names' total quietly stand in for the
    // true team total -- an unassigned team (60) plus two DIFFERENT team
    // nodes sharing the name "Fullchaos" (40, 20) excluded "Fullchaos" and
    // read 60/60 = 1.0 instead of failing the whole flow closed. A single
    // ambiguous team name must invalidate the entire flow's denominator, not
    // just its own node.
    it("degrades to null when ANY team name is duplicated, even an assigned one unrelated to the unassigned node", () => {
        const flow: SankeyResponse = {
            mode: "investment",
            nodes: [
                { name: "Unassigned", group: "team" },
                { name: "Fullchaos", group: "team" }, // first distinct node named "Fullchaos"
                { name: "Fullchaos", group: "team" }, // second distinct node, same name
                { name: "Some Theme", group: "category" },
            ],
            links: [
                { source: "Unassigned", target: "Some Theme", value: 60 },
                { source: "Fullchaos", target: "Some Theme", value: 40 },
                { source: "Fullchaos", target: "Some Theme", value: 20 },
            ],
        };

        expect(readCoverage(flow).unassignedShare).toBeNull();
    });

    // CHAOS-4756 codex round 3 (P1, EXECUTED): deciding source-vs-target ONCE
    // from the TEAM group's aggregate inbound/outbound totals, then applying
    // that choice to every node, breaks when a team node is itself mid-path
    // (both inbound AND outbound) -- an aggregate tie silently picked the
    // wrong side, reading 0.4 instead of the true 0.6.
    it("returns null when a TEAM node is itself mid-path (both inbound and outbound)", () => {
        const flow: SankeyResponse = {
            mode: "investment",
            nodes: [
                { name: "Unassigned", group: "team" },
                { name: "Inbound Only", group: "team" },
                { name: "Outbound Only", group: "team" },
                { name: "Some Theme", group: "category" },
            ],
            links: [
                // Unassigned is mid-path: both a target and a source.
                { source: "Some Theme", target: "Unassigned", value: 60 },
                { source: "Unassigned", target: "Some Theme", value: 40 },
                { source: "Some Theme", target: "Inbound Only", value: 40 },
                { source: "Outbound Only", target: "Some Theme", value: 60 },
            ],
        };

        expect(readCoverage(flow).unassignedShare).toBeNull();
    });

    it("returns null when only a non-TEAM node (e.g. an unassigned THEME) is unassigned", () => {
        const flow: SankeyResponse = {
            mode: "investment",
            nodes: [
                { name: "Fullchaos", group: "team" },
                { name: "Unassigned Theme", group: "category" },
            ],
            links: [{ source: "Fullchaos", target: "Unassigned Theme", value: 10 }],
        };

        expect(readCoverage(flow).unassignedShare).toBeNull();
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
