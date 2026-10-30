import { ANSWER_STATUS_LABEL, labelFor, type AnswerResult } from "./answerModel";
import { COMPLETENESS_TEXT, OBLIGATION_LABEL, completenessOf } from "./coverageModel";

/**
 * The quick answer's status line (CHAOS-12157). North Star checks 11 and 12 rank the answer's own
 * completeness above its status: "Full answer" is said only when the status AND the completeness
 * are complete. A `complete` status beside partial, degraded, not-derived or missing completeness
 * reads as not fully covered, with the completeness sentence beside it. A status ACR corrected is
 * shown as served, with the correction in words; this view never re-derives or upgrades a status.
 */
export type QuickStatus = {
    readonly label: string;
    /** The completeness state behind a `complete` status that is not fully covered, else null. */
    readonly coverage: string | null;
    readonly completenessNote: string | null;
    readonly correctionNote: string | null;
};

export const QUICK_STATUS_COPY = {
    notFullyCovered: "Answer, not fully covered",
} as const;

const OUTCOME_WORDS: Record<string, string> = {
    narrowed: "was read only in part",
    unavailable: "was not available",
    not_attempted: "was not read",
    not_applicable: "does not apply",
    satisfied: "was read in full",
};

function correctionNote(result: AnswerResult): string | null {
    const correction = result.status_correction;
    if (!correction) return null;
    const requirement = correction.deciding_requirement ?? "";
    const obligation = requirement.split("/")[0] ?? "";
    const what = obligation === "" ? null : labelFor(OBLIGATION_LABEL, obligation).toLowerCase();
    const outcome = correction.deciding_outcome;
    const why =
        what === null || outcome === undefined
            ? ""
            : `: ${what} ${OUTCOME_WORDS[outcome] ?? outcome.replaceAll("_", " ")}`;
    return `The service lowered this answer from ${correction.replaced_status} to ${result.status}${why}.`;
}

export function quickStatus(result: AnswerResult): QuickStatus {
    const correction = correctionNote(result);
    const served = ANSWER_STATUS_LABEL[result.status] ?? result.status;
    if (result.status !== "complete") {
        return {
            label: served,
            coverage: null,
            completenessNote: null,
            correctionNote: correction,
        };
    }
    const completeness = completenessOf(result);
    const state = completeness?.state ?? "absent";
    if (state === "complete") {
        return {
            label: served,
            coverage: null,
            completenessNote: null,
            correctionNote: correction,
        };
    }
    return {
        label: QUICK_STATUS_COPY.notFullyCovered,
        coverage: state,
        completenessNote: COMPLETENESS_TEXT[state],
        correctionNote: correction,
    };
}
