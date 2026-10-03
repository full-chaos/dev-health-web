import { parse, visit, type FieldNode } from "graphql";
import { describe, expect, it } from "vitest";

import { AI_OPPORTUNITIES_QUERY } from "../queries";

/** The scalar field names selected under `aiOpportunities.recommendations`, in order. */
function recommendationFields(): string[] {
    const names: string[] = [];
    visit(parse(AI_OPPORTUNITIES_QUERY), {
        Field(node: FieldNode) {
            if (node.name.value !== "recommendations") return;
            for (const selection of node.selectionSet?.selections ?? []) {
                if (selection.kind === "Field") names.push(selection.name.value);
            }
        },
    });
    return names;
}

// CHAOS-8114: the list shows the served repository and team names, so the request asks for them.
// The request text is registered on the API side: a change here needs the new text registered there.
describe("AI_OPPORTUNITIES_QUERY", () => {
    it("asks for the repository and team names beside their ids", () => {
        expect(recommendationFields()).toEqual([
            "opportunityId",
            "kind",
            "repoId",
            "repoName",
            "teamId",
            "teamName",
            "title",
            "rationale",
            "score",
            "evidenceRefs",
            "workGraphDrilldowns",
        ]);
    });
});
