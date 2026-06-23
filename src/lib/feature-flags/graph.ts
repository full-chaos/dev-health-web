import type { WorkGraphEdge } from "@/lib/graphql/types";

export function getDistinctSourceIds(
    edges: WorkGraphEdge[],
    edgeType?: WorkGraphEdge["edgeType"],
): Set<string> {
    return new Set(
        edges
            .filter((edge) => (edgeType ? edge.edgeType === edgeType : true))
            .map((edge) => edge.sourceId)
            .filter(Boolean),
    );
}
