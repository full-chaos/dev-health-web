import type { WorkGraphNodeType } from "@/lib/graphql/types";

/**
 * Layered (column) layout for the Work Graph. Pure and deterministic: the same nodes and
 * links always give the same columns and order. A layout only, never a metric: it uses the
 * persisted edges the page already holds and adds nothing to the data.
 *
 * Columns follow the entity types that are PRESENT, in this fixed order (a type with no
 * node gets no column). Work flows left to right: work item, change, review, code, release.
 *
 * Rows: a column is spread evenly over the height (the approved prototype's rule). The one
 * exception is a short column of a drawing that is taller than the box (CHAOS-8511): a node
 * linked to other columns sits at the mean height of those linked nodes, so it is on the same
 * screen as they are; the nodes with no such link are listed from the top, so the column has
 * nodes on the first screen.
 */
export const LAYERED_TYPE_ORDER: readonly WorkGraphNodeType[] = [
    "ISSUE",
    "PR",
    "REVIEW_OUTCOME",
    "AI_WORKFLOW_RUN",
    "COMMIT",
    "DIFF",
    "FILE",
    "RELEASE",
    "DEPLOYMENT",
    "FEATURE_FLAG",
    "INCIDENT",
];

export const COLUMN_GAP = 260;
/** Row pitch in px of a tall column: the smallest spacing that keeps a 10px label legible. */
export const MIN_ROW_GAP = 14;
/** Row pitch of a short column (rows spread out to fill the box, never more than this). */
export const MAX_ROW_GAP = 44;
/** Height of the chart box, and the margins the chart keeps around the drawing. */
export const BOX_HEIGHT = 580;
export const MARGIN_Y = 48;
export const MARGIN_LEFT = 56;
/** Room on the right for the last column's labels. */
export const MARGIN_RIGHT = 140;
/** Rows of the tallest column that fit the box without scrolling at the minimum pitch. */
export const FIT_ROWS = Math.floor((BOX_HEIGHT - 2 * MARGIN_Y) / MIN_ROW_GAP);
/** Width in px kept for a node label, on the right of its node. */
export const LABEL_WIDTH = MARGIN_RIGHT - 24;
/** Clear px between a bow and what is beside it (the canvas edge, or the labels of a column). */
export const BOW_PAD = 8;
/** How far a link inside one column bows, as a share of its length (ECharts `curveness`). */
export const INNER_LINK_CURVENESS = 0.45;
const SWEEPS = 4;

export type GraphMode = "layered" | "network";

/**
 * The ONE place that decides which mode a graph opens in. Layered while every column fits
 * the box without scrolling (`limit` rows); a taller graph opens in Network, production's
 * drawing. The mode switch is always available. Change the rule here only.
 */
export const defaultGraphMode = (
    columns: ReadonlyArray<{ count: number }>,
    limit: number = FIT_ROWS,
): GraphMode =>
    Math.max(0, ...columns.map((column) => column.count)) <= limit ? "layered" : "network";

export type LayoutNode = { id: string; type: WorkGraphNodeType };
export type LayoutLink = { source: string; target: string };

export type LayeredLayout = {
    /**
     * Columns left to right, with their node count. Empty columns are not listed. `bowRoom` is
     * the free width in px on the left of the column: to the canvas edge for the first column,
     * to the labels of the column before for the others. A link inside the column bows into it.
     */
    columns: Array<{ type: WorkGraphNodeType; count: number; x: number; bowRoom: number }>;
    /** True when a link joins two nodes of one column (for example issue to issue). */
    innerLinks: boolean;
    /** Coordinates per node id, in px inside the drawing area (margins are added by the chart). */
    positions: Map<string, { x: number; y: number }>;
    /** Height in px of the drawing area, and the row pitch used. */
    height: number;
    rowPitch: number;
    /** Node ids per column, top to bottom, after ordering. */
    order: Map<WorkGraphNodeType, string[]>;
};

