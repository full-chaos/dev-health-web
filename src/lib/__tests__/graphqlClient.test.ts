import { describe, expect, it } from "vitest";
import { runtimeConfig } from "../runtimeConfig";
import { graphqlFetch } from "../graphql/urqlClient";
import { adaptSankeyResult } from "../graphql/investmentFetchers";
import type { SankeyResult } from "../graphql/types";

describe("runtimeConfig.useGraphQLAnalytics", () => {
    describe("feature flag", () => {
        it("returns true by default", () => {
            const originalUse = process.env.USE_GRAPHQL_ANALYTICS;
            const originalPublic = process.env.NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS;
            delete process.env.USE_GRAPHQL_ANALYTICS;
            delete process.env.NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS;
            try {
                expect(runtimeConfig.useGraphQLAnalytics()).toBe(true);
            } finally {
                if (originalUse === undefined) {
                    delete process.env.USE_GRAPHQL_ANALYTICS;
                } else {
                    process.env.USE_GRAPHQL_ANALYTICS = originalUse;
                }
                if (originalPublic === undefined) {
                    delete process.env.NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS;
                } else {
                    process.env.NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS = originalPublic;
                }
            }
        });

        it("returns false when explicitly disabled", () => {
            const original = process.env.NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS;
            process.env.NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS = "false";
            try {
                expect(runtimeConfig.useGraphQLAnalytics()).toBe(false);
            } finally {
                if (original === undefined) {
                    delete process.env.NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS;
                } else {
                    process.env.NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS = original;
                }
            }
        });

        it("returns true when USE_GRAPHQL_ANALYTICS is enabled", () => {
            const original = process.env.USE_GRAPHQL_ANALYTICS;
            process.env.USE_GRAPHQL_ANALYTICS = "true";
            try {
                expect(runtimeConfig.useGraphQLAnalytics()).toBe(true);
            } finally {
                if (original === undefined) {
                    delete process.env.USE_GRAPHQL_ANALYTICS;
                } else {
                    process.env.USE_GRAPHQL_ANALYTICS = original;
                }
            }
        });

        it("falls back to NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS when set", () => {
            const originalUse = process.env.USE_GRAPHQL_ANALYTICS;
            const originalPublic = process.env.NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS;
            delete process.env.USE_GRAPHQL_ANALYTICS;
            process.env.NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS = "true";
            try {
                expect(runtimeConfig.useGraphQLAnalytics()).toBe(true);
            } finally {
                if (originalUse === undefined) {
                    delete process.env.USE_GRAPHQL_ANALYTICS;
                } else {
                    process.env.USE_GRAPHQL_ANALYTICS = originalUse;
                }
                if (originalPublic === undefined) {
                    delete process.env.NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS;
                } else {
                    process.env.NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS = originalPublic;
                }
            }
        });
    });

    describe("graphqlFetch", () => {
        it("exports the server fetch function", () => {
            expect(typeof graphqlFetch).toBe("function");
        });
    });
});

describe("investmentFetchers", () => {
    describe("adaptSankeyResult", () => {
        it("maps THEME to category and other dimensions to lowercase", () => {
            const mockGqlSankey: SankeyResult = {
                nodes: [
                    { id: "1", label: "Team A", dimension: "TEAM", value: 100 },
                    { id: "2", label: "Theme B", dimension: "THEME", value: 100 },
                    { id: "3", label: "Sub C", dimension: "SUBCATEGORY", value: 100 },
                    { id: "4", label: "Repo D", dimension: "REPO", value: 100 },
                ],
                edges: [
                    { source: "1", target: "2", value: 100 }
                ]
            };

            const result = adaptSankeyResult(mockGqlSankey, "investment");

            expect(result.nodes[0].group).toBe("team");
            expect(result.nodes[1].group).toBe("category");
            expect(result.nodes[2].group).toBe("subcategory");
            expect(result.nodes[3].group).toBe("repo");
        });

        it("handles empty node labels by providing fallback", () => {
            const mockGqlSankey: SankeyResult = {
                nodes: [
                    { id: "1", label: "", dimension: "TEAM", value: 100 },
                ],
                edges: []
            };

            const result = adaptSankeyResult(mockGqlSankey, "investment");
            expect(result.nodes[0].name).toBe("(Unassigned team)");
        });

        it("handles undefined input by returning empty structure", () => {
            const result = adaptSankeyResult(undefined, "investment");
            expect(result.nodes).toEqual([]);
            expect(result.links).toEqual([]);
        });

        it("maps edge ids to node names for link parity", () => {
            const mockGqlSankey: SankeyResult = {
                nodes: [
                    { id: "TEAM:Unassigned", label: "Unassigned", dimension: "TEAM", value: 100 },
                    { id: "REPO:acme/demo", label: "acme/demo", dimension: "REPO", value: 100 },
                ],
                edges: [
                    { source: "REPO:acme/demo", target: "TEAM:Unassigned", value: 100 }
                ]
            };

            const result = adaptSankeyResult(mockGqlSankey, "investment");
            expect(result.links[0]?.source).toBe("acme/demo");
            expect(result.links[0]?.target).toBe("Unassigned");
        });

        it("formats subcategory labels to match UI conventions", () => {
            const mockGqlSankey: SankeyResult = {
                nodes: [
                    { id: "SUBCATEGORY:quality.code_review", label: "quality.code_review", dimension: "SUBCATEGORY", value: 100 },
                ],
                edges: []
            };

            const result = adaptSankeyResult(mockGqlSankey, "investment");
            expect(result.nodes[0]?.name).toBe("Quality · Code Review");
        });
    });
});
