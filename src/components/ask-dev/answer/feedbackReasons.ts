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
 * requirements list a distinct wrong-subject dimension, now landed as its own
 * member (`wrong_subject`) rather than folded into `wrong_scope`, so the two
 * stay distinguishable in the corpus.
 *
 * `wrong_cohort` and `wrong_driver` are the same additive-sibling pattern for
 * the graph-assisted answer fields: each names a distinct thing the answer
 * can get wrong, never merged into a broader existing member.
 *
 * `unspecified` reads "Declined to say" rather than the literal member name:
 * the ops contract documents it as a neutral placeholder for "the reader
 * declined to say", and that is the honest reader-facing sentence, not a
 * restatement of the wire token.
 */
export const FEEDBACK_REASON_LABELS: Record<DevFeedbackReason, string> = {
    incorrect: "Incorrect",
    missing_evidence: "Missing evidence",
    other: "Other",
    stale_data: "Stale data",
    unclear: "Unclear",
    unsafe_certainty: "Unsafe certainty",
    unspecified: "Declined to say",
    useful: "Useful",
    wrong_cohort: "Wrong cohort",
    wrong_driver: "Wrong driver",
    wrong_scope: "Wrong scope",
    wrong_subject: "Wrong subject",
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
 *
 * `unspecified` is exactly that member, now landed: `neutral`, so it is never
 * offered as a negative chip and the schema-level unspecified-exclusivity
 * constraint (it may never combine with another reason) never has a chance to
 * be violated from this UI, because this UI never emits it at all.
 */
export const FEEDBACK_REASON_POLARITY: Record<
    DevFeedbackReason,
    "positive" | "negative" | "neutral"
> = {
    incorrect: "negative",
    missing_evidence: "negative",
    other: "negative",
    stale_data: "negative",
    unclear: "negative",
    unsafe_certainty: "negative",
    unspecified: "neutral",
    useful: "positive",
    wrong_cohort: "negative",
    wrong_driver: "negative",
    wrong_scope: "negative",
    wrong_subject: "negative",
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

/**
 * Sanctioned copy for a reason this build does not recognise.
 *
 * The tolerance layer accepts a reason member the pinned contract lacks rather
 * than failing the submission (a rating the server stored must not be rejected
 * on its way back). That acceptance would be worthless if the value then
 * reached a reader as `wrong_cohort` -- an internal machine token on screen is
 * exactly what the beta forbids. So the lookup below has no raw-value branch at
 * all: an unrecognised member resolves to this phrase.
 *
 * Deliberately vague rather than guessing. Naming a reason we do not have copy
 * for would be inventing a meaning; "another reason" is true of every member
 * this build has not been taught.
 */
export const UNKNOWN_FEEDBACK_REASON_LABEL = "Another reason";

/**
 * Reader-facing copy for any reason value, recognised or not.
 *
 * The single lookup used everywhere reasons are displayed. Written as a function
 * rather than leaving callers to index `FEEDBACK_REASON_LABELS` directly so the
 * fallback cannot be forgotten at a future call site -- indexing the record with
 * an unknown key yields `undefined`, and React renders that as nothing, which
 * would silently drop a reason instead of naming it.
 */
export function feedbackReasonLabel(reason: string): string {
    return Object.hasOwn(FEEDBACK_REASON_LABELS, reason)
        ? FEEDBACK_REASON_LABELS[reason as DevFeedbackReason]
        : UNKNOWN_FEEDBACK_REASON_LABEL;
}
