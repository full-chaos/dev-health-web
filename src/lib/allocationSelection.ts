import { chartEntityLabel } from "@/lib/labels/entityLabel";
import { titleCase } from "@/lib/stringUtils";
import { computeSankeyMetrics } from "@/lib/sankey";
import type { SankeyLink, SankeyNode } from "@/lib/types";

/** The four kinds of entity a Sankey node can be. */
export type AllocationEntityKind = "team" | "theme" | "subcategory" | "repo";

export type SelectedEntity = { kind: AllocationEntityKind; name: string };

export const entityKindForGroup = (group: string | undefined): AllocationEntityKind | null => {
    switch (group) {
        case "team":
            return "team";
        case "category":
            return "theme";
        case "subcategory":
            return "subcategory";
        case "repo":
            return "repo";
        default:
            return null;
    }
};

/**
 * The label drawn on an Allocation Sankey node: a theme (group "category") as the page names it
 * ("Feature Delivery"), never the raw key ("feature_delivery"). Other nodes are unchanged.
 */
export const allocationNodeLabel = (label: string, group: string | undefined): string =>
    group === "category" ? titleCase(label) : label;

/**
 * Filter a flow to ONE entity: the node, every link that touches it, and the nodes at the
 * other end of those links. One hop, so every value shown is exact (a link's value is the
 * flow between those two entities; a longer path would carry flow that does not pass through
 * the selected node). Same idea as the hover emphasis, kept instead of dimmed.
 */
export const filterSankeyToEntity = <T extends { nodes: SankeyNode[]; links: SankeyLink[] }>(
    flow: T | null,
    name: string | null,
): T | null => {
    if (!flow || !name || !flow.nodes.some((node) => node.name === name)) return flow;
    const links = flow.links.filter((link) => link.source === name || link.target === name);
    const keep = new Set<string>([name]);
    links.forEach((link) => {
        keep.add(link.source);
        keep.add(link.target);
    });
    return { ...flow, nodes: flow.nodes.filter((node) => keep.has(node.name)), links };
};

export type SelectedPathNumbers = {
    /** Effort allocated to the entity, in the flow's own unit. */
    allocated: number;
    /** Share (0-100) of the base flow's total; null when the base total is 0. */
    share: number | null;
    /** The same share in the baseline flow; null when there is no baseline to read. */
    baselineShare: number | null;
    /** share - baselineShare in percentage points; null unless both exist. */
    changePp: number | null;
};

type FlowLike = { nodes: SankeyNode[]; links: SankeyLink[] } | null | undefined;

const shareOf = (flow: FlowLike, name: string): number | null => {
    if (!flow) return null;
    const metrics = computeSankeyMetrics(flow.nodes, flow.links);
    if (!(metrics.totalFlow > 0)) return null;
    return ((metrics.nodeValueByName.get(name) ?? 0) / metrics.totalFlow) * 100;
};

/**
 * Numbers for the "Selected path" panel, read from flows the page already holds. `base` is
 * the flow the share is measured against (its own total); `baseline` is the previous-period
 * flow cut the same way, or null where the view has none (never a measured zero).
 */
export const computeSelectedPath = ({
    base,
    baseline,
    name,
}: {
    base: FlowLike;
    baseline: FlowLike;
    name: string;
}): SelectedPathNumbers | null => {
    if (!base) return null;
    const metrics = computeSankeyMetrics(base.nodes, base.links);
    if (!base.nodes.some((node) => node.name === name)) return null;
    const share = shareOf(base, name);
    const baselineShare = shareOf(baseline, name);
    return {
        allocated: metrics.nodeValueByName.get(name) ?? 0,
        share,
        baselineShare,
        changePp: share !== null && baselineShare !== null ? share - baselineShare : null,
    };
};

/**
 * The node a chart click names. The chart reports the node's DISPLAY name (a path-like
 * "owner/repo" is shortened to its last segment), so match the exact name first and the
 * displayed name second.
 */
export const findClickedNode = (nodes: SankeyNode[], clickedName: string | undefined) => {
    if (!clickedName) return undefined;
    return (
        nodes.find((node) => node.name === clickedName) ??
        nodes.find((node) => chartEntityLabel(node.name) === clickedName)
    );
};
