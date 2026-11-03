import type { AnswerProjection } from "@full-chaos/ask-dev/render";

/** What ACR's bounded answer says it cut (`context_fabric_answer_projection.v1`, CHAOS-12643). */
export type ProjectionBudget = AnswerProjection["projection_budget"];

/** The schema version of ACR's bounded answer. */
export const ANSWER_PROJECTION_SCHEMA = "context_fabric_answer_projection.v1";

/** Every count of content a bounded answer left out. `values_clamped` counts shortened values. */
export const OMISSION_COUNTS = [
    "drivers_omitted",
    "withheld_drivers_omitted",
    "cohort_members_omitted",
    "cohort_groups_omitted",
    "facts_omitted",
    "candidates_omitted",
    "evidence_refs_omitted",
    "limitations_omitted",
    "warnings_omitted",
    "coverage_omitted",
    "reasons_omitted",
    "render_shapes_omitted",
] as const satisfies readonly (keyof ProjectionBudget)[];

/** Whether a result payload is in ACR's bounded form (its schema is checked by the stream gate). */
export function isAnswerProjection(value: unknown): value is AnswerProjection {
    return (
        typeof value === "object" &&
        value !== null &&
        (value as { schema_version?: unknown }).schema_version === ANSWER_PROJECTION_SCHEMA
    );
}

/**
 * ACR's own rule for the budget (acr `validate_context_fabric_answer_projection.go`), as ask-dev's
 * classifier reads it (`src/lib/projection-budget.ts`): `truncated` is true if and only if a count
 * (an omission or `values_clamped`) is above zero or `full_result_omitted` is set. The JSON Schema
 * cannot state a rule across fields, so a budget that breaks it is refused here: it cannot be told
 * apart from a complete answer.
 */
export function budgetIsConsistent(budget: ProjectionBudget): boolean {
    const cut =
        budget.full_result_omitted ||
        (budget.values_clamped ?? 0) > 0 ||
        OMISSION_COUNTS.some((key) => (budget[key] ?? 0) > 0);
    return budget.truncated === cut;
}
