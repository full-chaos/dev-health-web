import { readFileSync } from "node:fs";
import path from "node:path";

import { buildSchema, isObjectType } from "graphql";
import { describe, expect, it } from "vitest";

import type {
    AiAttributionEvidenceRow,
    AiGovernanceViolationRow,
    AliasSuggestion,
    ImproveOpportunity,
    TestOpsRiskQuadrantPoint,
} from "../__generated__/types";

// CHAOS-8954: the schema copy carries the optional name fields the API serves beside an id.
const SERVED_NAME_FIELDS: Record<string, string[]> = {
    AIAttributionEvidenceRow: ["repoName", "teamName", "subjectTitle"],
    AIGovernanceViolationRow: ["repoName", "teamName", "subjectTitle", "ruleName"],
    AliasSuggestion: ["suggestedCanonicalName"],
    ImproveOpportunity: ["entityDisplayName"],
    TestOpsRiskQuadrantPoint: ["name"],
};

describe("schema copy name fields (CHAOS-8954)", () => {
    const schema = buildSchema(readFileSync(path.join(__dirname, "../schema.graphql"), "utf8"));

    it.each(Object.entries(SERVED_NAME_FIELDS))("%s serves nullable %j", (typeName, fields) => {
        const type = schema.getType(typeName);
        expect(type && isObjectType(type)).toBe(true);
        for (const field of fields) {
            const def = isObjectType(type!) ? type.getFields()[field] : undefined;
            expect(def?.type.toString()).toBe("String");
        }
    });

    it("generated types accept the name fields as optional", () => {
        const rows: [
            Partial<AiAttributionEvidenceRow>,
            Partial<AiGovernanceViolationRow>,
            Partial<AliasSuggestion>,
            Partial<ImproveOpportunity>,
            Partial<TestOpsRiskQuadrantPoint>,
        ] = [
            { repoName: null, teamName: "Platform", subjectTitle: null },
            { ruleName: null },
            { suggestedCanonicalName: null },
            { entityDisplayName: null },
            { name: null },
        ];
        expect(rows).toHaveLength(5);
    });
});
