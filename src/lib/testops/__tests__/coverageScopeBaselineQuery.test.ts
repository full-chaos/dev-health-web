import { parse, print, visit, type FieldNode, type VariableDefinitionNode } from "graphql";
import { describe, expect, it } from "vitest";

import { TESTOPS_COVERAGE_SCOPE_BASELINE_QUERY } from "../queries";

const document = () => parse(TESTOPS_COVERAGE_SCOPE_BASELINE_QUERY);

function fieldsOf(field: string): string[] {
    const names: string[] = [];
    visit(document(), {
        Field(node: FieldNode) {
            if (node.name.value !== field) return;
            for (const selection of node.selectionSet?.selections ?? []) {
                if (selection.kind === "Field") names.push(selection.name.value);
            }
        },
    });
    return names;
}

function variables(): Record<string, string> {
    const out: Record<string, string> = {};
    visit(document(), {
        VariableDefinition(node: VariableDefinitionNode) {
            out[node.variable.name.value] = print(node.type);
        },
    });
    return out;
}

function argumentsOf(field: string): Record<string, string> {
    const out: Record<string, string> = {};
    visit(document(), {
        Field(node: FieldNode) {
            if (node.name.value !== field) return;
            for (const argument of node.arguments ?? []) {
                out[argument.name.value] = print(argument.value);
            }
        },
    });
    return out;
}

// The request text is registered on the API side; a change here needs a new text there.
describe("TESTOPS_COVERAGE_SCOPE_BASELINE_QUERY", () => {
    it("asks for the line baseline and its days: no region draws a branch baseline of the scope", () => {
        expect(fieldsOf("coverageScopeBaseline")).toEqual(["lineBaselinePct", "lineDays"]);
    });

    it("takes the organization, end date, and optional repository or team scope", () => {
        expect(variables()).toEqual({
            orgId: "String!",
            endDate: "Date!",
            repoIds: "[String!]",
            teamIds: "[String!]",
        });
        expect(argumentsOf("coverageScopeBaseline")).toEqual({
            orgId: "$orgId",
            endDate: "$endDate",
            repoIds: "$repoIds",
            teamIds: "$teamIds",
        });
    });
});
