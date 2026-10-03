import { parse, visit, type FieldNode } from "graphql";
import { describe, expect, it } from "vitest";

import { AI_WORKFLOW_DRILLDOWN_QUERY } from "../queries";

/** The field names selected under `aiWorkflowDrilldown.<field>`, in order. */
function fieldsOf(field: string): string[] {
    const names: string[] = [];
    visit(parse(AI_WORKFLOW_DRILLDOWN_QUERY), {
        Field(node: FieldNode) {
            if (node.name.value !== field) return;
            for (const selection of node.selectionSet?.selections ?? []) {
                if (selection.kind === "Field") names.push(selection.name.value);
            }
        },
    });
    return names;
}

// CHAOS-8113: the evidence rows name each edge end by the served displayName of its node, so the
// request asks for it. The request text is registered on the API side: a change here needs the new
// text registered there.
describe("AI_WORKFLOW_DRILLDOWN_QUERY", () => {
    it("asks for the type, id and display name of each node", () => {
        expect(fieldsOf("nodes")).toEqual(["nodeType", "nodeId", "displayName"]);
    });

    it("asks for no name on the edges: an edge end is named by its node", () => {
        expect(fieldsOf("edges")).not.toContain("displayName");
        expect(fieldsOf("edges")).toEqual(
            expect.arrayContaining(["sourceType", "sourceId", "targetType", "targetId"]),
        );
    });
});
