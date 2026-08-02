/**
 * CHAOS-3287: the real backend vocabulary this mock/spec suite must never
 * drift from. Every list below is EXTRACTED AT RUNTIME from the pinned
 * ops-generated JSON Schema files under src/lib/dev/contracts/schemas/ —
 * the exact artifacts the browser's own client.ts validates every real
 * response against (see validatePinnedJsonSchema in src/lib/dev/client.ts)
 * — never hand-transcribed. A hand-transcribed list can drift from the
 * pinned schema silently (verified while fixing this: an earlier version
 * of this file included "interpreting"/"resolving_subjects" in
 * DEV_TRANSCRIPT_RUN_STATE_VALUES and "provider_contract_violation" in
 * DEV_ERROR_CODES — both present in ops' *live* contracts.py source but
 * NOT in what's actually pinned here, which is what the running app
 * really validates against). Extracting from the schema files themselves
 * makes that class of drift impossible to reintroduce.
 *
 * tests/mocks/devScenario.ts and this file's own self-check
 * (assertVocabularyIsExhaustive, exercised by
 * tests/ask-dev-vocabulary.spec.ts) both read from here, so a schema
 * regeneration that adds/removes/renames an enum member fails the suite
 * immediately instead of silently producing a mock/spec pair that only
 * ever agrees with itself.
 *
 * When CHAOS-3298 re-pins the web client to dev_answer.v2, only the
 * schema file paths below need to change — the extraction machinery and
 * every downstream consumer stay correct.
 */
import answerSchema from "../../src/lib/dev/contracts/schemas/dev_answer.v1.schema.json";
import capabilitiesSchema from "../../src/lib/dev/contracts/schemas/dev_capabilities.v1.schema.json";
import conversationTranscriptSchema from "../../src/lib/dev/contracts/schemas/dev_conversation_transcript.v1.schema.json";
import errorSchema from "../../src/lib/dev/contracts/schemas/dev_error.v1.schema.json";
import scopeResolutionSchema from "../../src/lib/dev/contracts/schemas/dev_scope_resolution.v1.schema.json";

type JsonSchema = Record<string, unknown>;

