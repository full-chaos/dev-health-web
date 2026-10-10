import type { WorkGraphNodeType } from "@/lib/graphql/types";
import { FIT_ROWS } from "@/lib/workGraphLayout";

/** A column taller than this many rows is shown as one bucket until it is opened. */
export const BUCKET_THRESHOLD = FIT_ROWS;

export const BUCKET_PREFIX = "bucket:";
export const bucketId = (type: WorkGraphNodeType) => `${BUCKET_PREFIX}${type}`;
export const isBucketId = (id: string) => id.startsWith(BUCKET_PREFIX);
export const bucketType = (id: string) => id.slice(BUCKET_PREFIX.length) as WorkGraphNodeType;

type BucketNode = { id: string; type: WorkGraphNodeType };
type BucketLink = { source: string; target: string };

/** Types whose column is over the threshold. Display grouping only: it adds no relation. */
export function bucketableTypes<N extends BucketNode>(
    nodes: readonly N[],
    threshold: number = BUCKET_THRESHOLD,
): Set<WorkGraphNodeType> {
    const counts = new Map<WorkGraphNodeType, number>();
    for (const node of nodes) counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
    return new Set(
        Array.from(counts).flatMap(([type, count]) => (count > threshold ? [type] : [])),
    );
}

export type BucketedGraph<N extends BucketNode, L extends BucketLink> = {
    nodes: Array<N | { id: string; type: WorkGraphNodeType; bucketCount: number }>;
    /** Links with an end in a bucket are merged per (source, target, edge type); `count` = served links merged. */
    links: Array<L & { count: number }>;
    /** Member count per collapsed bucket. */
    buckets: Map<WorkGraphNodeType, number>;
    /** Served links with both ends inside one collapsed bucket (not drawn). */
    hiddenInnerLinks: number;
};

/**
 * Collapse every column in `collapsible` that is not in `expanded` into one bucket node.
 * Edges come from the served links only; a link to a collapsed member is moved to its bucket
 * and merged with the others between the same two ends.
 */
export function bucketGraph<N extends BucketNode, L extends BucketLink & { edgeType?: string }>(
    nodes: readonly N[],
    links: readonly L[],
    collapsible: ReadonlySet<WorkGraphNodeType>,
    expanded: ReadonlySet<WorkGraphNodeType>,
    makeBucket: (
        type: WorkGraphNodeType,
        count: number,
    ) => { id: string; type: WorkGraphNodeType; bucketCount: number },
): BucketedGraph<N, L> {
    const collapsed = new Set(Array.from(collapsible).filter((type) => !expanded.has(type)));
    const typeOf = new Map(nodes.map((node) => [node.id, node.type]));
    const buckets = new Map<WorkGraphNodeType, number>();
    const outNodes: BucketedGraph<N, L>["nodes"] = [];
    for (const node of nodes) {
        if (!collapsed.has(node.type)) {
            outNodes.push(node);
        } else {
            buckets.set(node.type, (buckets.get(node.type) ?? 0) + 1);
        }
    }
    for (const [type, count] of buckets) outNodes.push(makeBucket(type, count));

    const end = (id: string) => {
        const type = typeOf.get(id);
        return type !== undefined && collapsed.has(type) ? bucketId(type) : id;
    };
    const merged = new Map<string, L & { count: number }>();
    let hiddenInnerLinks = 0;
    for (const link of links) {
        const source = end(link.source);
        const target = end(link.target);
        if (source === target && isBucketId(source)) {
            hiddenInnerLinks += 1;
            continue;
        }
        const touchesBucket = source !== link.source || target !== link.target;
        const key = touchesBucket
            ? `${source}\u0000${target}\u0000${link.edgeType ?? ""}`
            : `${link.source}\u0000${link.target}\u0000${link.edgeType ?? ""}\u0000${merged.size}`;
        const seen = merged.get(key);
        if (seen) seen.count += 1;
        else merged.set(key, { ...link, source, target, count: 1 });
    }
    return { nodes: outNodes, links: Array.from(merged.values()), buckets, hiddenInnerLinks };
}
