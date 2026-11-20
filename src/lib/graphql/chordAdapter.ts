import type { ChordGroupingDimension, ChordRecord } from "@/lib/types";
import {
    UNASSIGNED_REPO_LABEL,
    UNASSIGNED_TEAM_LABEL,
    UNASSIGNED_WORK_TYPE_LABEL,
} from "@/lib/investment/transforms";
import type { SankeyResult } from "./types";

/**
 * Adapts a same-dimension flow payload (nodes + edges) into ChordRecord[].
 * Input typically comes from the `analytics.flowMatrix` resolver, which
 * returns directional N×N edges where source and target share one dimension.
 * Reuses SankeyResult's nodes/edges shape so the same adapter can consume
 * either resolver.
 */

type ChordSankeyInput = Pick<SankeyResult, "nodes" | "edges">;

const METADATA_KEY_BY_GROUPING = {
    team: "team",
    repo: "repo",
    work_type: "workType",
} as const;

/**
 * Strip the "dim:" prefix from a prefixed ID. "team:Engineering" → "Engineering".
 * Returns the input unchanged if no colon.
 */
export function stripDimensionPrefix(id: string): string {
    const separatorIndex = id.indexOf(":");
    return separatorIndex === -1 ? id : id.slice(separatorIndex + 1).trim();
}

const UNASSIGNED_LABEL_BY_GROUPING: Partial<Record<ChordGroupingDimension, string>> = {
    team: UNASSIGNED_TEAM_LABEL,
    repo: UNASSIGNED_REPO_LABEL,
    work_type: UNASSIGNED_WORK_TYPE_LABEL,
};

function chordNodeName(
    node: { id: string; label?: string | null },
    grouping: ChordGroupingDimension,
): string {
    const name = stripDimensionPrefix(node.label || node.id);
    return name || (UNASSIGNED_LABEL_BY_GROUPING[grouping] ?? name);
}

/**
 * Convert a SankeyResult payload into ChordRecord[] suitable for a chord chart
 * representing SAME-DIMENSION exchange (e.g. team↔team).
 *
 * Filters out edges where either endpoint's dimension != `grouping`.
 */
export function adaptSankeyToChord(
    sankey: ChordSankeyInput,
    grouping: ChordGroupingDimension,
): ChordRecord[] {
    const nodesById = new Map(sankey.nodes.map((node) => [node.id, node]));
    const metadataKey = METADATA_KEY_BY_GROUPING[grouping];

    return sankey.edges.flatMap((edge) => {
        const sourceNode = nodesById.get(edge.source);
        const targetNode = nodesById.get(edge.target);

        if (!sourceNode || !targetNode) {
            return [];
        }

        if (
            sourceNode.dimension.toLowerCase() !== grouping ||
            targetNode.dimension.toLowerCase() !== grouping
        ) {
            return [];
        }

        const sourceLabel = chordNodeName(sourceNode, grouping);
        const targetLabel = chordNodeName(targetNode, grouping);

        return [
            {
                source: sourceNode.id,
                target: targetNode.id,
                sourceLabel,
                targetLabel,
                value: edge.value,
                metadata: {
                    [metadataKey]: sourceLabel,
                },
            },
        ];
    });
}
