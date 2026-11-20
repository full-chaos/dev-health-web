import { describe, expect, it } from "vitest";

import { buildChordDataset } from "@/lib/chord";
import type { ChordDirection, ChordGroupingDimension, ChordRecord } from "@/lib/types";
import { adaptSankeyToChord } from "../chordAdapter";

type Edge = [string, string, number];

const groupings: Array<[ChordGroupingDimension, string, string]> = [
    ["team", "TEAM", "Unassigned team"],
    ["repo", "REPO", "Unassigned repo"],
    ["work_type", "WORK_TYPE", "Unassigned work type"],
];

describe.each(groupings)("%s unassigned bucket keeps its sort position", (grouping, dim, label) => {
    const BLANK = `${dim}:`;
    const S = `${dim}:Story`;
    const B = `${dim}:Bug`;
    const T = `${dim}:Task`;
    const sankeyOf = (edges: Edge[]) => ({
        nodes: [BLANK, S, B, T].map((id) => ({ id, label: id, dimension: dim, value: 1 })),
        edges: edges.map(([source, target, value]) => ({ source, target, value })),
    });
    // The records as they sorted before the label was added: the blank bucket carried the empty name.
    const asOnMain = (records: ChordRecord[]): ChordRecord[] =>
        records.map((r) => ({
            ...r,
            sourceLabel: r.source === BLANK ? "" : r.sourceLabel,
            targetLabel: r.target === BLANK ? "" : r.targetLabel,
        }));
    const ids = (list: Array<{ id?: string; a?: string; b?: string }>) =>
        list.map((x) => x.id ?? `${x.a}|${x.b}`);
    const run = (edges: Edge[], opts: { topN?: number; direction?: ChordDirection } = {}) => {
        const records = adaptSankeyToChord(sankeyOf(edges), grouping);
        return {
            tip: buildChordDataset(records, { grouping, ...opts }),
            main: buildChordDataset(asOnMain(records), { grouping, ...opts }),
        };
    };
    const tie: Edge[] = [
        [S, BLANK, 4],
        [S, B, 4],
        [S, T, 1],
    ];

    it("orders the nodes by the raw key on a tie", () => {
        const { tip, main } = run(tie);
        expect(ids(tip.nodes)).toEqual([S, BLANK, B, T]);
        expect(ids(tip.nodes)).toEqual(ids(main.nodes));
    });

    it("keeps the blank bucket inside the Entities cutoff, not in Other", () => {
        for (const direction of ["bilateral", "in", "out", "net"] as const) {
            const { tip, main } = run(tie, { topN: 3, direction });
            expect(ids(tip.nodes)).toEqual(ids(main.nodes));
            expect(ids(tip.nodes)).toContain(BLANK);
        }
    });

    it("ranks Top importers by the raw key on a tie", () => {
        const { tip, main } = run(tie, { direction: "out" });
        expect(ids(tip.summary.topImporters)).toEqual(ids(main.summary.topImporters));
        expect(ids(tip.summary.topImporters).slice(0, 2)).toEqual([BLANK, B]);
    });

    it("ranks Top exporters by the raw key on a tie", () => {
        const { tip, main } = run(
            [
                [BLANK, S, 4],
                [B, S, 4],
                [T, S, 1],
            ],
            { direction: "out" },
        );
        expect(ids(tip.summary.topExporters)).toEqual(ids(main.summary.topExporters));
        expect(ids(tip.summary.topExporters).slice(0, 2)).toEqual([BLANK, B]);
    });

    it("ranks Strongest exchange by the raw key on a tie", () => {
        const { tip, main } = run(tie);
        expect(ids(tip.summary.strongestBilateral)).toEqual(ids(main.summary.strongestBilateral));
    });

    it("still shows the unassigned label as the display name", () => {
        expect(run(tie).tip.nodes.find((n) => n.id === BLANK)?.label).toBe(label);
    });
});
