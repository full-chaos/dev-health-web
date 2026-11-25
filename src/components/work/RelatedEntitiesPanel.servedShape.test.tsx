import { describe, expect, it } from "vitest";
import { render, screen } from "@/test/utils";
import { RelatedEntitiesPanel } from "./RelatedEntitiesPanel";
import type { AIWorkflowDrilldownResult } from "@/lib/graphql/types";

const investment = {
    workUnitId: "repo-1:7",
    themeDistribution: {},
    subcategoryDistribution: {},
    evidenceQuotes: [],
    uncertainty: "",
};

const drilldown = (edges: AIWorkflowDrilldownResult["edges"]): AIWorkflowDrilldownResult => ({
    orgId: "org",
    rootType: "PR",
    rootId: "repo-1:7",
    nodes: [],
    edges,
    partial: false,
    dataAvailable: edges.length > 0,
});

describe("RelatedEntitiesPanel on the node types ops serves", () => {
    it("lists a related deployment when ops serves lowercase pr / deployment (workflow.go)", () => {
        render(
            <RelatedEntitiesPanel
                rootType="PR"
                rootId="repo-1:7"
                investment={investment}
                drilldown={drilldown([
                    {
                        edgeId: "pr_deployment:1",
                        sourceType: "pr",
                        sourceId: "repo-1:7",
                        targetType: "deployment",
                        targetId: "dep-1",
                        edgeType: "deploys",
                        confidence: 0.9,
                        source: "synthetic",
                        evidence: "synthetic evidence",
                    },
                ])}
            />,
        );
        expect(screen.queryByText("No data for related entities.")).not.toBeInTheDocument();
        expect(screen.getByText("Deployments")).toBeInTheDocument();
    });

    it("links a related deployment with the repo-prefixed id the flame route needs (flame.go:170-184)", () => {
        render(
            <RelatedEntitiesPanel
                rootType="PR"
                rootId="repo-1:7"
                investment={investment}
                drilldown={drilldown([
                    {
                        edgeId: "pr_deployment:2",
                        sourceType: "pr",
                        sourceId: "repo-1:7",
                        targetType: "deployment",
                        targetId: "dep-1",
                        edgeType: "deploys",
                        confidence: 0.9,
                        source: "synthetic",
                        evidence: "synthetic evidence",
                        repoId: "repo-1",
                    },
                ])}
            />,
        );
        const link = screen.getByRole("link", { name: /dep-1/ });
        expect(link.getAttribute("href")).toBe("/deployments/repo-1:dep-1");
    });

    it("links an issue-to-issue edge to the other issue, not the root", () => {
        render(
            <RelatedEntitiesPanel
                rootType="ISSUE"
                rootId="PROJ-102"
                investment={investment}
                drilldown={drilldown([
                    {
                        edgeId: "issue_issue:1",
                        sourceType: "issue",
                        sourceId: "PROJ-102",
                        targetType: "issue",
                        targetId: "PROJ-101",
                        edgeType: "blocks",
                        confidence: 0.9,
                        source: "synthetic",
                        evidence: "synthetic evidence",
                    },
                ])}
            />,
        );
        expect(screen.getByRole("link", { name: /PROJ-101/ }).getAttribute("href")).toBe(
            "/issues/PROJ-101",
        );
    });

    it("keeps an edge whose related type has no named section", () => {
        render(
            <RelatedEntitiesPanel
                rootType="PR"
                rootId="repo-1:7"
                investment={investment}
                drilldown={drilldown([
                    {
                        edgeId: "pr_run:1",
                        sourceType: "pr",
                        sourceId: "repo-1:7",
                        targetType: "ai_workflow_run",
                        targetId: "run-1",
                        edgeType: "has_ai_workflow",
                        confidence: 0.9,
                        source: "synthetic",
                        evidence: "synthetic evidence",
                    },
                ])}
            />,
        );
        expect(screen.getByText("synthetic evidence")).toBeInTheDocument();
    });

    it("control: no edges keeps the empty state", () => {
        render(
            <RelatedEntitiesPanel
                rootType="PR"
                rootId="repo-1:7"
                investment={investment}
                drilldown={drilldown([])}
            />,
        );
        expect(screen.getByText("No data for related entities.")).toBeInTheDocument();
    });
});
