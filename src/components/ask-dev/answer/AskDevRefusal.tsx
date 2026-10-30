"use client";

import { useState } from "react";

import {
    REFUSAL_COPY,
    isBudgetRefusal,
    narrowingAxis,
    nothingLeftToCut,
    overrunSentence,
    type NarrowerReask,
    type RefusalTurn,
} from "./refusalModel";

const PILL =
    "inline-flex items-center rounded-full border border-(--card-stroke) px-2 py-0.5 text-xs font-medium";

/**
 * A budget refusal turn (CHAOS-3440): the answer did not fit, what did not fit as measured, and the
 * narrower question ACR's axis points to, in this view's words. On the live turn (`onReask` given)
 * one control hands the question back to the composer with the axis, once; it carries no receipt,
 * because a refusal offers none (INV-1). A prior turn is read-only.
 */
export function AskDevRefusal({
    turn,
    onReask,
}: {
    turn: RefusalTurn;
    onReask?: (reask: NarrowerReask) => void;
}) {
    const { refusal } = turn;
    const [sent, setSent] = useState(false);
    // Only a budget refusal says what did not fit: any other terminal error claims nothing about size
    // and offers no narrower re-ask.
    if (!isBudgetRefusal(refusal)) {
        return (
            <article className="space-y-2" data-testid="ask-dev-refusal" data-kind="other">
                <span className={`${PILL} text-foreground`} data-testid="ask-dev-answer-status">
                    {REFUSAL_COPY.otherStatus}
                </span>
                <p className="text-sm text-foreground" data-testid="ask-dev-answer-lead">
                    {REFUSAL_COPY.otherLead}
                </p>
            </article>
        );
    }
    const axis = narrowingAxis(refusal);
    const overrun = overrunSentence(refusal);
    const retryable = refusal.error.error.retryable;

    return (
        <article
            className="space-y-3"
            data-testid="ask-dev-refusal"
            data-kind="budget"
            data-axis={axis ?? "none"}
            data-live={onReask !== undefined && !sent ? "true" : "false"}
        >
            <div className="space-y-2">
                <span className={`${PILL} text-foreground`} data-testid="ask-dev-answer-status">
                    {REFUSAL_COPY.status}
                </span>
                <p
                    className="text-base font-semibold text-foreground"
                    data-testid="ask-dev-answer-lead"
                >
                    {REFUSAL_COPY.lead}
                </p>
                {overrun === null ? null : (
                    <p className="text-sm text-foreground" data-testid="ask-dev-refusal-overrun">
                        {overrun}
                        {nothingLeftToCut(refusal) ? ` ${REFUSAL_COPY.nothingLeftToCut}` : null}
                    </p>
                )}
                {retryable ? null : (
                    <p className="text-xs text-(--ink-muted)">{REFUSAL_COPY.sameAgain}</p>
                )}
            </div>
            <p
                className="text-sm font-semibold text-foreground"
                data-testid="ask-dev-refusal-narrower"
            >
                {axis === null ? REFUSAL_COPY.noAxis : REFUSAL_COPY.axis[axis]}
            </p>
            {onReask === undefined ? (
                <p className="text-xs text-(--ink-muted)" data-testid="ask-dev-refusal-prior">
                    {REFUSAL_COPY.priorTurnNote}
                </p>
            ) : axis === null ? null : (
                <button
                    type="button"
                    data-testid="ask-dev-refusal-reask"
                    disabled={sent}
                    onClick={() => {
                        onReask({ question: turn.question, axis });
                        setSent(true);
                    }}
                    className="inline-flex items-center rounded-(--radius-sm) bg-(--accent-2) px-3 py-1.5 text-sm font-semibold text-(--surface) transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2) disabled:opacity-50"
                >
                    {sent ? REFUSAL_COPY.reasked : REFUSAL_COPY.reask}
                </button>
            )}
        </article>
    );
}
