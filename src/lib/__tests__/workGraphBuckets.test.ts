import { describe, expect, it } from "vitest";

import { bucketGraph, bucketableTypes, bucketId } from "../workGraphBuckets";
import type { WorkGraphNodeType } from "../graphql/types";

const node = (type: WorkGraphNodeType, i: number) => ({ id: `${type}:${i}`, type });
const make = (type: WorkGraphNodeType, count: number, bucketCount: number) => ({
    id: bucketId(type),
    type,
    bucketCount: bucketCount || count,
});
const issues = Array.from({ length: 10 }, (_, i) => node("ISSUE", i));
const prs = Array.from({ length: 3 }, (_, i) => node("PR", i));

describe("bucketableTypes", () => {
    it("lists a type only when its count is over the threshold", () => {
        expect(bucketableTypes([...issues, ...prs], 10).size).toBe(0);
        expect(Array.from(bucketableTypes([...issues, ...prs], 9))).toEqual(["ISSUE"]);
    });
});

describe("bucketGraph", () => {
    const links = issues.map((n, i) => ({
        source: n.id,
        target: prs[i % 3].id,
        edgeType: "FIXES",
    }));
    const run = (expanded: WorkGraphNodeType[] = []) =>
        bucketGraph(
            [...issues, ...prs],
            links,
            new Set<WorkGraphNodeType>(["ISSUE"]),
            new Set(expanded),
            (type, count) => make(type, count, count),
        );

    it("replaces a collapsed column with one bucket that holds the member count", () => {
        const out = run();
        expect(out.nodes.filter((n) => n.type === "ISSUE")).toEqual([
            { id: "bucket:ISSUE", type: "ISSUE", bucketCount: 10 },
        ]);
        expect(out.nodes).toHaveLength(4);
    });

    it("merges edges that end in the bucket and keeps the served total", () => {
        const out = run();
        expect(out.links).toHaveLength(3);
        expect(out.links.reduce((sum, l) => sum + l.count, 0)).toBe(10);
        expect(out.links.every((l) => l.source === "bucket:ISSUE")).toBe(true);
        expect(out.links.find((l) => l.target === "PR:0")!.count).toBe(4);
    });

    it("an expanded column keeps its nodes and its served links one to one", () => {
        const out = run(["ISSUE"]);
        expect(out.nodes).toHaveLength(13);
        expect(out.links).toHaveLength(10);
        expect(out.links.every((l) => l.count === 1)).toBe(true);
        expect(out.buckets.size).toBe(0);
    });

    it("a link inside one collapsed bucket is not drawn but is counted", () => {
        const out = bucketGraph(
            issues,
            [{ source: "ISSUE:0", target: "ISSUE:1", edgeType: "RELATES" }],
            new Set<WorkGraphNodeType>(["ISSUE"]),
            new Set(),
            (type, count) => make(type, count, count),
        );
        expect(out.links).toHaveLength(0);
        expect(out.hiddenInnerLinks).toBe(1);
    });

    it("does not merge edges of different types", () => {
        const out = bucketGraph(
            [...issues, ...prs],
            [
                { source: "ISSUE:0", target: "PR:0", edgeType: "FIXES" },
                { source: "ISSUE:1", target: "PR:0", edgeType: "RELATES" },
            ],
            new Set<WorkGraphNodeType>(["ISSUE"]),
            new Set(),
            (type, count) => make(type, count, count),
        );
        expect(out.links).toHaveLength(2);
    });
});
