import { describe, expect, it } from "vitest";

import { adaptSankeyToChord, stripDimensionPrefix } from "../chordAdapter";
import { UNASSIGNED_REPO_LABEL, UNASSIGNED_TEAM_LABEL } from "@/lib/investment/transforms";

describe("stripDimensionPrefix", () => {
    it("removes the leading dimension prefix", () => {
        expect(stripDimensionPrefix("team:Engineering")).toBe("Engineering");
    });

    it("returns unprefixed values unchanged", () => {
        expect(stripDimensionPrefix("NoPrefix")).toBe("NoPrefix");
    });
});

describe("adaptSankeyToChord", () => {
    it("filters out mixed-dimension edges for the requested grouping", () => {
        const result = adaptSankeyToChord(
            {
                nodes: [
                    {
                        id: "team:Engineering",
                        label: "team:Engineering",
                        dimension: "TEAM",
                        value: 10,
                    },
                    { id: "team:Platform", label: "team:Platform", dimension: "TEAM", value: 7 },
                    { id: "repo:web", label: "repo:web", dimension: "REPO", value: 20 },
                ],
                edges: [
                    { source: "team:Engineering", target: "team:Platform", value: 3 },
                    { source: "team:Engineering", target: "repo:web", value: 8 },
                ],
            },
            "team",
        );

        expect(result).toEqual([
            {
                source: "team:Engineering",
                target: "team:Platform",
                sourceLabel: "Engineering",
                targetLabel: "Platform",
                value: 3,
                metadata: { team: "Engineering" },
            },
        ]);
    });

    it("preserves the original edge value", () => {
        const result = adaptSankeyToChord(
            {
                nodes: [
                    { id: "repo:api", label: "repo:api", dimension: "repo", value: 12 },
                    { id: "repo:web", label: "repo:web", dimension: "repo", value: 8 },
                ],
                edges: [{ source: "repo:api", target: "repo:web", value: 42 }],
            },
            "repo",
        );

        expect(result[0]?.value).toBe(42);
    });

    it("returns an empty array for empty input", () => {
        expect(adaptSankeyToChord({ nodes: [], edges: [] }, "work_type")).toEqual([]);
    });

    it("includes metadata under the grouping key", () => {
        const result = adaptSankeyToChord(
            {
                nodes: [
                    {
                        id: "work_type:Feature Delivery",
                        label: "work_type:Feature Delivery",
                        dimension: "WORK_TYPE",
                        value: 5,
                    },
                    {
                        id: "work_type:Risk / Security",
                        label: "work_type:Risk / Security",
                        dimension: "WORK_TYPE",
                        value: 4,
                    },
                ],
                edges: [
                    {
                        source: "work_type:Feature Delivery",
                        target: "work_type:Risk / Security",
                        value: 2,
                    },
                ],
            },
            "work_type",
        );

        expect(result[0]?.metadata).toEqual({ workType: "Feature Delivery" });
    });

    it("matches dimensions case-insensitively", () => {
        const result = adaptSankeyToChord(
            {
                nodes: [
                    {
                        id: "team:Engineering",
                        label: "team:Engineering",
                        dimension: "TEAM",
                        value: 5,
                    },
                    { id: "team:Platform", label: "team:Platform", dimension: "TEAM", value: 5 },
                ],
                edges: [{ source: "team:Engineering", target: "team:Platform", value: 1 }],
            },
            "team",
        );

        expect(result).toHaveLength(1);
    });
});

describe("adaptSankeyToChord empty keys", () => {
    const edgeBetween = (dimension: string, empty: string, other: string) => ({
        nodes: [
            { id: empty, label: empty, dimension, value: 5 },
            { id: other, label: other, dimension, value: 7 },
        ],
        edges: [{ source: other, target: empty, value: 4 }],
    });

    it("names the empty REPO key as the unassigned repo label", () => {
        const [row] = adaptSankeyToChord(edgeBetween("REPO", "REPO:", "REPO:web"), "repo");
        expect(row).toMatchObject({
            source: "REPO:web",
            target: "REPO:",
            sourceLabel: "web",
            targetLabel: UNASSIGNED_REPO_LABEL,
        });
    });

    it("names the empty REPO key when the node label is blank", () => {
        const input = edgeBetween("REPO", "REPO:", "REPO:web");
        input.nodes[0] = { id: "REPO:", label: "", dimension: "REPO", value: 5 };
        const [row] = adaptSankeyToChord(input, "repo");
        expect(row?.targetLabel).toBe(UNASSIGNED_REPO_LABEL);
    });

    it("names the empty TEAM key as the unassigned team label", () => {
        const [row] = adaptSankeyToChord(edgeBetween("TEAM", "TEAM:", "TEAM:core"), "team");
        expect(row?.targetLabel).toBe(UNASSIGNED_TEAM_LABEL);
    });

    it("puts the unassigned label in the metadata key of the source", () => {
        const [row] = adaptSankeyToChord(
            {
                nodes: [
                    { id: "REPO:", label: "REPO:", dimension: "REPO", value: 5 },
                    { id: "REPO:web", label: "REPO:web", dimension: "REPO", value: 7 },
                ],
                edges: [{ source: "REPO:", target: "REPO:web", value: 4 }],
            },
            "repo",
        );
        expect(row?.sourceLabel).toBe(UNASSIGNED_REPO_LABEL);
        expect(row?.metadata).toEqual({ repo: UNASSIGNED_REPO_LABEL });
    });
});

