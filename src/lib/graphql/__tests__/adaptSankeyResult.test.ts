import { describe, expect, it } from "vitest";
import type { SankeyResult } from "../types";
import { adaptSankeyResult } from "../investmentFetchers";

const minimalSankey = (overrides: Partial<SankeyResult> = {}): SankeyResult => ({
    nodes: [],
    edges: [],
    ...overrides,
});

describe("adaptSankeyResult", () => {
    it("maps coverage.teamCoverage and coverage.repoCoverage into result.coverage.team/repo", () => {
        const input = minimalSankey({
            coverage: { teamCoverage: 0.85, repoCoverage: 0.72 },
        });

        const result = adaptSankeyResult(input, "investment");

        expect(result.coverage).toEqual({ team: 0.85, repo: 0.72 });
    });

    it("omits result.coverage when backend returns no coverage object", () => {
        const input = minimalSankey(); // no coverage field

        const result = adaptSankeyResult(input, "investment");

        expect(result.coverage).toBeUndefined();
    });

    it("coerces coverage values to numbers", () => {
        const input = minimalSankey({
            // SankeyCoverage has `number` fields but testing numeric coercion guard
            coverage: { teamCoverage: 1, repoCoverage: 0 },
        });

        const result = adaptSankeyResult(input, "investment");

        expect(typeof result.coverage?.team).toBe("number");
        expect(typeof result.coverage?.repo).toBe("number");
        expect(result.coverage?.team).toBe(1);
        expect(result.coverage?.repo).toBe(0);
    });

    it("returns empty nodes/links and no coverage when called with undefined", () => {
        const result = adaptSankeyResult(undefined, "investment");

        expect(result.nodes).toEqual([]);
        expect(result.links).toEqual([]);
        expect(result.coverage).toBeUndefined();
    });

    it("preserves node group mapping alongside coverage", () => {
        const input = minimalSankey({
            nodes: [{ id: "t1", label: "Team Alpha", dimension: "TEAM", value: 10 }],
            edges: [],
            coverage: { teamCoverage: 0.9, repoCoverage: 0.6 },
        });

        const result = adaptSankeyResult(input, "investment");

        expect(result.nodes).toHaveLength(1);
        expect(result.nodes[0].group).toBe("team");
        expect(result.coverage).toEqual({ team: 0.9, repo: 0.6 });
    });
});
