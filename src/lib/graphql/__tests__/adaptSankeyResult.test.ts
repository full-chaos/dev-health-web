import { describe, expect, it, vi } from "vitest";

const { debug } = vi.hoisted(() => ({ debug: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { debug } }));

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

    // Missing is not zero: coverage the backend did not produce must never
    // become a number. A produced 0 stays 0.
    describe("coverage the backend did not produce", () => {
        const withCoverage = (coverage: unknown) =>
            minimalSankey({ coverage } as unknown as Partial<SankeyResult>);

        it("omits coverage when the wire carries coverage: null", () => {
            expect(adaptSankeyResult(withCoverage(null), "investment").coverage).toBeUndefined();
        });

        it("omits a leaf the wire carries as null instead of coercing it to 0", () => {
            const result = adaptSankeyResult(
                withCoverage({ teamCoverage: null, repoCoverage: 0.5 }),
                "investment",
            );
            expect(result.coverage?.team).toBeUndefined();
            expect(result.coverage?.repo).toBe(0.5);
        });

        it("omits a non-finite leaf instead of coercing it to 0", () => {
            const result = adaptSankeyResult(
                withCoverage({ teamCoverage: Number.NaN, repoCoverage: 0.5 }),
                "investment",
            );
            expect(result.coverage?.team).toBeUndefined();
            expect(result.coverage?.repo).toBe(0.5);
        });

        it("omits coverage when both leaves are missing", () => {
            const result = adaptSankeyResult(
                withCoverage({ teamCoverage: null, repoCoverage: null }),
                "investment",
            );
            expect(result.coverage).toBeUndefined();
        });

        it("keeps a produced 0 as 0 on both leaves", () => {
            const result = adaptSankeyResult(
                withCoverage({ teamCoverage: 0, repoCoverage: 0 }),
                "investment",
            );
            expect(result.coverage).toEqual({ team: 0, repo: 0 });
        });
    });

    // CHAOS-4241: the backend echoes the effective weighting unit back on
    // the flow response so the UI never has to guess/derive it from an
    // unrelated field. adaptSankeyResult must pass it through unchanged.
    describe("unit passthrough (CHAOS-4241)", () => {
        it("passes through unit: 'WORK_UNITS' from the backend", () => {
            const input = minimalSankey({ unit: "WORK_UNITS" });

            const result = adaptSankeyResult(input, "investment");

            expect(result.unit).toBe("WORK_UNITS");
        });

        it("never draws a flow served in another unit as work units: it is the empty flow, and the unit class is logged", () => {
            debug.mockClear();
            const input = minimalSankey({ unit: "HOURS" as never });

            const result = adaptSankeyResult(input, "investment");

            expect(result.nodes).toEqual([]);
            expect(result.links).toEqual([]);
            expect(result.unit).toBeUndefined();
            expect(debug).toHaveBeenCalledWith(
                expect.objectContaining({ unitClass: "HOURS" }),
                expect.stringContaining("not a work-unit count"),
            );
        });

        it("omits result.unit when the backend returns no unit field", () => {
            const input = minimalSankey(); // no unit field

            const result = adaptSankeyResult(input, "investment");

            expect(result.unit).toBeUndefined();
        });

        it("returns no unit when called with undefined", () => {
            const result = adaptSankeyResult(undefined, "investment");

            expect(result.unit).toBeUndefined();
        });
    });
});

describe("adaptSankeyResult issue size (CHAOS-9809)", () => {
    it("keeps a flow served in ISSUE_SIZE and maps its sizing coverage", () => {
        const result = adaptSankeyResult(
            minimalSankey({
                unit: "ISSUE_SIZE",
                coverage: {
                    teamCoverage: 0.9,
                    repoCoverage: 0.8,
                    sizingCoverage: 0.25,
                    unsizedUnitCount: 3,
                },
            }),
            "investment",
        );
        expect(result.unit).toBe("ISSUE_SIZE");
        expect(result.coverage).toEqual({ team: 0.9, repo: 0.8, sizing: 0.25, unsized_units: 3 });
    });

    it("leaves sizing absent when the backend served null (not measured)", () => {
        const result = adaptSankeyResult(
            minimalSankey({
                unit: "ISSUE_SIZE",
                coverage: {
                    teamCoverage: 0.9,
                    repoCoverage: 0.8,
                    sizingCoverage: null,
                    unsizedUnitCount: null,
                },
            }),
            "investment",
        );
        expect(result.coverage).toEqual({ team: 0.9, repo: 0.8 });
    });
});
