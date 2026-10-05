import { parse, visit, type FieldNode } from "graphql";
import { describe, expect, it } from "vitest";

import { TESTOPS_JOB_FAILURES_QUERY } from "../queries";

function fieldsOf(field: string): string[] {
    const names: string[] = [];
    visit(parse(TESTOPS_JOB_FAILURES_QUERY), {
        Field(node: FieldNode) {
            if (node.name.value !== field) return;
            for (const selection of node.selectionSet?.selections ?? []) {
                if (selection.kind === "Field") names.push(selection.name.value);
            }
        },
    });
    return names;
}

// CHAOS-8514: the request text is registered on the API side; a change here needs a new text there.
describe("TESTOPS_JOB_FAILURES_QUERY", () => {
    it("asks for the groups, the served total and the truncated flag", () => {
        expect(fieldsOf("testopsJobFailures")).toEqual(["groups", "totalCount", "truncated"]);
    });

    it("asks for the names, the two counts and the served rate of each group", () => {
        expect(fieldsOf("groups")).toEqual([
            "workflowName",
            "jobName",
            "provider",
            "runs",
            "failedRuns",
            "failureRate",
        ]);
    });
});
