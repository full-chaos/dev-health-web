import { describe, expect, it } from "vitest";
import type { WorkGraphEdge } from "@/lib/graphql/types";
import { getDistinctSourceIds, getRegistryEdges, parseToggleEvidence } from "../graph";

function makeEdge(overrides: Partial<WorkGraphEdge>): WorkGraphEdge {
  return {
    edgeId: overrides.edgeId ?? "edge-1",
    sourceType: overrides.sourceType ?? "FEATURE_FLAG",
    sourceId: overrides.sourceId ?? "flag-1",
    targetType: overrides.targetType ?? "FEATURE_FLAG",
    targetId: overrides.targetId ?? "flag-1",
    edgeType: overrides.edgeType ?? "RELATES",
    provenance: overrides.provenance ?? "NATIVE",
    confidence: overrides.confidence ?? 1,
    evidence: overrides.evidence ?? "flag:launchdarkly/default/checkout-redesign",
    repoId: overrides.repoId ?? undefined,
    provider: overrides.provider ?? "launchdarkly",
  };
}

describe("feature flag fetcher helpers", () => {
  it("keeps one registry edge per flag identity", () => {
    const registryEdges = getRegistryEdges([
      makeEdge({ edgeId: "registry-1", sourceId: "flag-a" }),
      makeEdge({ edgeId: "registry-2", sourceId: "flag-a" }),
      makeEdge({ edgeId: "pr-link", sourceId: "flag-a", targetType: "PR", targetId: "repo#pr1", edgeType: "REFERENCES" }),
      makeEdge({ edgeId: "registry-3", sourceId: "flag-b", targetId: "flag-b" }),
    ]);

    expect(registryEdges.map((edge) => edge.sourceId)).toEqual(["flag-a", "flag-b"]);
  });

  it("parses toggle evidence into timestamp and active state", () => {
    expect(parseToggleEvidence("2026-04-15T10:15:00Z|toggle|on")).toEqual({
      ts: "2026-04-15T10:15:00Z",
      active: true,
    });
    expect(parseToggleEvidence("2026-04-16T08:00:00Z|toggle|off")).toEqual({
      ts: "2026-04-16T08:00:00Z",
      active: false,
    });
  });

  it("counts distinct release sources for impact coverage", () => {
    const edges = [
      makeEdge({ sourceType: "RELEASE", sourceId: "release-a", targetType: "RELEASE", targetId: "release-a", edgeType: "RELATES" }),
      makeEdge({ edgeId: "impact-a-1", sourceType: "RELEASE", sourceId: "release-a", targetType: "FEATURE_FLAG", targetId: "flag-a", edgeType: "IMPACTS" }),
      makeEdge({ edgeId: "impact-a-2", sourceType: "RELEASE", sourceId: "release-a", targetType: "FEATURE_FLAG", targetId: "flag-b", edgeType: "IMPACTS" }),
      makeEdge({ edgeId: "release-b", sourceType: "RELEASE", sourceId: "release-b", targetType: "RELEASE", targetId: "release-b", edgeType: "RELATES" }),
    ];

    expect(getDistinctSourceIds(edges).size).toBe(2);
    expect(getDistinctSourceIds(edges, "IMPACTS").size).toBe(1);
  });
});
