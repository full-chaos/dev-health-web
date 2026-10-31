"use client";

import { CTA_LABELS } from "@/lib/design/cta";

import { AskDevTurn } from "../answer/AskDevTurn";
import type { ClarificationChoice } from "../answer/clarificationModel";
import { CLARIFICATION_COPY } from "../answer/clarificationModel";
import type { NarrowerReask } from "../answer/refusalModel";
import { SafeAnswerText } from "../answer/SafeAnswerText";
import type { StoreTurn, TurnOutcome } from "./conversationStore";

/**
 * The line a turn shows while it has no answer view. Plan §2.7.4 and §2.7.5 fix the canceled,
 * unsaved and interrupted sentences. The progress of a running turn is I-S07's (CHAOS-11929); until
 * then it shows one plain line.
 */
export const TURN_STATUS_COPY = {
    running: "Investigating…",
    recovering: "The connection dropped. Checking whether the answer finished…",
    failedRetry: "The question could not be sent. Try again.",
    failed: "The investigation did not finish. Ask again.",
    unsaved: "The answer was shown but not saved — ask again",
    interrupted: "Interrupted — ask again",
    canceled: "Canceled. If the answer had already finished, it is kept.",
    threadClosed:
        "This conversation has ended (deleted, expired or full). Ask again to start a new one.",
} as const satisfies Record<string, string>;

type StatusOutcome = Exclude<TurnOutcome, { kind: "answered" } | { kind: "refused" }>;

function statusLine(outcome: StatusOutcome): string {
    switch (outcome.kind) {
        case "running":
            return TURN_STATUS_COPY.running;
        case "recovering":
            return TURN_STATUS_COPY.recovering;
        case "failed":
            return outcome.retry ? TURN_STATUS_COPY.failedRetry : TURN_STATUS_COPY.failed;
        case "unsaved":
            return TURN_STATUS_COPY.unsaved;
        case "interrupted":
            return TURN_STATUS_COPY.interrupted;
        case "canceled":
            return TURN_STATUS_COPY.canceled;
        case "thread_closed":
            return TURN_STATUS_COPY.threadClosed;
    }
}

/** One turn of the store: the answer views once ACR answered, else the question and its status. */
export function AskDevConversationTurn({
    turn,
    onConfirm,
    onReask,
    onRetry,
}: {
    turn: StoreTurn;
    /** The three actions are given on the live (last) turn only; a prior turn is read-only. */
    onConfirm?: ((choice: ClarificationChoice) => void) | undefined;
    onReask?: ((reask: NarrowerReask) => void) | undefined;
    onRetry?: (() => void) | undefined;
}) {
    const { outcome } = turn;
    if (outcome.kind === "answered") {
        return <AskDevTurn turn={outcome.result} onConfirm={onConfirm} onReask={onReask} />;
    }
    if (outcome.kind === "refused") {
        return (
            <AskDevTurn
                turn={{ question: turn.question, refusal: outcome.refusal }}
                onReask={onReask}
            />
        );
    }
    return (
        <div className="space-y-3" data-testid="ask-dev-turn" data-status={outcome.kind}>
            <p className="rounded-(--radius-sm) bg-(--surface-raised) px-3 py-2 text-sm text-foreground">
                <span className="sr-only">{CLARIFICATION_COPY.youAsked}: </span>
                <SafeAnswerText text={turn.question} />
            </p>
            <p data-testid="ask-dev-turn-status" className="text-sm text-(--ink-muted)">
                {statusLine(outcome)}
            </p>
            {outcome.kind === "failed" && outcome.retry && onRetry ? (
                <button
                    type="button"
                    data-testid="ask-dev-turn-retry"
                    onClick={onRetry}
                    className="inline-flex items-center rounded-(--radius-sm) border border-(--card-stroke) bg-(--surface) px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-(--surface-raised) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)"
                >
                    {CTA_LABELS.retry}
                </button>
            ) : null}
        </div>
    );
}
