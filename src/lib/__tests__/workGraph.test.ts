import { describe, expect, it } from "vitest";
import { AI_WORKFLOW_DRILLDOWN_QUERY, WORK_GRAPH_EDGES_QUERY } from "../graphql/queries";
import type {
    AIWorkflowDrilldownResult,
    InvestmentSubcategory,
    InvestmentTheme,
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

    describe("AI_WORKFLOW_DRILLDOWN_QUERY", () => {
        it("exports a schema-valid drilldown query", () => {
            expect(AI_WORKFLOW_DRILLDOWN_QUERY).toContain("query AIWorkflowDrilldown");
            expect(AI_WORKFLOW_DRILLDOWN_QUERY).toContain("aiWorkflowDrilldown");
            expect(AI_WORKFLOW_DRILLDOWN_QUERY).toContain("source");
            expect(AI_WORKFLOW_DRILLDOWN_QUERY).not.toContain("provenance");
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

        it("WorkGraphNodeType includes Story Loop entities", () => {
            const types: WorkGraphNodeType[] = ["REVIEW_OUTCOME", "DEPLOYMENT", "INCIDENT"];
            expect(types).toContain("DEPLOYMENT");
        });

        it("WorkGraphEdgeType accepts relationship values", () => {
            const edgeTypes: WorkGraphEdgeType[] = [
                "BLOCKS",
                "RELATES",
                "FIXES",
                "IMPLEMENTS",
                "CONTAINS",
                "TOUCHES",
                "HAS_REVIEW_OUTCOME",
                "DEPLOYS",
                "LINKED_INCIDENT",
            ];
            expect(edgeTypes.length).toBeGreaterThan(0);
        });

        it("investment taxonomy mirrors the compute-time schema", () => {
            const themes: InvestmentTheme[] = [
                "feature_delivery",
                "operational",
                "maintenance",
                "quality",
                "risk",
            ];
            const subcategories: InvestmentSubcategory[] = [
                "feature_delivery.customer",
                "operational.incident_response",
                "risk.vulnerability",
            ];
            expect(themes).toHaveLength(5);
            expect(subcategories).toContain("feature_delivery.customer");
        });

        it("AIWorkflowDrilldownResult exposes evidence source and graph nodes", () => {
            const drilldown: AIWorkflowDrilldownResult = {
                orgId: "org-1",
                rootType: "PR",
                rootId: "PR-1",
                partial: false,
                dataAvailable: true,
                nodes: [{ nodeType: "PR", nodeId: "PR-1" }],
                edges: [
                    {
                        edgeId: "edge-1",
                        sourceType: "PR",
                        sourceId: "PR-1",
                        targetType: "DEPLOYMENT",
                        targetId: "deploy-1",
                        edgeType: "DEPLOYS",
                        confidence: 0.9,
                        source: "native",
                        evidence: "deploy evidence",
                    },
                ],
            };
            expect(drilldown.edges[0]?.source).toBe("native");
        });

        it("WorkGraphProvenance accepts valid values", () => {
            const provenances: WorkGraphProvenance[] = ["NATIVE", "EXPLICIT_TEXT", "HEURISTIC"];
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
