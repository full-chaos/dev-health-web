"use client";

import type {
    ACRContextFabricInvestigationResponseV1,
    ACRContextFabricInvestigationResponseV2,
    ACRContextFabricInvestigationResultV1,
} from "@/lib/acr/generated";

import { AskDevAnswer } from "./AskDevAnswer";
import { AskDevClarification } from "./AskDevClarification";
import { AskDevRefusal } from "./AskDevRefusal";
import { CLARIFICATION_COPY, isNonAnswer, type ClarificationChoice } from "./clarificationModel";
import type { NarrowerReask, RefusalTurn } from "./refusalModel";
import { SafeAnswerText } from "./SafeAnswerText";

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
    | "claimed_facts";

/** One turn's result: what both the answer view and the clarification view read. */
export type TranscriptResult =
    | Pick<ACRContextFabricInvestigationResultV1, TranscriptFields>
    | Pick<ACRContextFabricInvestigationResponseV1, TranscriptFields>
    | Pick<ACRContextFabricInvestigationResponseV2, TranscriptFields>;

/** One transcript turn: an investigation result, or a refusal that ended the stream instead. */
export type TranscriptTurn = TranscriptResult | RefusalTurn;

export function isRefusalTurn(turn: TranscriptTurn): turn is RefusalTurn {
    return "refusal" in turn;
}

/** The turn's identity: the result id, or the result id ACR reserved for a refused run. */
export function turnKey(turn: TranscriptTurn): string {
    return isRefusalTurn(turn) ? turn.refusal.reserved_result_id : turn.result_id;
}

/**
 * One turn of the conversation: the question as asked, then the answer, the clarification or
 * non-answer view for `clarification_required` and `no_match`, or the refusal view for an answer
 * that did not fit.
 */
export function AskDevTurn({
    turn,
    onConfirm,
    onReask,
}: {
    turn: TranscriptTurn;
    /** Given on the live turn only; a prior turn is read-only. */
    onConfirm?: (choice: ClarificationChoice) => void;
    /** Given on the live turn only; a prior turn is read-only. */
    onReask?: (reask: NarrowerReask) => void;
}) {
    const refused = isRefusalTurn(turn);
    return (
        <div
            className="space-y-3"
            data-testid="ask-dev-turn"
            data-status={refused ? turn.refusal.error.error.code : turn.status}
        >
            <p className="rounded-(--radius-sm) bg-(--surface-raised) px-3 py-2 text-sm text-foreground">
                <span className="sr-only">{CLARIFICATION_COPY.youAsked}: </span>
                <SafeAnswerText text={turn.question} />
            </p>
            {refused ? (
                <AskDevRefusal turn={turn} onReask={onReask} />
            ) : isNonAnswer(turn.status) ? (
                <AskDevClarification result={turn} onConfirm={onConfirm} />
            ) : (
                <AskDevAnswer result={turn} />
            )}
        </div>
    );
}