describe("adaptSankeyToChord identity", () => {
    it("keeps a real team named like the unassigned label distinct from the empty bucket", () => {
        const records = adaptSankeyToChord(
            {
                nodes: [
                    { id: "TEAM:", label: "TEAM:", dimension: "TEAM", value: 5 },
                    {
                        id: `TEAM:${UNASSIGNED_TEAM_LABEL}`,
                        label: `TEAM:${UNASSIGNED_TEAM_LABEL}`,
                        dimension: "TEAM",
                        value: 7,
                    },
                ],
                edges: [{ source: "TEAM:", target: `TEAM:${UNASSIGNED_TEAM_LABEL}`, value: 4 }],
            },
            "team",
        );
        expect(records).toHaveLength(1);
        expect(records[0]?.source).not.toBe(records[0]?.target);
        expect(records[0]?.sourceLabel).toBe(records[0]?.targetLabel);
    });

    it("keeps two real teams with the same name distinct", () => {
        const records = adaptSankeyToChord(
            {
                nodes: [
                    { id: "TEAM:t1", label: "Core", dimension: "TEAM", value: 5 },
                    { id: "TEAM:t2", label: "Core", dimension: "TEAM", value: 7 },
                ],
                edges: [{ source: "TEAM:t1", target: "TEAM:t2", value: 4 }],
            },
            "team",
        );
        expect(records.map((r) => [r.source, r.target])).toEqual([["TEAM:t1", "TEAM:t2"]]);
    });
});

describe("adaptSankeyToChord empty WORK_TYPE key", () => {
    const WORK_TYPE_LABEL = "Unassigned work type";
    const edgeBetween = (empty: string, other: string) => ({
        nodes: [
            { id: empty, label: empty, dimension: "WORK_TYPE", value: 5 },
            { id: other, label: other, dimension: "WORK_TYPE", value: 7 },
        ],
        edges: [{ source: other, target: empty, value: 4 }],
    });

    it("names the empty WORK_TYPE key as the unassigned work type label", () => {
        const [row] = adaptSankeyToChord(edgeBetween("WORK_TYPE:", "WORK_TYPE:Bug"), "work_type");
        expect(row).toMatchObject({
            source: "WORK_TYPE:Bug",
            target: "WORK_TYPE:",
            sourceLabel: "Bug",
            targetLabel: WORK_TYPE_LABEL,
        });
    });

    it("names a whitespace-only WORK_TYPE key as the unassigned work type label", () => {
        const [row] = adaptSankeyToChord(
            edgeBetween("WORK_TYPE:  ", "WORK_TYPE:Bug"),
            "work_type",
        );
        expect(row?.targetLabel).toBe(WORK_TYPE_LABEL);
    });

    it("names the empty WORK_TYPE key when the node label is blank", () => {
        const input = edgeBetween("WORK_TYPE:", "WORK_TYPE:Bug");
        input.nodes[0] = { id: "WORK_TYPE:", label: "", dimension: "WORK_TYPE", value: 5 };
        const [row] = adaptSankeyToChord(input, "work_type");
        expect(row?.targetLabel).toBe(WORK_TYPE_LABEL);
    });

    it("puts the unassigned work type label in the metadata key of the source", () => {
        const [row] = adaptSankeyToChord(
            {
                ...edgeBetween("WORK_TYPE:", "WORK_TYPE:Bug"),
                edges: [{ source: "WORK_TYPE:", target: "WORK_TYPE:Bug", value: 4 }],
            },
            "work_type",
        );
        expect(row?.metadata).toEqual({ workType: WORK_TYPE_LABEL });
    });

    it("keeps a real work type named like the unassigned label distinct from the empty bucket", () => {
        const records = adaptSankeyToChord(
            edgeBetween("WORK_TYPE:", `WORK_TYPE:${WORK_TYPE_LABEL}`),
            "work_type",
        );
        expect(records).toHaveLength(1);
        expect(records[0]?.source).not.toBe(records[0]?.target);
        expect(records[0]?.sourceLabel).toBe(records[0]?.targetLabel);
    });
});
