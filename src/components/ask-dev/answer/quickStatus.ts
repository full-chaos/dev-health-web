import { ANSWER_STATUS_LABEL, labelFor, type AnswerResult } from "./answerModel";
import {
    OBLIGATION_LABEL,
    completenessOf,
    missingDataSentence,
    type CoverageResult,
} from "./coverageModel";

type Completeness = NonNullable<CoverageResult["completeness"]>;

/**
 * The quick answer's status line (CHAOS-12157). North Star checks 11 and 12 rank the answer's own
 * completeness above its status: "Full answer" is said only when the status AND the completeness
 * are complete. A `complete` status beside partial or degraded completeness reads as not fully
 * covered, with the one missing-data sentence beside it. A status ACR corrected is shown as served,
 * with the correction in words; this view never re-derives or upgrades a status.
 *
 * CHAOS-12245, chris's ruling (2026-10-31): web never shows the raw completeness state. Not derived
 * (or no completeness) renders nothing about completeness: a `complete` status then reads as a
 * plain "Answer", which claims neither a full answer nor a gap.
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
    answer: "Answer",
} as const;

const OUTCOME_WORDS: Record<string, string> = {
    narrowed: "was read only in part",
    unavailable: "was not available",
    not_attempted: "was not read",
    not_applicable: "does not apply",
    satisfied: "was read in full",
};

/** The served correction's direction (closed schema enum); anything else reads "changed". */
const DIRECTION_VERB: Record<string, string> = {
    complete_to_partial: "lowered",
    complete_to_degraded: "lowered",
    partial_to_degraded: "lowered",
    degraded_to_partial: "raised",
};

/**
 * The pill's label for a status, given the answer's completeness: the ONE labelling function. The
 * pill and the correction note both use it, so they can never disagree (CHAOS-12245, lead ruling
 * Q2). "Full answer" only for a complete status with complete completeness; a complete status is
 * "Answer, not fully covered" beside partial or degraded completeness, and a plain "Answer" when
 * completeness was not derived or is missing. Any other status reads by its label, never raw.
 */
export function statusLabel(status: string, completeness: Completeness | null): string {
    const served = labelFor(ANSWER_STATUS_LABEL, status);
    if (status !== "complete") return served;
    const state = completeness?.state ?? "absent";
    if (state === "complete") return served;
    if (state === "partial" || state === "degraded") return QUICK_STATUS_COPY.notFullyCovered;
    return QUICK_STATUS_COPY.answer;
}

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
    // The served pair names the direction: only degraded_to_partial raises a status (codex r1 P2).
    const [from, to] = correction.direction.split("_to_");
    const verb = DIRECTION_VERB[correction.direction] ?? "changed";
    // CHAOS-12245: each status by the pill's own label, never the raw machine word.
    const completeness = completenessOf(result);
    const named = (status: string) => statusLabel(status, completeness);
    return `The service ${verb} this answer from ${named(from ?? correction.replaced_status)} to ${named(to ?? result.status)}${why}.`;
}

export function quickStatus(result: AnswerResult): QuickStatus {
    const completeness = completenessOf(result);
    const state = completeness?.state ?? "absent";
    const covered = result.status !== "complete" || state === "complete";
    return {
        label: statusLabel(result.status, completeness),
        coverage: covered ? null : state,
        // One sentence of missing data beside a complete status, only for partial or degraded.
        completenessNote: covered ? null : missingDataSentence(completeness),
        correctionNote: correctionNote(result),
    };
}
