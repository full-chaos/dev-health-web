import type { DevFeedback } from "@/lib/dev/generated";

/**
 * One `dev_feedback.v1` reason, derived from the generated contract rather
 * than restated.
 *
 * `reasons` is a tuple union on the wire (it carries `minItems`/`maxItems`), so
 * indexing with `number` yields the member union. Deriving it is the whole
 * point: a re-pin that adds a member has to break the two TOTAL records below
 * until each new member is given sanctioned copy and a polarity. A hand-written
 * copy of this union would keep compiling against a stale vocabulary and the
 * new members would never reach the UI.
 */
export type DevFeedbackReason = DevFeedback["reasons"][number];

/**
 * Sanctioned reader-facing copy per reason. TOTAL — an unmapped member is a
 * build error, never a raw enum value on a chip.
 *
 * Wording stays faithful to the member it names and no wider. `wrong_scope`
 * reads "Wrong scope", not "Wrong subject or scope": the beta's own
 * requirements list a distinct wrong-subject dimension, and borrowing that
 * meaning now would make the two indistinguishable in the corpus the moment
 * the real member lands.
 */
export const FEEDBACK_REASON_LABELS: Record<DevFeedbackReason, string> = {
    incorrect: "Incorrect",
    missing_evidence: "Missing evidence",
    stale_data: "Stale data",
    unclear: "Unclear",
    useful: "Useful",
    wrong_scope: "Wrong scope",
};

/**
 * Which rating a reason can honestly accompany. Also TOTAL, for a reason
 * beyond drift-protection: it is what stops a positive member being offered as
 * an explanation for a negative rating (and the reverse).
 *
 * `neutral` exists ahead of any neutral member because the decision it encodes
 * is already made: a reason meaning "the reader declined to say" is never an
 * option to click, it is what gets recorded when nothing was clicked. Having
 * the third case here means such a member classifies correctly on arrival
 * instead of being forced into `negative` and silently appearing as a chip.
 */
export const FEEDBACK_REASON_POLARITY: Record<
    DevFeedbackReason,
    "positive" | "negative" | "neutral"
> = {
    incorrect: "negative",
    missing_evidence: "negative",
    stale_data: "negative",
    unclear: "negative",
    useful: "positive",
    wrong_scope: "negative",
};

/**
 * The reasons offered when a reader rates an answer unhelpful, derived from the
 * polarity table so the list cannot fall behind it. Sorted for a stable
 * rendering order that no separate hand-maintained list has to keep in step.
 */
export const NEGATIVE_FEEDBACK_REASONS: readonly DevFeedbackReason[] = (
    Object.keys(FEEDBACK_REASON_POLARITY) as DevFeedbackReason[]
)
    .filter((reason) => FEEDBACK_REASON_POLARITY[reason] === "negative")
    .sort((left, right) =>
        FEEDBACK_REASON_LABELS[left].localeCompare(FEEDBACK_REASON_LABELS[right]),
    );

/**
 * The reason recorded for a one-click positive rating.
 *
 * This is the ONE place a reason is supplied without the reader choosing it,
 * and it is sound because it restates the button they pressed: they clicked
 * "Helpful" and `useful` means exactly that. The negative path deliberately has
 * no counterpart — see `FeedbackFooter`.
 */
export const POSITIVE_FEEDBACK_REASON: DevFeedbackReason = "useful";

/** The wire cap on `comment`, mirrored so the field can bound its own input. */
export const FEEDBACK_COMMENT_MAX_LENGTH = 2048;
