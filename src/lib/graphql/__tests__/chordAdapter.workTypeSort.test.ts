import { describe, expect, it } from "vitest";

import { buildChordDataset } from "@/lib/chord";
import type { ChordDirection, ChordRecord } from "@/lib/types";
import { adaptSankeyToChord } from "../chordAdapter";

const BLANK = "WORK_TYPE:";
const names = ["Story", "Bug", "Task"];

const sankeyOf = (edges: Array<[string, string, number]>) => ({
    nodes: [
        { id: BLANK, label: BLANK, dimension: "WORK_TYPE", value: 1 },
        ...names.map((n) => ({
            id: `WORK_TYPE:${n}`,
            label: `WORK_TYPE:${n}`,
            dimension: "WORK_TYPE",
            value: 1,
        })),
    ],
    edges: edges.map(([source, target, value]) => ({ source, target, value })),
});

const S = "WORK_TYPE:Story";
const B = "WORK_TYPE:Bug";
const T = "WORK_TYPE:Task";

// The records as main produced them: the blank bucket carried the empty name.
const asOnMain = (records: ChordRecord[]): ChordRecord[] =>
    records.map((r) => ({
        ...r,
        sourceLabel: r.source === BLANK ? "" : r.sourceLabel,
        targetLabel: r.target === BLANK ? "" : r.targetLabel,
    }));

const ids = (list: Array<{ id?: string; a?: string; b?: string }>) =>
    list.map((x) => x.id ?? `${x.a}|${x.b}`);

const run = (
    edges: Array<[string, string, number]>,
    opts: { topN?: number; direction?: ChordDirection } = {},
) => {
    const records = adaptSankeyToChord(sankeyOf(edges), "work_type");
    const tip = buildChordDataset(records, { grouping: "work_type", ...opts });
    const main = buildChordDataset(asOnMain(records), { grouping: "work_type", ...opts });
    return { tip, main };
};

describe("WORK_TYPE blank bucket keeps its sort position", () => {
    const tie: Array<[string, string, number]> = [
        [S, BLANK, 4],
        [S, B, 4],
        [S, T, 1],
    ];

    it("orders the nodes as main does on a tie", () => {
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

    it("ranks Top importers as main does on a tie", () => {
        const { tip, main } = run(tie, { direction: "out" });
        expect(ids(tip.summary.topImporters)).toEqual(ids(main.summary.topImporters));
        expect(ids(tip.summary.topImporters).slice(0, 2)).toEqual([BLANK, B]);
    });

    it("ranks Top exporters as main does on a tie", () => {
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

    it("ranks Strongest exchange as main does on a tie", () => {
        const { tip, main } = run(tie);
        expect(ids(tip.summary.strongestBilateral)).toEqual(ids(main.summary.strongestBilateral));
    });

    it("still shows the unassigned label as the display name", () => {
        const { tip } = run(tie);
        expect(tip.nodes.find((n) => n.id === BLANK)?.label).toBe("Unassigned work type");
    });
});
