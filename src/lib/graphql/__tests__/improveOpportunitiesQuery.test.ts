import { parse, visit, type FieldNode } from "graphql";
import { describe, expect, it } from "vitest";

import { IMPROVE_OPPORTUNITIES_QUERY } from "../queries";

/** The field names selected under `improveOpportunities.opportunities`, in order. */
function opportunityFields(): string[] {
    const names: string[] = [];
    visit(parse(IMPROVE_OPPORTUNITIES_QUERY), {
        Field(node: FieldNode) {
            if (node.name.value !== "opportunities") return;
            for (const selection of node.selectionSet?.selections ?? []) {
                if (selection.kind === "Field") names.push(selection.name.value);
            }
        },
    });
    return names;
}

// CHAOS-8500: the Automations table shows the rule's own numbers, so the request asks for them.
// The request text is registered on the API side: a change here needs the new text registered there.
describe("IMPROVE_OPPORTUNITIES_QUERY", () => {
    it("asks for the served value, threshold, unit and thresholdDirection of each opportunity", () => {
        expect(opportunityFields()).toEqual([
            "opportunityId",
            "kind",
            "entityType",
            "entityId",
            "title",
            "rationale",
            "score",
            "severity",
            "evidenceRefs",
            "recommendedAction",
            "value",
            "threshold",
            "unit",
            "thresholdDirection",
        ]);
    });
});