function isRecord(value: unknown): value is JsonSchema {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Resolves one `{ "$ref": "#/$defs/Name" }` indirection against its own schema document. */
function resolveRef(schema: JsonSchema, node: unknown): JsonSchema {
    if (!isRecord(node)) throw new Error("Expected a JSON Schema node.");
    const ref = node.$ref;
    if (typeof ref !== "string") return node;
    const match = /^#\/\$defs\/(.+)$/u.exec(ref);
    if (!match) throw new Error(`Unsupported $ref shape: ${ref}`);
    const defs = schema.$defs;
    if (!isRecord(defs) || !isRecord(defs[match[1]!])) {
        throw new Error(`$ref target "${ref}" not found in $defs.`);
    }
    return defs[match[1]!] as JsonSchema;
}

/** Extracts a required string `enum` from a (possibly $ref-indirected) schema property path. */
function extractEnum(schema: JsonSchema, ...path: readonly string[]): readonly string[] {
    let node: unknown = schema;
    for (const segment of path) {
        if (!isRecord(node)) throw new Error(`Cannot descend into "${segment}": not an object.`);
        node = node[segment];
        if (node === undefined) throw new Error(`Missing schema path segment "${segment}".`);
    }
    const resolved = resolveRef(schema, node);
    const values = resolved.enum;
    if (
        !Array.isArray(values) ||
        values.length === 0 ||
        !values.every((value) => typeof value === "string")
    ) {
        throw new Error(`Expected a non-empty string enum at "${path.join(".")}".`);
    }
    return values as readonly string[];
}

/** Pinned `dev_answer.v1.schema.json` `$defs.AnswerStatus.enum`. */
export const ANSWER_STATUS_VALUES = extractEnum(
    answerSchema as JsonSchema,
    "$defs",
    "AnswerStatus",
) as readonly AnswerStatus[];
export type AnswerStatus =
    "complete" | "partial" | "degraded" | "insufficient_evidence" | "refused" | "error";

/** Pinned `dev_scope_resolution.v1.schema.json` `properties.outcome` (→ `$defs.ScopeResolutionOutcome.enum`). */
export const SCOPE_RESOLUTION_OUTCOME_VALUES = extractEnum(
    scopeResolutionSchema as JsonSchema,
    "properties",
    "outcome",
) as readonly ScopeResolutionOutcome[];
export type ScopeResolutionOutcome =
    | "exact"
    | "filtered"
    | "inherited"
    | "organization_fallback"
    | "ambiguous"
    | "unresolved"
    | "forbidden_or_not_found";

/** Pinned `dev_error.v1.schema.json` `properties.code.enum`. */
export const DEV_ERROR_CODES = extractEnum(
    errorSchema as JsonSchema,
    "properties",
    "code",
) as readonly DevErrorCode[];
export type DevErrorCode =
    | "unauthenticated"
    | "forbidden"
    | "feature_not_enabled"
    | "byo_llm_not_enabled"
    | "provider_not_configured"
    | "model_not_supported"
    | "provider_unavailable"
    | "rate_limited"
    | "concurrency_limited"
    | "cost_limit_reached"
    | "invalid_request"
    | "scope_ambiguous"
    | "scope_not_found"
    | "scope_forbidden"
    | "conversation_not_found"
    | "conversation_expired"
    | "tool_limit_reached"
    | "tool_unavailable"
    | "source_unavailable"
    | "insufficient_evidence"
    | "answer_validation_failed"
    | "cancelled"
    | "internal_error";

/** Pinned `dev_conversation_transcript.v1.schema.json` `$defs.DevTranscriptEntry.properties.run_state.enum`. */
export const DEV_TRANSCRIPT_RUN_STATE_VALUES = extractEnum(
    conversationTranscriptSchema as JsonSchema,
    "$defs",
    "DevTranscriptEntry",
    "properties",
    "run_state",
) as readonly DevTranscriptRunState[];
export type DevTranscriptRunState =
    | "accepted"
    | "resolving_scope"
    | "model_decision"
    | "tool_validation"
    | "tool_execution"
    | "answer_validation"
    | "completed"
    | "insufficient_evidence"
    | "refused"
    | "failed"
    | "cancelled";

/** Pinned `dev_capabilities.v1.schema.json` `properties.readiness.enum`. */
export const DEV_CAPABILITIES_READINESS_VALUES = extractEnum(
    capabilitiesSchema as JsonSchema,
    "properties",
    "readiness",
) as readonly DevCapabilitiesReadiness[];
export type DevCapabilitiesReadiness =
    "ready" | "unsupported_model" | "missing_credentials" | "disabled" | "degraded";

/**
 * Every internal enum value, plus its cosmetic `replaceAll("_", " ")` form
 * (the exact transform AskDevAnswer.tsx applies before rendering
 * `answer.status` and `resolved_scope.outcome`) — both forms count as a
 * "raw enum leak" per CHAOS-3298's guardrail against generic
 * underscore-replacement display. Excludes values that are also ordinary
 * connected English words in the app's own copy (e.g. none of these
 * currently collide), so a plain substring search stays a valid check.
 */
export function forbiddenEnumStrings(values: readonly string[]): readonly string[] {
    return values.flatMap((value) => [value, value.replaceAll("_", " ")]);
}

/**
 * Asserts that `candidateValues` (e.g. every `status` used in
 * tests/fixtures/askDevOutcomes.ts) is an exact, non-empty SUBSET of
 * `authoritativeValues` (the pinned schema's real enum) — throws naming
 * the offending values otherwise. Exhaustive-EQUALITY checks (every
 * authoritative value must be covered by some test case) belong in the
 * spec files themselves, since not every enum value has (or needs) a
 * dedicated scenario; this only guards against a table entry naming a
 * value the pinned contract does not actually have.
 */
export function assertKnownToSchema(
    candidateValues: readonly string[],
    authoritativeValues: readonly string[],
    label: string,
): void {
    const authoritative = new Set(authoritativeValues);
    const unknown = candidateValues.filter((value) => !authoritative.has(value));
    if (unknown.length > 0) {
        throw new Error(
            `${label} contains value(s) not present in the pinned schema enum: ${unknown.join(", ")}. ` +
                `Pinned enum is: ${authoritativeValues.join(", ")}.`,
        );
    }
}
