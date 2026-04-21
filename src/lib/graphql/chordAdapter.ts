import type { ChordGroupingDimension, ChordRecord } from "@/lib/types";
import type { SankeyResult } from "./types";

/**
 * Backend limitation: the GraphQL Sankey compiler rejects duplicate dimensions in
 * `path` (for example `[TEAM, TEAM]`). When the hook needs same-dimension chord
 * data, it falls back to a two-hop query and projects the result back into a
 * same-dimension matrix before calling `adaptSankeyToChord`.
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

/**
 * Convert a SankeyResult payload into ChordRecord[] suitable for a chord chart
 * representing SAME-DIMENSION exchange (e.g. team↔team).
 *
 * Filters out edges where either endpoint's dimension != `grouping`.
 */
export function adaptSankeyToChord(
  sankey: ChordSankeyInput,
  grouping: ChordGroupingDimension
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

    const source = stripDimensionPrefix(sourceNode.label || sourceNode.id);
    const target = stripDimensionPrefix(targetNode.label || targetNode.id);

    return [
      {
        source,
        target,
        value: edge.value,
        metadata: {
          [metadataKey]: source,
        },
      },
    ];
  });
}
