import { parse, visit, type FieldNode, type VariableDefinitionNode, print } from "graphql";
import { describe, expect, it } from "vitest";

import { TESTOPS_COVERAGE_BASELINES_QUERY } from "../queries";

function fieldsOf(field: string): string[] {
    const names: string[] = [];
    visit(parse(TESTOPS_COVERAGE_BASELINES_QUERY), {
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
    visit(parse(TESTOPS_COVERAGE_BASELINES_QUERY), {
        VariableDefinition(node: VariableDefinitionNode) {
            out[node.variable.name.value] = print(node.type);
        },
    });
    return out;
}

/** The arguments of the root field, each with the variable it is given. */
function argumentsOf(field: string): Record<string, string> {
    const out: Record<string, string> = {};
    visit(parse(TESTOPS_COVERAGE_BASELINES_QUERY), {
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
describe("TESTOPS_COVERAGE_BASELINES_QUERY", () => {
    it("asks for the repository, its name, the two baselines and their days", () => {
        expect(fieldsOf("coverageBaselines")).toEqual([
            "repoId",
            "repoName",
            "lineBaselinePct",
            "lineDays",
            "branchBaselinePct",
            "branchDays",
        ]);
    });

    it("gives each argument of the field its own variable", () => {
        expect(argumentsOf("coverageBaselines")).toEqual({
            orgId: "$orgId",
            endDate: "$endDate",
            repoIds: "$repoIds",
            teamIds: "$teamIds",
        });
    });

    it("takes the organization, the end date and an optional repository or team scope", () => {
        expect(variables()).toEqual({
            orgId: "String!",
            endDate: "Date!",
            repoIds: "[String!]",
            teamIds: "[String!]",
        });
    });
});
