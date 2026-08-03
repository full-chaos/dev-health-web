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
 * NOT in what was pinned at the time, which is what the running app
 * really validates against; CHAOS-3298's re-pin then brought all three
 * into the pinned schemas, and `assertVocabularyIsExhaustive` below is
 * what forced them back into the declared unions rather than leaving the
 * casts quietly lying). Extracting from the schema files themselves makes
 * that class of drift impossible to reintroduce.
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

/**
 * Each vocabulary below declares its members twice on purpose: a `const`
 * tuple (the compile-time union every consumer types against) and a
 * runtime extraction from the pinned schema. The `as readonly T[]` cast on
 * the extraction is unchecked by TypeScript, so on its own it would let the
 * declared union drift silently away from what is really pinned — exactly
 * the drift the header describes. `assertVocabularyIsExhaustive` closes
 * that by comparing the two sets, and the spec suite runs it.
 */
const DECLARED_ANSWER_STATUS = [
    "complete",
    "partial",
    "degraded",
    "insufficient_evidence",
    "refused",
    "error",
] as const;
export type AnswerStatus = (typeof DECLARED_ANSWER_STATUS)[number];

/** Pinned `dev_answer.v1.schema.json` `$defs.AnswerStatus.enum`. */
export const ANSWER_STATUS_VALUES = extractEnum(
    answerSchema as JsonSchema,
    "$defs",
    "AnswerStatus",
) as readonly AnswerStatus[];

const DECLARED_SCOPE_RESOLUTION_OUTCOME = [
    "exact",
    "filtered",
    "inherited",
    "organization_fallback",
    "ambiguous",
    "unresolved",
    "forbidden_or_not_found",
] as const;
export type ScopeResolutionOutcome = (typeof DECLARED_SCOPE_RESOLUTION_OUTCOME)[number];

/** Pinned `dev_scope_resolution.v1.schema.json` `properties.outcome` (→ `$defs.ScopeResolutionOutcome.enum`). */
export const SCOPE_RESOLUTION_OUTCOME_VALUES = extractEnum(
    scopeResolutionSchema as JsonSchema,
    "properties",
    "outcome",
) as readonly ScopeResolutionOutcome[];

const DECLARED_DEV_ERROR_CODE = [
    "unauthenticated",
    "forbidden",
    "feature_not_enabled",
    "byo_llm_not_enabled",
    "provider_not_configured",
    "model_not_supported",
    "provider_unavailable",
    "rate_limited",
    "concurrency_limited",
    "cost_limit_reached",
    "invalid_request",
    "scope_ambiguous",
    "scope_not_found",
    "scope_forbidden",
    "conversation_not_found",
    "conversation_expired",
    "tool_limit_reached",
    "tool_unavailable",
    "source_unavailable",
    "insufficient_evidence",
    "answer_validation_failed",
    "cancelled",
    // Reached the pinned contract with CHAOS-3298's re-pin; ops added it
    // when it started enforcing sequential tool decisions.
    "provider_contract_violation",
    "internal_error",
] as const;
export type DevErrorCode = (typeof DECLARED_DEV_ERROR_CODE)[number];

/** Pinned `dev_error.v1.schema.json` `properties.code.enum`. */
export const DEV_ERROR_CODES = extractEnum(
    errorSchema as JsonSchema,
    "properties",
    "code",
) as readonly DevErrorCode[];

const DECLARED_DEV_TRANSCRIPT_RUN_STATE = [
    "accepted",
    "resolving_scope",
    // Reached the pinned contract with CHAOS-3298's re-pin; ops added both
    // for CHAOS-3292's server-owned intent interpretation and named-subject
    // preflight. Neither is rendered — see AskDevProvider's `runState`,
    // which is stored and never read.
    "interpreting",
    "resolving_subjects",
    "model_decision",
    "tool_validation",
    "tool_execution",
    "answer_validation",
    "completed",
    "insufficient_evidence",
    "refused",
    "failed",
    "cancelled",
] as const;
export type DevTranscriptRunState = (typeof DECLARED_DEV_TRANSCRIPT_RUN_STATE)[number];

/** Pinned `dev_conversation_transcript.v1.schema.json` `$defs.DevTranscriptEntry.properties.run_state.enum`. */
export const DEV_TRANSCRIPT_RUN_STATE_VALUES = extractEnum(
    conversationTranscriptSchema as JsonSchema,
    "$defs",
    "DevTranscriptEntry",
    "properties",
    "run_state",
) as readonly DevTranscriptRunState[];

const DECLARED_DEV_CAPABILITIES_READINESS = [
    "ready",
    "unsupported_model",
    "missing_credentials",
    "disabled",
    "degraded",
] as const;
export type DevCapabilitiesReadiness = (typeof DECLARED_DEV_CAPABILITIES_READINESS)[number];

