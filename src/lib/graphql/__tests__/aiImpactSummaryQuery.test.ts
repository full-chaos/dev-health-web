import { parse, visit, type FieldNode } from "graphql";
import { describe, expect, it } from "vitest";

import { AI_IMPACT_SUMMARY_QUERY } from "../queries";

/** The field names selected directly under `aiImpactSummary.<field>`. */
function fieldsOf(field: string): string[] {
    const names: string[] = [];
    visit(parse(AI_IMPACT_SUMMARY_QUERY), {
        Field(node: FieldNode) {
            if (node.name.value !== field) return;
            for (const selection of node.selectionSet?.selections ?? []) {
                if (selection.kind === "Field") names.push(selection.name.value);
            }
        },
    });
    return names;
}

// CHAOS-7983: the agent-created trend labels each point with its served date, so the request asks
// for `day` on the daily rows. The request text is registered on the API side: a change here needs
// the new text registered there.
describe("AI_IMPACT_SUMMARY_QUERY", () => {
    it("asks for the day of each daily row", () => {
        expect(fieldsOf("daily")).toContain("day");
    });

    it("asks for the bucket and the pull request count the trend reads", () => {
        expect(fieldsOf("daily")).toEqual(expect.arrayContaining(["bucket", "prsTotal", "day"]));
    });

    it("does not ask for a day on the per-bucket totals (they have none)", () => {
        expect(fieldsOf("byBucket")).not.toContain("day");
    });
});
