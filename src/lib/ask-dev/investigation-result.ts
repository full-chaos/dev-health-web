import { validateAcrContract } from "@/lib/acr/contracts";

/**
 * The investigation answer shapes ACR can return (OpenAPI `createContextFabricInvestigation`,
 * 200): the result and response schemas in v1 and v2, or the answer projection. One verdict for
 * all of them, so a v2 payload is never judged by the v1 schema (the ask-dev copy validates the
 * v1 result only).
 */
const RESPONSE_SCHEMAS = [
    ["result.v1", "context_fabric_investigation_result.v1.schema.json"],
    ["result.v2", "context_fabric_investigation_result.v2.schema.json"],
    ["response.v1", "context_fabric_investigation_response.v1.schema.json"],
    ["response.v2", "context_fabric_investigation_response.v2.schema.json"],
    ["projection", "context_fabric_answer_projection.v1.schema.json"],
] as const;

export type InvestigationResultShape = (typeof RESPONSE_SCHEMAS)[number][0];

export type InvestigationResultVerdict =
    | { readonly valid: true; readonly shape: InvestigationResultShape }
    | { readonly valid: false; readonly errors: readonly string[] };

export function validateInvestigationResult(value: unknown): InvestigationResultVerdict {
    const errors: string[] = [];
    for (const [shape, schema] of RESPONSE_SCHEMAS) {
        const verdict = validateAcrContract(schema, value);
        if (verdict.valid) return { valid: true, shape };
        errors.push(...verdict.errors.map((error) => `${shape}:${error}`));
    }
    return { valid: false, errors };
}