/** Pinned `dev_capabilities.v1.schema.json` `properties.readiness.enum`. */
export const DEV_CAPABILITIES_READINESS_VALUES = extractEnum(
    capabilitiesSchema as JsonSchema,
    "properties",
    "readiness",
) as readonly DevCapabilitiesReadiness[];

/**
 * Every vocabulary this file publishes, paired with the union declared
 * alongside it. `assertVocabularyIsExhaustive` walks this table, so adding
 * a vocabulary above without adding it here is itself caught (the spec
 * asserts the table's size against the exported `*_VALUES` count).
 */
const VOCABULARIES = [
    ["AnswerStatus", ANSWER_STATUS_VALUES, DECLARED_ANSWER_STATUS],
    ["ScopeResolutionOutcome", SCOPE_RESOLUTION_OUTCOME_VALUES, DECLARED_SCOPE_RESOLUTION_OUTCOME],
    ["DevErrorCode", DEV_ERROR_CODES, DECLARED_DEV_ERROR_CODE],
    ["DevTranscriptRunState", DEV_TRANSCRIPT_RUN_STATE_VALUES, DECLARED_DEV_TRANSCRIPT_RUN_STATE],
    [
        "DevCapabilitiesReadiness",
        DEV_CAPABILITIES_READINESS_VALUES,
        DECLARED_DEV_CAPABILITIES_READINESS,
    ],
] as const satisfies readonly (readonly [string, readonly string[], readonly string[]])[];

export const VOCABULARY_COUNT = VOCABULARIES.length;

/**
 * Asserts that every declared union in this file names exactly the members
 * the pinned schema really has. The `as readonly T[]` casts on the
 * extractions are unchecked, so without this a re-pin that adds a member
 * leaves the union silently short — consumers keep compiling, mocks keep
 * omitting the new value, and the "extracted from the schema, never
 * hand-transcribed" guarantee holds only for the runtime array while the
 * type it is cast to still lies.
 */
export function assertVocabularyIsExhaustive(): void {
    for (const [label, pinned, declared] of VOCABULARIES) {
        const declaredSet = new Set<string>(declared);
        const pinnedSet = new Set<string>(pinned);
        const missing = [...pinnedSet].filter((value) => !declaredSet.has(value));
        const extra = [...declaredSet].filter((value) => !pinnedSet.has(value));
        if (missing.length > 0 || extra.length > 0) {
            throw new Error(
                `${label}: the declared union and the pinned schema enum disagree. ` +
                    `Pinned but not declared: ${missing.join(", ") || "(none)"}. ` +
                    `Declared but not pinned: ${extra.join(", ") || "(none)"}.`,
            );
        }
    }
}

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

/**
 * Asserts that `coveredValues` (values exercised by a dedicated mock
 * scenario) and `excludedValues` (values deliberately NOT exercised, with a
 * documented reason at the call site) together form an EXACT partition of
 * `authoritativeValues` (the pinned schema's real enum) — every
 * authoritative value is in exactly one of the two lists, and neither list
 * names a value the schema doesn't have.
 *
 * Unlike `assertKnownToSchema` (a one-way subset check — codex NO-SHIP
 * finding: membership-checking only the 2 values a test happens to use lets
 * a new enum member, or a rename of an unreferenced member like
 * `filtered`→`narrowed`, pass silently), this fails on ANY drift in the
 * authoritative set: an addition (falls into neither list), a removal (a
 * listed value schema no longer has), or a rename (same as removal +
 * addition). The two lists must be updated deliberately for the assertion
 * to pass again — that deliberate update is the point.
 */
export function assertExhaustivePartition(
    authoritativeValues: readonly string[],
    coveredValues: readonly string[],
    excludedValues: readonly string[],
    label: string,
): void {
    const overlap = coveredValues.filter((value) => excludedValues.includes(value));
    if (overlap.length > 0) {
        throw new Error(
            `${label}: value(s) listed as both covered and excluded: ${overlap.join(", ")}.`,
        );
    }
    const partition = new Set([...coveredValues, ...excludedValues]);
    const missing = authoritativeValues.filter((value) => !partition.has(value));
    const unknown = [...partition].filter((value) => !authoritativeValues.includes(value));
    if (missing.length > 0 || unknown.length > 0) {
        throw new Error(
            `${label}: covered+excluded does not exactly equal the pinned schema enum. ` +
                `Missing from the partition (present in the schema, not covered or excluded): ` +
                `${missing.join(", ") || "(none)"}. ` +
                `Unknown to the schema (covered or excluded but not a real pinned value): ` +
                `${unknown.join(", ") || "(none)"}.`,
        );
    }
}
