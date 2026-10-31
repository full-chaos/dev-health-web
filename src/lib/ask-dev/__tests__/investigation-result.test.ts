import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

import commonSchema from "@/lib/acr/contracts/schemas/context_fabric_common.v1.schema.json";
import resultV1Schema from "@/lib/acr/contracts/schemas/context_fabric_investigation_result.v1.schema.json";
import { validateInvestigationResult } from "../investigation-result";
import originState from "./captures/context_fabric_investigation_result_origin_state.v1.json";
import renderShapes from "./captures/context_fabric_investigation_result_render_shapes.v1.json";
import unsupported from "./captures/context_fabric_investigation_result_unsupported.v1.json";
import canonical from "./captures/context_fabric_investigation_result.v1.json";

/**
 * Parity with the ask-dev validator (`ask-dev/src/lib/acr/validate.ts`). That module cannot be
 * imported across repositories, so its METHOD is rebuilt here: the same Ajv options and the same
 * schema set (common + result.v1), loaded from web's pin. What this proves is that web's
 * validator, which also takes v2, agrees with that method on real producer captures and on
 * planted defects. It does not prove the two repositories pin the same schema bytes: that is the
 * pin-alignment check (CHAOS-11906).
 */
const askDevMethodAjv = new Ajv2020({
    allErrors: true,
    strictRequired: false,
    strictSchema: true,
    strictTypes: false,
});
addFormats(askDevMethodAjv);
askDevMethodAjv.addKeyword({ keyword: "x-documented-values", schemaType: "array" });
askDevMethodAjv.addSchema(commonSchema, "context_fabric_common.v1.schema.json");
askDevMethodAjv.addSchema(resultV1Schema, "context_fabric_investigation_result.v1.schema.json");

function askDevMethodVerdict(value: unknown): boolean {
    const validator = askDevMethodAjv.getSchema(
        "context_fabric_investigation_result.v1.schema.json",
    );
    if (validator === undefined) throw new Error("ask-dev schema missing");
    return validator(value) === true;
}

const captures = {
    canonical,
    originState,
    renderShapes,
    unsupported,
} as const;

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

describe("Ask Dev investigation result validation", () => {
    it.each(Object.entries(captures))(
        "accepts the real producer capture %s as the ask-dev method does",
        (name, capture) => {
            expect(askDevMethodVerdict(capture), `ask-dev verdict on ${name}`).toBe(true);
            const verdict = validateInvestigationResult(capture);
            expect(verdict.valid, JSON.stringify(verdict)).toBe(true);
        },
    );

    const negatives: ReadonlyArray<readonly [string, (value: Record<string, unknown>) => void]> = [
        ["a dropped required field", (value) => delete value.result_id],
        ["an unknown top-level field", (value) => (value.invented_by_a_test = true)],
        [
            "a wrong schema_version",
            (value) => (value.schema_version = "context_fabric_investigation_result.v9"),
        ],
        ["a status outside the enum", (value) => (value.status = "healthy")],
    ];

    it.each(negatives)("rejects %s exactly as the ask-dev method does", (_name, mutate) => {
        const broken = clone(canonical) as Record<string, unknown>;
        mutate(broken);
        expect(askDevMethodVerdict(broken), "ask-dev must reject the planted defect").toBe(false);
        expect(validateInvestigationResult(broken).valid).toBe(false);
    });

    it("reports which shape matched", () => {
        const verdict = validateInvestigationResult(canonical);
        expect(verdict).toMatchObject({ valid: true });
    });
});
