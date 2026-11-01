import type {
    ACRContextFabricInvestigationResponseV1,
    ACRContextFabricInvestigationResponseV2,
    ACRContextFabricInvestigationResultV1,
    ACRErrorV1,
} from "@/lib/acr/generated";

/**
 * What web's conversation store and transports hold of one turn. The render of these shapes is
 * ask-dev's (CHAOS-12378); this file is the data side only.
 */
type TranscriptFields =
    | "result_id"
    | "status"
    | "question"
    | "deterministic_answer"
    | "direct_judgment"
    | "current_state"
    | "strongest_pressures"
    | "drivers"
    | "remaining_work"
    | "readiness_gaps"
    | "conflicts"
    | "structure_needs"
    | "window_clarification"
    | "subject_resolution"
    | "versions"
    | "completeness"
    | "coverage"
    | "limitations"
    | "warnings"
    | "evidence_ref_ids"
    | "evidence_ref_labels"
    // CHAOS-11944: the cohort ranking.
    | "cohort"
    | "interpretation"
    | "render_shapes"
    | "effective_evidence_window"
    // CHAOS-11945: the claimed-fact tables (their window is effective_evidence_window above).
    | "claimed_facts"
    // CHAOS-11942: the request id a withheld chart is logged with.
    | "request_id";

/** One turn's result. */
export type TranscriptResult =
    | Pick<ACRContextFabricInvestigationResultV1, TranscriptFields>
    | Pick<ACRContextFabricInvestigationResponseV1, TranscriptFields>
    | Pick<ACRContextFabricInvestigationResponseV2, TranscriptFields>;

/**
 * A budget refusal (CHAOS-3440): ACR measured the answer, it did not fit the response budget, and
 * the stream ended with an `error` event (error.v1, code `budget_refusal`, HTTP 413).
 */
export type RefusalEvent = {
    readonly type: "error";
    /** The result id ACR minted at admission: the refusal's own identity in the transcript. */
    readonly reserved_result_id: string;
    readonly error: ACRErrorV1;
};

/** A refusal turn: the question this browser sent, then the error event ACR answered with. */
export type RefusalTurn = {
    readonly question: string;
    readonly refusal: RefusalEvent;
};

/** One transcript turn: an investigation result, or a refusal that ended the stream instead. */
export type TranscriptTurn = TranscriptResult | RefusalTurn;

export function isRefusalTurn(turn: TranscriptTurn): turn is RefusalTurn {
    return "refusal" in turn;
}

/** ACR's closed narrowing axes (`NarrowingContinuationAxis`, without `none`, which is never sent). */
type NarrowingAxis =
    "evidence_window" | "result_count" | "scope_anchor" | "group_selection" | "comparison_pair";

const AXES: ReadonlySet<string> = new Set<NarrowingAxis>([
    "evidence_window",
    "result_count",
    "scope_anchor",
    "group_selection",
    "comparison_pair",
]);

/**
 * The axis ACR named, or `null`. ACR omits the continuation when it can name none; a value outside
 * the closed vocabulary is read as absent, never shown.
 */
export function narrowingAxis(event: RefusalEvent): NarrowingAxis | null {
    const continuation = (event.error.error.details ?? {}).narrower_continuation;
    if (!continuation || typeof continuation !== "object") return null;
    const axis = (continuation as Record<string, unknown>).axis;
    return typeof axis === "string" && AXES.has(axis) ? (axis as NarrowingAxis) : null;
}
