import { describe, expect, it } from "vitest";

import {
    BOX_HEIGHT,
    COLUMN_GAP,
    FIT_ROWS,
    MARGIN_LEFT,
    MARGIN_RIGHT,
    MARGIN_Y,
    LAYERED_TYPE_ORDER,
    MIN_ROW_GAP,
    BOW_PAD,
    INNER_LINK_CURVENESS,
    LABEL_WIDTH,
    countCrossings,
    defaultGraphMode,
    innerLinkCurveness,
    layoutLayered,
    type LayoutLink,
    type LayoutNode,
} from "../workGraphLayout";

const n = (type: LayoutNode["type"], id: string): LayoutNode => ({ id: `${type}:${id}`, type });
const l = (a: LayoutNode, b: LayoutNode): LayoutLink => ({ source: a.id, target: b.id });

// issues I1..I4, prs P1..P4; links cross when drawn in id order: I1-P4, I2-P3, I3-P2, I4-P1
const issues = ["1", "2", "3", "4"].map((i) => n("ISSUE", i));
const prs = ["1", "2", "3", "4"].map((i) => n("PR", i));
const crossed = [
    l(issues[0], prs[3]),
    l(issues[1], prs[2]),
    l(issues[2], prs[1]),
    l(issues[3], prs[0]),
];

describe("layoutLayered", () => {
    it("draws only the columns whose type is present, in the fixed order", () => {
        const commit = n("COMMIT", "c");
        const layout = layoutLayered([commit, issues[0], prs[0]], []);
        expect(layout.columns.map((c) => c.type)).toEqual(["ISSUE", "PR", "COMMIT"]);
        expect(layout.columns.map((c) => c.x)).toEqual([0, COLUMN_GAP, 2 * COLUMN_GAP]);
        expect(layoutLayered([prs[0]], []).columns).toHaveLength(1);
    });

    it("fixed order covers every node type once", () => {
        expect(new Set(LAYERED_TYPE_ORDER).size).toBe(LAYERED_TYPE_ORDER.length);
        expect(LAYERED_TYPE_ORDER).toHaveLength(11);
    });

    it("never loses a node: every node gets a position", () => {
        const nodes = [...issues, ...prs, n("INCIDENT", "x"), n("FILE", "f")];
        const layout = layoutLayered(nodes, crossed);
        expect(layout.positions.size).toBe(nodes.length);
        for (const node of nodes) expect(layout.positions.has(node.id)).toBe(true);
    });

    it("is deterministic and independent of input order", () => {
        const a = layoutLayered([...issues, ...prs], crossed);
        const b = layoutLayered(
            [...prs].reverse().concat([...issues].reverse()),
            [...crossed].reverse(),
        );
        expect(Array.from(b.order.entries())).toEqual(Array.from(a.order.entries()));
        expect(Array.from(b.positions.entries()).sort()).toEqual(
            Array.from(a.positions.entries()).sort(),
        );
    });

    it("barycenter sweeps remove avoidable crossings", () => {
        const nodes = [...issues, ...prs];
        const naive = {
            ...layoutLayered(nodes, []),
        };
        expect(countCrossings(naive, crossed)).toBe(6);
        const sorted = layoutLayered(nodes, crossed);
        expect(countCrossings(sorted, crossed)).toBe(0);
    });

    it("keeps at least the minimum row spacing in a tall column", () => {
        const many = Array.from({ length: 80 }, (_, i) => n("COMMIT", String(i).padStart(3, "0")));
        const layout = layoutLayered(many, []);
        const ys = many.map((m) => layout.positions.get(m.id)!.y).sort((a, b) => a - b);
        for (let i = 1; i < ys.length; i += 1)
            expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(MIN_ROW_GAP);
    });

    it("ignores links whose endpoints are not nodes", () => {
        const layout = layoutLayered(
            [issues[0], prs[0]],
            [{ source: "ISSUE:1", target: "PR:missing" }],
        );
        expect(layout.positions.size).toBe(2);
    });
});

describe("layered canvas size", () => {
    const tall = (rows: number) =>
        Array.from({ length: rows }, (_, i) => n("COMMIT", String(i).padStart(4, "0")));

    it("fit rows = the rows of the box at the 14px pitch (34)", () => {
        expect(FIT_ROWS).toBe(Math.floor((BOX_HEIGHT - 2 * MARGIN_Y) / MIN_ROW_GAP));
        expect(FIT_ROWS).toBe(34);
    });

    it("a column that fits is spread over the box; a taller one grows at the minimum pitch", () => {
        const fitting = layoutLayered(tall(FIT_ROWS), []);
        expect(fitting.height).toBe(BOX_HEIGHT - 2 * MARGIN_Y);
        const taller = layoutLayered(tall(FIT_ROWS + 1), []);
        expect(taller.rowPitch).toBe(MIN_ROW_GAP);
        expect(taller.height).toBe((FIT_ROWS + 1) * MIN_ROW_GAP);
        const big = layoutLayered(tall(674), []);
        expect(big.height).toBe(674 * MIN_ROW_GAP);
        expect(big.positions.size).toBe(674);
    });

    it("columns span the card width when a width is given", () => {
        const layout = layoutLayered([issues[0], prs[0], n("COMMIT", "c")], [], { width: 1000 });
        const xs = layout.columns.map((c) => c.x);
        expect(xs[0]).toBe(0);
        expect(xs[2]).toBe(1000 - MARGIN_LEFT - MARGIN_RIGHT);
        expect(xs[1]).toBe(xs[2] / 2);
    });
});

