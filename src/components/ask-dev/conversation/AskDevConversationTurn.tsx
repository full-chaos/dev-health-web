"use client";

import { CTA_LABELS } from "@/lib/design/cta";

import { AskDevTurn } from "../answer/AskDevTurn";
import type { ClarificationChoice } from "../answer/clarificationModel";
import { CLARIFICATION_COPY } from "../answer/clarificationModel";
import type { NarrowerReask } from "../answer/refusalModel";
import { SafeAnswerText } from "../answer/SafeAnswerText";
import type { NotRunReason, StoppedReason, StoreTurn, TurnOutcome } from "./conversationStore";

/** Why ACR stopped a run after it started (codex r3 on #1639). No retry: the way on is a new question. */
export const STOPPED_COPY: Readonly<Record<StoppedReason, string>> = {
    rate_limited: "This question was rate limited after it started. Wait a moment, then ask again.",
    interpretation_rejected:
        "Dev could not accept an interpretation of your question. Try rephrasing it.",
    synthesis_rejected: "Dev could not accept a generated answer. Try rephrasing your question.",
};

/**
 * What to do after ACR refused a question before it ran (CHAOS-12201). The ACR client says the same
 * words (`safeAcrRuntimeMessage`); a test holds them equal. No internal service is named.
 */
export const NOT_RUN_COPY: Readonly<Record<NotRunReason, string>> = {
    access_denied:
        "Ask Dev is not available in this session. Sign in again with your own account, or ask an admin to add you to this organization.",
    no_repository:
        "No repository is available to you here. Connect a repository, or ask an admin for access to one.",
    budget_exhausted: "Dev ran out of time before the question could start. Ask again.",
    concurrency_limited: "Too many questions are running. Wait for one to finish, then ask again.",
    allowance_exhausted: "Your organization has used this month's Ask Dev allowance.",
    stream_unavailable: "Ask Dev answers are turned off here right now.",
    not_entitled: "Ask Dev is not available for this organization.",
    repo_forbidden:
        "A repository this question needs is not available to you. If it was connected just now, wait for its first sync.",
    budget_refusal: "This question needs more than one answer can hold. Ask a narrower question.",
    rate_limited: "Too many questions in a short time. Wait a moment, then ask again.",
};

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
        case "not_run":
            return NOT_RUN_COPY[outcome.reason];
        case "stopped":
            return STOPPED_COPY[outcome.reason];
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
            {(outcome.kind === "failed" || outcome.kind === "not_run") &&
            outcome.retry &&
            onRetry ? (
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
