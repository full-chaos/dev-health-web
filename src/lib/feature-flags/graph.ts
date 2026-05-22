import type { WorkGraphEdge } from "@/lib/graphql/types";

export function getRegistryEdges(edges: WorkGraphEdge[]): WorkGraphEdge[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    if (
      edge.sourceType !== "FEATURE_FLAG" ||
      edge.targetType !== "FEATURE_FLAG" ||
      edge.edgeType !== "RELATES"
    ) {
      return false;
    }
    if (seen.has(edge.sourceId)) {
      return false;
    }
    seen.add(edge.sourceId);
    return true;
  });
}

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

export function parseToggleEvidence(evidence?: string | null): { ts: string; active: boolean } {
  if (!evidence) {
    return { ts: "", active: false };
  }
  const [ts = "", , state = evidence] = evidence.split("|");
  return { ts, active: !state.toLowerCase().includes("off") };
}
