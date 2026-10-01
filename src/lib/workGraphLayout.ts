import type { WorkGraphNodeType } from "@/lib/graphql/types";

/**
 * Layered (column) layout for the Work Graph. Pure and deterministic: the same nodes and
 * links always give the same columns and order. A layout only, never a metric: it uses the
 * persisted edges the page already holds and adds nothing to the data.
 *
 * Columns follow the entity types that are PRESENT, in this fixed order (a type with no
 * node gets no column). Work flows left to right: work item, change, review, code, release.
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
    /** Columns left to right, with their node count. Empty columns are not listed. */
    columns: Array<{ type: WorkGraphNodeType; count: number; x: number }>;
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
    const positions = new Map<string, { x: number; y: number }>();
    const columns = present.map((type, columnIndex) => {
        const ids = order.get(type) ?? [];
        const x =
            usableWidth === undefined
                ? columnIndex * COLUMN_GAP
                : present.length > 1
                  ? (columnIndex * usableWidth) / (present.length - 1)
                  : usableWidth / 2;
        ids.forEach((id, index) => {
            positions.set(id, { x, y: ((index + 0.5) * height) / ids.length });
        });
        return { type, count: ids.length, x };
    });

    return { columns, positions, order, height, rowPitch };
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
