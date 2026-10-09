import { parse, visit, type FieldNode } from "graphql";
import { describe, expect, it } from "vitest";

import { OPERATING_REVIEW_QUERY } from "../queries";

/** The scalar field names selected directly under `<field>`, in order. */
function fieldsOf(field: string): string[] {
    const names: string[] = [];
    visit(parse(OPERATING_REVIEW_QUERY), {
        Field(node: FieldNode) {
            if (node.name.value !== field) return;
            for (const selection of node.selectionSet?.selections ?? []) {
                if (selection.kind === "Field" && !selection.selectionSet) {
                    names.push(selection.name.value);
                }
            }
        },
    });
    return names;
}

// CHAOS-8115: the tiles say "No data" from the served flags, so the request asks for them. The
// request text is registered on the API side: a change here needs the new text registered there.
describe("OPERATING_REVIEW_QUERY", () => {
    it("asks whether the week holds a stored value for each metric, and for its scope", () => {
        // `scope`: whether the team selection narrows the metric (TEAM) or the value is the whole
        // organization's (ORGANIZATION). The web keeps no list of metric keys.
        expect(fieldsOf("metrics")).toEqual([
            "key",
            "label",
            "value",
            "unit",
            "hasData",
            "scope",
            "rateState",
        ]);
    });

    it("asks whether the prior week holds a stored value for each delta", () => {
        expect(fieldsOf("delta")).toEqual([
            "value",
            "priorValue",
            "absolute",
            "percent",
            "status",
            "hasPriorData",
        ]);
    });
});
