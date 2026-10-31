"use client";

import { CTA_LABELS } from "@/lib/design/cta";

import { AskDevTurn } from "../answer/AskDevTurn";
import type { ClarificationChoice } from "../answer/clarificationModel";
import { CLARIFICATION_COPY } from "../answer/clarificationModel";
import type { NarrowerReask } from "../answer/refusalModel";
import { SafeAnswerText } from "../answer/SafeAnswerText";
import { AskDevElapsed, AskDevStageChecklist } from "./AskDevProgress";
import type { DeadlineKind, LimitKind, StoreTurn, TurnOutcome } from "./conversationStore";

/**
 * The line a turn shows while it has no answer view: one per state of plan §2.7.8 (CHAOS-11929).
 * Plan §2.7.4 and §2.7.5 fix the canceled, unsaved and interrupted sentences. None of these states
 * shows answer content, coverage or a score: only a validated `result` does (checks 11, 12).
 */
export const TURN_STATUS_COPY = {
    running: "Investigating…",
    recovering: "The connection dropped. Checking whether the answer finished…",
    failedRetry: "The question could not be sent. Try again.",
    failed: "The investigation did not finish. Ask again.",
    reference: "Reference",
    deadline: {
        model: "A model step ran out of time, so the investigation stopped before an answer. Ask again, or ask a narrower question.",
        request:
            "The investigation ran out of time before an answer. Ask again, or ask a narrower question.",
        admission: "Ask Dev did not start the investigation in time. Ask again.",
        budget_exhausted: "Ask Dev ran out of time before the question could start. Ask again.",
    },
    limited: {
        principal:
            "You already have as many questions running as Ask Dev allows. Wait for one to finish, then try again.",
        org: "Your organization already has as many questions running as Ask Dev allows. Try again shortly.",
        concurrency: "Too many questions are running at once. Try again shortly.",
        allowance: "Your organization has used this month's Ask Dev allowance.",
    },
    streamUnavailable:
        "Ask Dev cannot stream answers on this deployment right now. Contact your administrator.",
    mismatch: "This question could not be sent again as it was first sent. Ask again.",
    unsaved: "The answer was shown but not saved — ask again",
    abandoned: "An earlier run of this question ended without an answer. Ask again.",
    interrupted: "Interrupted — ask again",
    stalled: "The answer stopped arriving. Ask again.",
    canceled: "Canceled. If the answer had already finished, it is kept.",
    threadClosed:
        "This conversation has ended (deleted, expired or full). Ask again to start a new one.",
} as const satisfies {
    deadline: Record<DeadlineKind, string>;
    limited: Record<LimitKind, string>;
    [key: string]: string | Record<string, string>;
};

const UNITS = [
    { seconds: 86_400, one: "day", many: "days" },
    { seconds: 3_600, one: "hour", many: "hours" },
    { seconds: 60, one: "minute", many: "minutes" },
] as const;

/**
 * ACR's `Retry-After` as a sentence: whole seconds under a minute, else about the next whole
 * minute, hour or day (rounded up, so the user does not try too early).
 */
export function retryAfterText(seconds: number): string {
    if (seconds <= 0) return "You can try again now.";
    if (seconds < 60) {
        return `Try again in ${String(seconds)} ${seconds === 1 ? "second" : "seconds"}.`;
    }
    const unit = UNITS.find((candidate) => seconds >= candidate.seconds) ?? UNITS[2];
    const count = Math.ceil(seconds / unit.seconds);
    return `Try again in about ${String(count)} ${count === 1 ? unit.one : unit.many}.`;
}

type StatusOutcome = Exclude<TurnOutcome, { kind: "answered" } | { kind: "refused" }>;

function statusLine(outcome: StatusOutcome): string {
    switch (outcome.kind) {
        case "running":
            return TURN_STATUS_COPY.running;
        case "recovering":
            return TURN_STATUS_COPY.recovering;
        case "failed":
            return outcome.retry ? TURN_STATUS_COPY.failedRetry : TURN_STATUS_COPY.failed;
        case "deadline":
            return TURN_STATUS_COPY.deadline[outcome.deadline];
        case "limited":
            return TURN_STATUS_COPY.limited[outcome.limit];
        case "stream_unavailable":
            return TURN_STATUS_COPY.streamUnavailable;
        case "mismatch":
            return TURN_STATUS_COPY.mismatch;
        case "unsaved":
            return TURN_STATUS_COPY.unsaved;
        case "abandoned":
            return TURN_STATUS_COPY.abandoned;
        case "interrupted":
            return TURN_STATUS_COPY.interrupted;
        case "stalled":
            return TURN_STATUS_COPY.stalled;
        case "canceled":
            return TURN_STATUS_COPY.canceled;
        case "thread_closed":
            return TURN_STATUS_COPY.threadClosed;
    }
}

/** A failed turn may be sent again under its key only when the store said so. */
function retryable(outcome: StatusOutcome): boolean {
    return (outcome.kind === "failed" || outcome.kind === "limited") && outcome.retry;
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
            <div className="space-y-2" data-testid="ask-dev-turn-state">
                <p data-testid="ask-dev-turn-status" className="text-sm text-(--ink-muted)">
                    {statusLine(outcome)}
                </p>
                {outcome.kind === "running" ? (
                    <AskDevStageChecklist stages={outcome.stages} />
                ) : null}
                {outcome.kind === "running" || outcome.kind === "recovering" ? (
                    <AskDevElapsed startedAt={outcome.startedAt} />
                ) : null}
                {outcome.kind === "limited" && outcome.retryAfterSeconds !== undefined ? (
                    <p
                        data-testid="ask-dev-turn-retry-after"
                        className="text-sm text-(--ink-muted)"
                    >
                        {retryAfterText(outcome.retryAfterSeconds)}
                    </p>
                ) : null}
                {(outcome.kind === "failed" || outcome.kind === "mismatch") &&
                outcome.reference !== undefined ? (
                    <p data-testid="ask-dev-turn-reference" className="text-xs text-(--ink-muted)">
                        {TURN_STATUS_COPY.reference}:{" "}
                        <code className="font-mono">{outcome.reference}</code>
                    </p>
                ) : null}
            </div>
            {retryable(outcome) && onRetry ? (
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
