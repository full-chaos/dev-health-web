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
