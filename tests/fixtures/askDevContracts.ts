/**
 * CHAOS-3287: the real backend vocabulary this mock/spec suite must never
 * drift from. Every list here is transcribed directly from the ops repo's
 * canonical contract source — ops/src/dev_health_ops/api/dev/contracts.py
 * (StrEnum/Literal definitions) — not invented or guessed. Re-check against
 * that file (never against src/lib/dev/generated.ts alone) whenever this
 * file changes, since generated.ts is itself downstream of it.
 *
 * When CHAOS-3298 re-pins the web client to dev_answer.v2, this file's
 * lists are exactly what needs re-deriving from the v2 contracts module —
 * the spec files that import from here should not need to change.
 */

/** contracts.py `AnswerStatus` (StrEnum). */
export const ANSWER_STATUS_VALUES = [
    "complete",
    "partial",
    "degraded",
    "insufficient_evidence",
    "refused",
    "error",
] as const;
export type AnswerStatus = (typeof ANSWER_STATUS_VALUES)[number];

/** contracts.py `ScopeResolutionOutcome` (StrEnum). */
export const SCOPE_RESOLUTION_OUTCOME_VALUES = [
    "exact",
    "filtered",
    "inherited",
    "organization_fallback",
    "ambiguous",
    "unresolved",
    "forbidden_or_not_found",
] as const;
export type ScopeResolutionOutcome = (typeof SCOPE_RESOLUTION_OUTCOME_VALUES)[number];

/** contracts.py `DevError.code` (Literal). */
export const DEV_ERROR_CODES = [
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
    "provider_contract_violation",
    "internal_error",
] as const;
export type DevErrorCode = (typeof DEV_ERROR_CODES)[number];

/** contracts.py `DevTranscriptRunState` (Literal). */
export const DEV_TRANSCRIPT_RUN_STATE_VALUES = [
    "accepted",
    "resolving_scope",
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
export type DevTranscriptRunState = (typeof DEV_TRANSCRIPT_RUN_STATE_VALUES)[number];

/** contracts.py `DevCapabilities.readiness` (Literal). */
export const DEV_CAPABILITIES_READINESS_VALUES = [
    "ready",
    "unsupported_model",
    "missing_credentials",
    "disabled",
    "degraded",
] as const;
export type DevCapabilitiesReadiness = (typeof DEV_CAPABILITIES_READINESS_VALUES)[number];

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
