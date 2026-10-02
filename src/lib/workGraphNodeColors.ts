import type { WorkGraphNodeType } from "@/lib/graphql/types";

/**
 * Node-type colors of the Work Graph: an index into the theme series colors
 * (`--chart-color-<index + 1>`), or the negative status role. The explorer draws the nodes
 * with this map and the node detail panel draws its dot with it, so a dot is its node's color.
 */
export const NODE_TYPE_COLOR_SOURCE: Record<WorkGraphNodeType, number | "negative"> = {
    ISSUE: 1,
    PR: 0,
    COMMIT: 5,
    FILE: 8,
    RELEASE: 3,
    FEATURE_FLAG: 4,
    AI_WORKFLOW_RUN: 9,
    DIFF: 6,
    REVIEW_OUTCOME: 7,
    DEPLOYMENT: 2,
    INCIDENT: "negative",
};

// Literal class names, so Tailwind finds them.
const SERIES_DOT = [
    "bg-(--chart-color-1)",
    "bg-(--chart-color-2)",
    "bg-(--chart-color-3)",
    "bg-(--chart-color-4)",
    "bg-(--chart-color-5)",
    "bg-(--chart-color-6)",
    "bg-(--chart-color-7)",
    "bg-(--chart-color-8)",
    "bg-(--chart-color-9)",
    "bg-(--chart-color-10)",
] as const;

/** Background class of a node type's dot: the same theme color the explorer draws the node in. */
export function nodeTypeDotClass(type: WorkGraphNodeType): string {
    const source = NODE_TYPE_COLOR_SOURCE[type];
    return source === "negative" ? "bg-(--negative)" : SERIES_DOT[source];
}