describe("defaultGraphMode", () => {
    it("opens Layered while the tallest column fits, Network when it does not", () => {
        expect(defaultGraphMode([{ count: 3 }, { count: FIT_ROWS }])).toBe("layered");
        expect(defaultGraphMode([{ count: 3 }, { count: FIT_ROWS + 1 }])).toBe("network");
        expect(defaultGraphMode([])).toBe("layered");
    });

    it("the limit is the only knob: a limit of 0 always opens Network, Infinity always Layered", () => {
        expect(defaultGraphMode([{ count: 1 }], 0)).toBe("network");
        expect(defaultGraphMode([{ count: 9999 }], Infinity)).toBe("layered");
    });
});

// The Dependencies tab links issue to issue: every link stays inside ONE column. Such a link is a
// bow beside the column, so the layout must leave room for it and must say how wide it may be.
describe("links inside one column", () => {
    const flag = n("FEATURE_FLAG", "f");
    const inner = [l(issues[0], issues[3]), l(issues[1], issues[2]), l(issues[0], flag)];
    const usable = 1000 - MARGIN_LEFT - MARGIN_RIGHT;

    it("puts each column in the middle of its band, so the drawing is centred", () => {
        const layout = layoutLayered([...issues, flag], inner, { width: 1000 });
        expect(layout.innerLinks).toBe(true);
        expect(layout.columns.map((c) => c.x)).toEqual([usable / 4, (3 * usable) / 4]);
    });

    it("keeps the columns edge to edge when every link goes between columns", () => {
        const layout = layoutLayered([...issues, ...prs], crossed, { width: 1000 });
        expect(layout.innerLinks).toBe(false);
        expect(layout.columns.map((c) => c.x)).toEqual([0, usable]);
    });

    it("a link whose two ends are not both nodes does not count as a link inside a column", () => {
        const layout = layoutLayered(
            [issues[0], prs[0]],
            [{ source: issues[0].id, target: "ISSUE:missing" }],
            { width: 1000 },
        );
        expect(layout.innerLinks).toBe(false);
    });

    it("gives each column the free room on its left: to the canvas edge, or to the labels of the column before", () => {
        const layout = layoutLayered([...issues, flag], inner, { width: 1000 });
        expect(layout.columns.map((c) => c.bowRoom)).toEqual([
            MARGIN_LEFT + usable / 4 - BOW_PAD,
            usable / 2 - LABEL_WIDTH - BOW_PAD,
        ]);
    });

    it("the room is never negative on a narrow card", () => {
        const many = LAYERED_TYPE_ORDER.map((type) => n(type, "a"));
        const layout = layoutLayered(many, [l(many[0], many[0])], { width: 420 });
        for (const column of layout.columns) expect(column.bowRoom).toBeGreaterThanOrEqual(0);
    });
});

describe("innerLinkCurveness", () => {
    // ECharts puts the control point of a curved link at (mid x) - (y1 - y2) * curveness, in
    // screen px. For a vertical link the bow is on the LEFT when (y1 - y2) * curveness > 0.
    const bowsLeft = (y1: number, y2: number, room: number) =>
        (y1 - y2) * innerLinkCurveness(y1, y2, room) > 0;

    it("bows to the left of the column, whichever end is on top", () => {
        expect(bowsLeft(0, 100, 50)).toBe(true);
        expect(bowsLeft(100, 0, 50)).toBe(true);
        expect(innerLinkCurveness(0, 100, 50)).toBeLessThan(0);
        expect(innerLinkCurveness(100, 0, 50)).toBeGreaterThan(0);
    });

    it("never strays further than the room, for a short link and for a very long one", () => {
        for (const length of [10, 100, 1000, 13000]) {
            const curveness = Math.abs(innerLinkCurveness(0, length, 40));
            // the peak of the curve is half of the control point's distance from the line
            expect((curveness * length) / 2).toBeLessThanOrEqual(40 + 1e-9);
            expect(curveness).toBeLessThanOrEqual(INNER_LINK_CURVENESS);
        }
        expect(Math.abs(innerLinkCurveness(0, 10, 40))).toBe(INNER_LINK_CURVENESS);
    });

    it("is flat when the link has no length or the column has no room", () => {
        expect(innerLinkCurveness(50, 50, 40)).toBe(0);
        expect(innerLinkCurveness(0, 100, 0)).toBe(0);
        expect(innerLinkCurveness(0, 100, -5)).toBe(0);
    });
});