const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function layoutLayered(
    nodes: LayoutNode[],
    links: LayoutLink[],
    options: { width?: number } = {},
): LayeredLayout {
    const typeOf = new Map(nodes.map((node) => [node.id, node.type]));
    const present = LAYERED_TYPE_ORDER.filter((type) => nodes.some((node) => node.type === type));

    // initial order inside a column: by id (stable and independent of input order)
    const order = new Map<WorkGraphNodeType, string[]>(
        present.map((type) => [
            type,
            nodes
                .filter((node) => node.type === type)
                .map((node) => node.id)
                .sort(byId),
        ]),
    );

    const neighbours = new Map<string, string[]>();
    for (const { source, target } of links) {
        if (!typeOf.has(source) || !typeOf.has(target)) continue;
        (neighbours.get(source) ?? neighbours.set(source, []).get(source)!).push(target);
        (neighbours.get(target) ?? neighbours.set(target, []).get(target)!).push(source);
    }

    const rank = () => {
        const out = new Map<string, number>();
        for (const ids of order.values()) {
            ids.forEach((id, index) =>
                out.set(id, ids.length > 1 ? index / (ids.length - 1) : 0.5),
            );
        }
        return out;
    };

    // barycenter sweeps: a node moves toward the mean position of its neighbours
    const sweep = (types: readonly WorkGraphNodeType[]) => {
        for (const type of types) {
            const ids = order.get(type) ?? [];
            const pos = rank();
            const key = new Map(
                ids.map((id, index) => {
                    const near = (neighbours.get(id) ?? []).filter((n) => typeOf.get(n) !== type);
                    const mean = near.length
                        ? near.reduce((sum, n) => sum + (pos.get(n) ?? 0.5), 0) / near.length
                        : (pos.get(id) ?? 0.5);
                    return [id, { mean, index }] as const;
                }),
            );
            ids.sort(
                (a, b) =>
                    key.get(a)!.mean - key.get(b)!.mean ||
                    key.get(a)!.index - key.get(b)!.index ||
                    byId(a, b),
            );
        }
    };
    const reversed = [...present].reverse();
    for (let i = 0; i < SWEEPS; i += 1) {
        sweep(present);
        sweep(reversed);
    }

    const tallest = Math.max(0, ...Array.from(order.values(), (ids) => ids.length));
    // A graph that fits the box spreads its rows out; a taller one keeps the minimum pitch and
    // the chart grows (the page scrolls inside its own area). Nothing is hidden or capped.
    const fits = tallest <= FIT_ROWS;
    const rowPitch = fits
        ? Math.min(MAX_ROW_GAP, (BOX_HEIGHT - 2 * MARGIN_Y) / Math.max(1, tallest))
        : MIN_ROW_GAP;
    const height = fits ? BOX_HEIGHT - 2 * MARGIN_Y : tallest * MIN_ROW_GAP;
    const usableWidth =
        options.width === undefined
            ? undefined
            : Math.max(0, options.width - MARGIN_LEFT - MARGIN_RIGHT);
    // A link between two nodes of ONE column is drawn as a bow beside the column. A graph with
    // such links needs room beside every column, so each column sits in the middle of its own
    // band of the width: the drawing is centred. A graph whose links all go between columns
    // keeps the columns edge to edge.
    const innerLinks = links.some(
        ({ source, target }) =>
            typeOf.has(source) && typeOf.has(target) && typeOf.get(source) === typeOf.get(target),
    );
    const columnX = (columnIndex: number) =>
        usableWidth === undefined
            ? columnIndex * COLUMN_GAP
            : innerLinks
              ? ((columnIndex + 0.5) * usableWidth) / present.length
              : present.length > 1
                ? (columnIndex * usableWidth) / (present.length - 1)
                : usableWidth / 2;
    const positions = new Map<string, { x: number; y: number }>();
    // The approved prototype spreads every column evenly over the height. That is right while a
    // column has a node on every screen. In a drawing that is taller than the box, a SHORT column
    // (its even spread would be wider than the widest row gap) had its few nodes far apart, with
    // none on the first screen. Such a column is placed after the others: a node that is linked
    // to other columns sits at the mean height of those linked nodes; the nodes with no such link
    // are listed from the top at the widest row gap (see `placeShortColumn`).
    const isShort = (count: number) => !fits && height / count > MAX_ROW_GAP;
    present.forEach((type, columnIndex) => {
        const ids = order.get(type) ?? [];
        if (isShort(ids.length)) return;
        const x = columnX(columnIndex);
        ids.forEach((id, index) => {
            positions.set(id, { x, y: ((index + 0.5) * height) / ids.length });
        });
    });
    // The longer short column first, so the next one finds it placed (ties: column order).
    present
        .map((type, columnIndex) => ({ type, columnIndex, ids: order.get(type) ?? [] }))
        .filter(({ ids }) => isShort(ids.length))
        .sort((a, b) => b.ids.length - a.ids.length || a.columnIndex - b.columnIndex)
        .forEach(({ type, columnIndex, ids }) => {
            const x = columnX(columnIndex);
            let listed = 0;
            const placed = placeShortColumn(
                ids.map((id, index) => {
                    // Linked nodes that have a place already. The nodes of this column have
                    // none yet, so a link inside the column moves no node.
                    const near = (neighbours.get(id) ?? [])
                        .map((other) => positions.get(other)?.y)
                        .filter((value): value is number => value !== undefined);
                    if (near.length) {
                        const sum = near.reduce((total, value) => total + value, 0);
                        return { id, index, wanted: sum / near.length };
                    }
                    // No linked node in another column: next in the list at the top.
                    listed += 1;
                    return { id, index, wanted: (listed - 0.5) * MAX_ROW_GAP };
                }),
                rowPitch,
                height,
            );
            placed.forEach(({ id, y }) => positions.set(id, { x, y }));
            // `order` lists a column top to bottom, as it is drawn
            order.set(
                type,
                placed.map(({ id }) => id),
            );
        });
    const columns = present.map((type, columnIndex) => {
        const ids = order.get(type) ?? [];
        const x = columnX(columnIndex);
        const bowRoom =
            columnIndex === 0
                ? MARGIN_LEFT + x - BOW_PAD
                : x - columnX(columnIndex - 1) - LABEL_WIDTH - BOW_PAD;
        return { type, count: ids.length, x, bowRoom: Math.max(0, bowRoom) };
    });

    return { columns, innerLinks, positions, order, height, rowPitch };
}

