import { describe, expect, it } from "vitest";

import type { SankeyResponse } from "@/lib/types";
import {
    computeSelectedPath,
    entityKindForGroup,
    filterSankeyToEntity,
    findClickedNode,
} from "../allocationSelection";

const flow: SankeyResponse = {
    mode: "investment",
    nodes: [
        { name: "Alpha", group: "team" },
        { name: "Beta", group: "team" },
        { name: "Risk", group: "category" },
        { name: "Quality", group: "category" },
        { name: "repo-a", group: "repo" },
        { name: "repo-b", group: "repo" },
    ],
    links: [
        { source: "Alpha", target: "Risk", value: 6 },
        { source: "Beta", target: "Quality", value: 4 },
        { source: "Risk", target: "repo-a", value: 5 },
        { source: "Risk", target: "repo-b", value: 1 },
        { source: "Quality", target: "repo-b", value: 4 },
    ],
};

describe("filterSankeyToEntity", () => {
    it("keeps the node, its touching links and the nodes at their other ends: nothing else", () => {
        const out = filterSankeyToEntity(flow, "repo-b")!;
        expect(out.nodes.map((n) => n.name).sort()).toEqual(["Quality", "Risk", "repo-b"]);
        expect(out.links).toEqual([
            { source: "Risk", target: "repo-b", value: 1 },
            { source: "Quality", target: "repo-b", value: 4 },
        ]);
    });

    it("never changes a link value (a longer path would overstate it)", () => {
        const out = filterSankeyToEntity(flow, "Risk")!;
        const byPair = Object.fromEntries(
            out.links.map((l) => [`${l.source}>${l.target}`, l.value]),
        );
        expect(byPair).toEqual({ "Alpha>Risk": 6, "Risk>repo-a": 5, "Risk>repo-b": 1 });
    });

    it("returns the flow unchanged for no selection or an unknown name", () => {
        expect(filterSankeyToEntity(flow, null)).toBe(flow);
        expect(filterSankeyToEntity(flow, "nope")).toBe(flow);
        expect(filterSankeyToEntity(null, "Risk")).toBeNull();
    });
});

describe("computeSelectedPath", () => {
    it("allocated and share are the node's value and its share of the base total", () => {
        const out = computeSelectedPath({ base: flow, baseline: null, name: "repo-b" })!;
        expect(out.allocated).toBe(5);
        expect(out.share).toBeCloseTo(50, 5);
    });

    it("no baseline means null (not available), never 0", () => {
        const out = computeSelectedPath({ base: flow, baseline: null, name: "repo-b" })!;
        expect(out.baselineShare).toBeNull();
        expect(out.changePp).toBeNull();
    });

    it("baseline share and change in percentage points come from the baseline flow", () => {
        const baseline: SankeyResponse = {
            ...flow,
            links: [
                { source: "Alpha", target: "Risk", value: 10 },
                { source: "Risk", target: "repo-a", value: 8 },
                { source: "Risk", target: "repo-b", value: 2 },
            ],
        };
        const out = computeSelectedPath({ base: flow, baseline, name: "repo-b" })!;
        expect(out.baselineShare).toBeCloseTo(20, 5);
        expect(out.changePp).toBeCloseTo(30, 5);
    });

    it("an entity that has no flow in a baseline that does carry flow is a measured 0%", () => {
        const baseline: SankeyResponse = {
            ...flow,
            links: [{ source: "Alpha", target: "Risk", value: 10 }],
        };
        const out = computeSelectedPath({ base: flow, baseline, name: "repo-b" })!;
        expect(out.baselineShare).toBe(0);
    });

    it("an empty baseline (total 0) is unavailable, not 0%", () => {
        const out = computeSelectedPath({
            base: flow,
            baseline: { ...flow, links: [] },
            name: "repo-b",
        })!;
        expect(out.baselineShare).toBeNull();
    });

    it("returns null when the entity is not in the base flow", () => {
        expect(computeSelectedPath({ base: flow, baseline: null, name: "nope" })).toBeNull();
    });
});

describe("entityKindForGroup", () => {
    it("maps node groups to entity kinds", () => {
        expect(entityKindForGroup("team")).toBe("team");
        expect(entityKindForGroup("category")).toBe("theme");
        expect(entityKindForGroup("subcategory")).toBe("subcategory");
        expect(entityKindForGroup("repo")).toBe("repo");
        expect(entityKindForGroup(undefined)).toBeNull();
    });
});

describe("findClickedNode", () => {
    const nodes = [
        { name: "full-chaos/dev-health-acr", group: "repo" },
        { name: "Alpha", group: "team" },
    ];
    it("matches the exact name, then the displayed (shortened) name", () => {
        expect(findClickedNode(nodes, "Alpha")?.group).toBe("team");
        expect(findClickedNode(nodes, "dev-health-acr")?.name).toBe("full-chaos/dev-health-acr");
        expect(findClickedNode(nodes, "nope")).toBeUndefined();
        expect(findClickedNode(nodes, undefined)).toBeUndefined();
    });
});
