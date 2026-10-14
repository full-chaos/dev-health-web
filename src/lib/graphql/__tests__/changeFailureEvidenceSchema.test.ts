import { readFileSync } from "node:fs";
import path from "node:path";

import { buildSchema, isObjectType } from "graphql";
import { describe, expect, it } from "vitest";

// CHAOS-9680: the schema copy carries the change failure evidence of the ops contract
// (CHAOS-9630): one nullable field on a Home delta and on an operating review metric, and the
// type with its five fields. The generated types follow the copy (`pnpm codegen:check`).
describe("schema copy: changeFailureEvidence", () => {
    const schema = buildSchema(readFileSync(path.join(__dirname, "../schema.graphql"), "utf8"));
    const fieldType = (type: string, field: string): string | undefined => {
        const t = schema.getType(type);
        return t && isObjectType(t) ? t.getFields()[field]?.type.toString() : undefined;
    };

    it.each(["MetricDelta", "OperatingReviewMetric"])(
        "%s serves changeFailureEvidence, nullable",
        (type) => {
            expect(fieldType(type, "changeFailureEvidence")).toBe("ChangeFailureEvidence");
        },
    );

    it.each([
        ["basis", "String"],
        ["deployments", "Int!"],
        ["deploymentsWithStatus", "Int!"],
        ["coverage", "Float"],
        ["unknownReason", "String"],
    ])("ChangeFailureEvidence.%s is %s", (field, type) => {
        expect(fieldType("ChangeFailureEvidence", field)).toBe(type);
    });
});