/**
 * Places for the nodes of a short column: each node as near as possible to the height it wants
 * (the mean height of its linked nodes), with at least `gap` px between two nodes and every node
 * inside the canvas. Nodes that want the same height become a group around that height.
 *
 * The result is top to bottom. Order: by the wanted height, then by the order the column had.
 * Method: with the nodes in that order, node i at w(i) + i * gap, where w is the non-decreasing
 * sequence nearest to wanted(i) - i * gap (pool adjacent violators), kept inside the canvas.
 */
export function placeShortColumn(
    nodes: Array<{ id: string; index: number; wanted: number }>,
    gap: number,
    height: number,
): Array<{ id: string; y: number }> {
    const sorted = [...nodes].sort((a, b) => a.wanted - b.wanted || a.index - b.index);
    // blocks of nodes that share one w: [sum of (wanted - i * gap), count]
    const blocks: Array<{ sum: number; count: number }> = [];
    sorted.forEach((node, i) => {
        blocks.push({ sum: node.wanted - i * gap, count: 1 });
        while (blocks.length > 1) {
            const last = blocks[blocks.length - 1];
            const before = blocks[blocks.length - 2];
            if (before.sum / before.count <= last.sum / last.count) break;
            before.sum += last.sum;
            before.count += last.count;
            blocks.pop();
        }
    });
    const lowest = gap / 2;
    const highest = Math.max(lowest, height - gap / 2 - (sorted.length - 1) * gap);
    const placed: Array<{ id: string; y: number }> = [];
    for (const block of blocks) {
        const w = Math.min(highest, Math.max(lowest, block.sum / block.count));
        for (let k = 0; k < block.count; k += 1) {
            const i = placed.length;
            placed.push({ id: sorted[i].id, y: w + i * gap });
        }
    }
    return placed;
}

/**
 * The ECharts `curveness` of a link between two rows of ONE column.
 *
 * - It always bows to the LEFT of the column: the node labels are on the right. ECharts puts the
 *   control point at (mid x) - (y1 - y2) * curveness, so the sign follows the link's direction.
 * - It never strays further than `room` px from the column (the peak of the curve is half of the
 *   control point's distance, curveness * length / 2), so a long link is a flat bow and no link
 *   leaves the canvas or crosses the labels of the column before.
 *
 * `sourceY` and `targetY` are the layout y of the two ends (y grows downward, as on screen).
 */
export function innerLinkCurveness(sourceY: number, targetY: number, room: number): number {
    const length = Math.abs(targetY - sourceY);
    if (length === 0 || room <= 0) return 0;
    const size = Math.min(INNER_LINK_CURVENESS, (2 * room) / length);
    return sourceY > targetY ? size : -size;
}

/** Number of link crossings between neighbouring columns (for tests and tuning). */
export function countCrossings(layout: LayeredLayout, links: LayoutLink[]): number {
    const where = new Map<string, { column: number; row: number }>();
    Array.from(layout.order.values()).forEach((ids, column) =>
        ids.forEach((id, row) => where.set(id, { column, row })),
    );
    const between = links
        .map(({ source, target }) => {
            const a = where.get(source);
            const b = where.get(target);
            if (!a || !b || a.column === b.column) return null;
            return a.column < b.column ? { from: a, to: b } : { from: b, to: a };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    let crossings = 0;
    for (let i = 0; i < between.length; i += 1) {
        for (let j = i + 1; j < between.length; j += 1) {
            const p = between[i];
            const q = between[j];
            if (p.from.column !== q.from.column || p.to.column !== q.to.column) continue;
            if ((p.from.row - q.from.row) * (p.to.row - q.to.row) < 0) crossings += 1;
        }
    }
    return crossings;
}
