import { describe, expect, it } from "vitest";
import { WORK_GRAPH_EDGES_QUERY } from "../graphql/queries";
import type {
  WorkGraphEdge,
  WorkGraphEdgeFilterInput,
  WorkGraphEdgesResult,
  WorkGraphNodeType,
  WorkGraphEdgeType,
  WorkGraphProvenance,
} from "../graphql/types";

describe("Work Graph GraphQL", () => {
  describe("WORK_GRAPH_EDGES_QUERY", () => {
    it("exports the query string", () => {
      expect(typeof WORK_GRAPH_EDGES_QUERY).toBe("string");
      expect(WORK_GRAPH_EDGES_QUERY).toContain("query WorkGraphEdges");
      expect(WORK_GRAPH_EDGES_QUERY).toContain("workGraphEdges");
    });

    it("includes all edge fields", () => {
      const expectedFields = [
        "edgeId",
        "sourceType",
        "sourceId",
        "targetType",
        "targetId",
        "edgeType",
        "provenance",
        "confidence",
        "evidence",
        "repoId",
        "provider",
      ];
      for (const field of expectedFields) {
        expect(WORK_GRAPH_EDGES_QUERY).toContain(field);
      }
    });

    it("includes pagination fields", () => {
      expect(WORK_GRAPH_EDGES_QUERY).toContain("totalCount");
      expect(WORK_GRAPH_EDGES_QUERY).toContain("pageInfo");
      expect(WORK_GRAPH_EDGES_QUERY).toContain("hasNextPage");
    });
  });

  describe("types", () => {
    it("WorkGraphEdge has correct shape", () => {
      const edge: WorkGraphEdge = {
        edgeId: "edge-1",
        sourceType: "ISSUE",
        sourceId: "issue-123",
        targetType: "PR",
        targetId: "pr-456",
        edgeType: "FIXES",
        provenance: "NATIVE",
        confidence: 1.0,
        evidence: "Fixes #123",
        repoId: "repo-1",
        provider: "github",
      };
      expect(edge.edgeId).toBe("edge-1");
      expect(edge.confidence).toBe(1.0);
    });

    it("WorkGraphEdgeFilterInput accepts valid filters", () => {
      const filter: WorkGraphEdgeFilterInput = {
        repoIds: ["repo-1", "repo-2"],
        sourceType: "ISSUE",
        targetType: "PR",
        edgeType: "BLOCKS",
        nodeId: "node-123",
        limit: 100,
      };
      expect(filter.limit).toBe(100);
    });

    it("WorkGraphNodeType accepts valid values", () => {
      const types: WorkGraphNodeType[] = ["ISSUE", "PR", "COMMIT", "FILE"];
      expect(types).toHaveLength(4);
    });

    it("WorkGraphEdgeType accepts relationship values", () => {
      const edgeTypes: WorkGraphEdgeType[] = [
        "BLOCKS",
        "RELATES",
        "FIXES",
        "IMPLEMENTS",
        "CONTAINS",
        "TOUCHES",
      ];
      expect(edgeTypes.length).toBeGreaterThan(0);
    });

    it("WorkGraphProvenance accepts valid values", () => {
      const provenances: WorkGraphProvenance[] = [
        "NATIVE",
        "EXPLICIT_TEXT",
        "HEURISTIC",
      ];
      expect(provenances).toHaveLength(3);
    });

    it("WorkGraphEdgesResult has correct structure", () => {
      const result: WorkGraphEdgesResult = {
        edges: [],
        totalCount: 0,
        pageInfo: {
          hasNextPage: false,
          hasPreviousPage: false,
        },
      };
      expect(result.totalCount).toBe(0);
      expect(result.edges).toEqual([]);
    });
  });
});
