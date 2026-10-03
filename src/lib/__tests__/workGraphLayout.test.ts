import { describe, expect, it } from "vitest";

import {
    BOX_HEIGHT,
    COLUMN_GAP,
    FIT_ROWS,
    MARGIN_LEFT,
    MARGIN_RIGHT,
    MARGIN_Y,
    MAX_ROW_GAP,
    LAYERED_TYPE_ORDER,
    MIN_ROW_GAP,
    BOW_PAD,
    INNER_LINK_CURVENESS,
    LABEL_WIDTH,
    countCrossings,
    defaultGraphMode,
    innerLinkCurveness,
    layoutLayered,
    placeShortColumn,
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

// CHAOS-8511: in a graph that is taller than the box, a short column spread evenly over the whole
// height had no node on the first screen (7 feature flags over 13,060 px). A short column's nodes
// now sit at the mean height of the nodes they are linked to.
describe("a short column in a graph that is taller than the box", () => {
    const pad = (i: number) => String(i).padStart(3, "0");
    const tallIssues = Array.from({ length: 100 }, (_, i) => n("ISSUE", pad(i)));
    const flags = ["a", "b", "c"].map((id) => n("FEATURE_FLAG", id));
    const y = (layout: ReturnType<typeof layoutLayered>, node: LayoutNode) =>
        layout.positions.get(node.id)!.y;
    const meanY = (layout: ReturnType<typeof layoutLayered>, nodes: LayoutNode[]) =>
        nodes.reduce((sum, node) => sum + y(layout, node), 0) / nodes.length;
    const gapsOf = (layout: ReturnType<typeof layoutLayered>, nodes: LayoutNode[]) => {
        const ys = nodes.map((node) => y(layout, node)).sort((p, q) => p - q);
        return ys.slice(1).map((value, i) => value - ys[i]);
    };

    // flag a: issues 10, 11, 12 · flag b: issue 50 · flag c: issues 90 and 96
    const linkedTo = new Map<LayoutNode, LayoutNode[]>([
        [flags[0], [tallIssues[10], tallIssues[11], tallIssues[12]]],
        [flags[1], [tallIssues[50]]],
        [flags[2], [tallIssues[90], tallIssues[96]]],
    ]);
    const links = Array.from(linkedTo, ([flag, near]) =>
        near.map((issue) => l(issue, flag)),
    ).flat();

    it("each node of the short column lies within one row gap of the mean height of its linked nodes", () => {
        const layout = layoutLayered([...tallIssues, ...flags], links, { width: 954 });
        expect(layout.height).toBe(100 * MIN_ROW_GAP);
        for (const [flag, near] of linkedTo) {
            expect(Math.abs(y(layout, flag) - meanY(layout, near)), flag.id).toBeLessThanOrEqual(
                MIN_ROW_GAP,
            );
        }
        // not the even spread over the height (flag a would be at 1/6 of 1,400 px = 233 px)
        expect(y(layout, flags[0])).toBeLessThan(200);
    });

    it("uses the MEAN height of the linked nodes, not the height of one of them", () => {
        const layout = layoutLayered([...tallIssues, ...flags], links, { width: 954 });
        // flag a has three linked issues on three rows: its place is the middle one, exactly
        const near = linkedTo.get(flags[0])!;
        const heights = near.map((issue) => y(layout, issue)).sort((p, q) => p - q);
        expect(heights[2] - heights[0]).toBeCloseTo(2 * MIN_ROW_GAP, 9);
        expect(y(layout, flags[0])).toBeCloseTo(heights[1], 9);
        // flag c has two linked issues: its place is half way between them
        const [upper, lower] = linkedTo
            .get(flags[2])!
            .map((issue) => y(layout, issue))
            .sort((p, q) => p - q);
        expect(lower).toBeGreaterThan(upper);
        expect(y(layout, flags[2])).toBeCloseTo((upper + lower) / 2, 9);
    });

    it("no two nodes of a column are closer than the row gap", () => {
        const layout = layoutLayered([...tallIssues, ...flags], links, { width: 954 });
        for (const column of [tallIssues, flags]) {
            for (const gap of gapsOf(layout, column)) {
                expect(gap).toBeGreaterThanOrEqual(MIN_ROW_GAP - 1e-9);
            }
        }
    });

    it("nodes that want the same height are set one row gap apart, around that height, and stay in the canvas", () => {
        // all three flags are linked to the same issue; once at the top and once at the bottom edge
        for (const issue of [tallIssues[0], tallIssues[40], tallIssues[99]]) {
            const same = flags.map((flag) => l(issue, flag));
            const layout = layoutLayered([...tallIssues, ...flags], same, { width: 954 });
            const ys = flags.map((flag) => y(layout, flag)).sort((p, q) => p - q);
            expect(ys[1] - ys[0], issue.id).toBeCloseTo(MIN_ROW_GAP, 9);
            expect(ys[2] - ys[1], issue.id).toBeCloseTo(MIN_ROW_GAP, 9);
            expect(ys[0], issue.id).toBeGreaterThanOrEqual(MIN_ROW_GAP / 2);
            expect(ys[2], issue.id).toBeLessThanOrEqual(layout.height - MIN_ROW_GAP / 2);
            // the group stays at the linked node: no node is further than its place in the group needs
            for (const value of ys) {
                expect(Math.abs(value - y(layout, issue)), issue.id).toBeLessThanOrEqual(
                    2 * MIN_ROW_GAP,
                );
            }
            // away from the canvas edges the group is centred on the wanted height
            if (issue === tallIssues[40]) expect(ys[1]).toBeCloseTo(y(layout, issue), 9);
        }
    });

    it("a node with no link to another column is listed at the top, at the widest row gap", () => {
        // flag a has no link; the linked nodes of flags b and c are in the middle and at the bottom
        const some = [l(tallIssues[60], flags[1]), l(tallIssues[90], flags[2])];
        const layout = layoutLayered([...tallIssues, ...flags], some, { width: 954 });
        expect(y(layout, flags[0])).toBe(MAX_ROW_GAP / 2);
        // the linked ones are at their linked nodes, far from the top
        expect(y(layout, flags[1])).toBeCloseTo(y(layout, tallIssues[60]), 9);
        expect(y(layout, flags[2])).toBeCloseTo(y(layout, tallIssues[90]), 9);
        expect(y(layout, flags[1])).toBeGreaterThan(10 * MAX_ROW_GAP);
    });

    it("the list at the top counts only the nodes with no link: a last node with no link is first in it", () => {
        // flags a and b are linked; flag c, the last of the column, has no link
        const some = [l(tallIssues[30], flags[0]), l(tallIssues[60], flags[1])];
        const layout = layoutLayered([...tallIssues, ...flags], some, { width: 954 });
        // It is the FIRST of the list (22 px, or one row gap more when a linked node is at the
        // top too), not the third (110 px).
        expect(y(layout, flags[2])).toBeLessThanOrEqual(MAX_ROW_GAP / 2 + MIN_ROW_GAP);
        expect(y(layout, flags[1])).toBeGreaterThan(10 * MAX_ROW_GAP);
    });

    // The real case (Dependencies tab): 926 issues linked issue to issue, and 7 feature flags
    // linked flag to flag only. The even spread put the flags 1,850 px apart: none on the first
    // screen. A link inside the column gives no height to go to.
    it("a short column whose links are all inside the column has every node on the first screen", () => {
        const seven = ["a", "b", "c", "d", "e", "f", "g"].map((id) => n("FEATURE_FLAG", id));
        const inner = [
            ...tallIssues.map((issue, i) => l(issue, tallIssues[(i + 7) % 100])),
            ...seven.map((flag, i) => l(flag, seven[(i + 1) % 7])),
        ];
        const layout = layoutLayered([...tallIssues, ...seven], inner, { width: 954 });
        expect(layout.height).toBeGreaterThan(BOX_HEIGHT);
        const heights = seven.map((flag) => y(layout, flag));
        expect(heights).toEqual(seven.map((_, i) => (i + 0.5) * MAX_ROW_GAP));
        // the first screen is the box: all seven are in it
        expect(Math.max(...heights)).toBeLessThan(BOX_HEIGHT - 2 * MARGIN_Y);
    });

    it("a listed node and a linked node that want the same place stay one row gap apart", () => {
        // flag a is linked to the first issue (the top row); flag b has no link and is listed at the top too
        const top = [l(tallIssues[0], flags[0])];
        const layout = layoutLayered([...tallIssues, ...flags.slice(0, 2)], top, { width: 954 });
        const [upper, lower] = [y(layout, flags[0]), y(layout, flags[1])].sort((p, q) => p - q);
        expect(lower - upper).toBeGreaterThanOrEqual(MIN_ROW_GAP - 1e-9);
        expect(upper).toBeGreaterThanOrEqual(MIN_ROW_GAP / 2);
        expect(lower).toBeLessThan(2 * MAX_ROW_GAP);
    });

    it("lists the column top to bottom in `order`, as it is drawn", () => {
        // flag a is linked low, flag c high: the drawn order is c, b, a... by height
        const swapped = [l(tallIssues[95], flags[0]), l(tallIssues[5], flags[2])];
        const layout = layoutLayered([...tallIssues, ...flags], swapped, { width: 954 });
        const drawn = layout.order.get("FEATURE_FLAG")!;
        const heights = drawn.map((id) => layout.positions.get(id)!.y);
        expect([...heights].sort((p, q) => p - q)).toEqual(heights);
        expect(drawn).toHaveLength(3);
    });

    it("gives the same places for the same graph in another input order", () => {
        const one = layoutLayered([...tallIssues, ...flags], links, { width: 954 });
        const other = layoutLayered([...flags].reverse().concat(tallIssues), [...links].reverse(), {
            width: 954,
        });
        for (const flag of flags) expect(y(other, flag)).toBe(y(one, flag));
    });

    // The approved prototype spreads every column evenly over the box. That stays where the
    // drawing is the prototype's: a graph that fits the box, and columns that are not short.
    it("a graph that fits the box keeps the even spread, also for a short column (the prototype's drawing)", () => {
        const fitting = tallIssues.slice(0, 20);
        const some = [l(fitting[0], flags[0]), l(fitting[1], flags[1]), l(fitting[2], flags[2])];
        const layout = layoutLayered([...fitting, ...flags], some, { width: 954 });
        expect(layout.height).toBe(BOX_HEIGHT - 2 * MARGIN_Y);
        expect(flags.map((flag) => y(layout, flag))).toEqual(
            [0.5, 1.5, 2.5].map((slot) => (slot * layout.height) / 3),
        );
    });

    it("a column whose even spread is not wider than the widest row gap keeps the even spread", () => {
        // 100 issues against 90 pull requests: 1,400 px / 90 = 15.6 px a row, well under 44 px
        const prs90 = Array.from({ length: 90 }, (_, i) => n("PR", pad(i)));
        const paired = prs90.map((pr, i) => l(tallIssues[99 - i], pr));
        const layout = layoutLayered([...tallIssues, ...prs90], paired, { width: 954 });
        expect(layout.height / 90).toBeLessThanOrEqual(MAX_ROW_GAP);
        const ys = prs90.map((pr) => y(layout, pr)).sort((p, q) => p - q);
        expect(ys).toEqual(prs90.map((_, i) => ((i + 0.5) * layout.height) / 90));
    });

    it("the limit is the widest row gap: 32 rows of 1,400 px stay even, 31 rows move", () => {
        const column = (count: number) => Array.from({ length: count }, (_, i) => n("PR", pad(i)));
        const even = (count: number, layout: ReturnType<typeof layoutLayered>) =>
            Array.from({ length: count }, (_, i) => ((i + 0.5) * layout.height) / count);
        // every pull request is linked to issue 0, at the top
        for (const [count, moved] of [
            [32, false],
            [31, true],
        ] as const) {
            const prsN = column(count);
            const layout = layoutLayered(
                [...tallIssues, ...prsN],
                prsN.map((pr) => l(tallIssues[0], pr)),
                { width: 954 },
            );
            const ys = prsN.map((pr) => y(layout, pr)).sort((p, q) => p - q);
            const isEven = JSON.stringify(ys) === JSON.stringify(even(count, layout));
            expect(isEven, `${count} rows: ${(layout.height / count).toFixed(1)} px`).toBe(!moved);
        }
    });
});

describe("placeShortColumn", () => {
    const GAP = 14;
    const HEIGHT = 1400;
    const place = (...wanted: number[]) =>
        placeShortColumn(
            wanted.map((value, index) => ({ id: `n${index}`, index, wanted: value })),
            GAP,
            HEIGHT,
        );
    const ys = (placed: ReturnType<typeof place>) => placed.map((node) => node.y);

    it("puts a node at the height it wants when nothing is in the way", () => {
        expect(place(100, 400, 900)).toEqual([
            { id: "n0", y: 100 },
            { id: "n1", y: 400 },
            { id: "n2", y: 900 },
        ]);
    });

    it("gives the nodes top to bottom by the wanted height, whatever order they came in", () => {
        expect(place(300, 100, 200)).toEqual([
            { id: "n1", y: 100 },
            { id: "n2", y: 200 },
            { id: "n0", y: 300 },
        ]);
    });

    it("keeps the order the column had for nodes that want the same height", () => {
        expect(place(500, 500, 500).map((node) => node.id)).toEqual(["n0", "n1", "n2"]);
    });

    it("centres a group on the height its nodes want, one gap apart", () => {
        expect(ys(place(500, 500, 500))).toEqual([486, 500, 514]);
        // two nodes that are too near move apart by the same distance
        expect(ys(place(100, 105, 300))).toEqual([95.5, 109.5, 300]);
    });

    it("a group pushes into the next node only as far as the gap needs", () => {
        // the group of three would end at 514; the node that wants 520 is one gap after it
        const placed = ys(place(500, 500, 500, 520));
        expect(placed[3] - placed[2]).toBeCloseTo(GAP, 9);
        for (let i = 1; i < placed.length; i += 1) {
            expect(placed[i] - placed[i - 1]).toBeGreaterThanOrEqual(GAP - 1e-9);
        }
    });

    it("keeps every node inside the canvas at the top edge and at the bottom edge", () => {
        expect(ys(place(0, 0, 0))).toEqual([7, 21, 35]);
        expect(ys(place(HEIGHT, HEIGHT, HEIGHT))).toEqual([1365, 1379, 1393]);
    });

    it("starts at the top when the canvas is too low for the column (never above it)", () => {
        const placed = placeShortColumn(
            [0, 1, 2].map((index) => ({ id: `n${index}`, index, wanted: 10 })),
            GAP,
            20,
        );
        expect(ys(placed)).toEqual([7, 21, 35]);
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
