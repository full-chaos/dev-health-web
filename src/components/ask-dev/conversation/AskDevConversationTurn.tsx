"use client";

import { useState } from "react";

import { CTA_LABELS } from "@/lib/design/cta";

import { AskDevTurn } from "../answer/AskDevTurn";
import type { ClarificationChoice } from "../answer/clarificationModel";
import { CLARIFICATION_COPY, isNonAnswer } from "../answer/clarificationModel";
import type { NarrowerReask } from "../answer/refusalModel";
import { SafeAnswerText } from "../answer/SafeAnswerText";
import { AskDevFeedback } from "./AskDevFeedback";
import { AskDevElapsed, AskDevStageChecklist } from "./AskDevProgress";
import type {
    DeadlineKind,
    LimitKind,
    NotRunReason,
    StoppedReason,
    StoreTurn,
    TurnOutcome,
} from "./conversationStore";

/**
 * What to do after ACR refused a question before it ran (CHAOS-12201). The ACR client says the same
 * words (`safeAcrRuntimeMessage`); a test holds them equal. No internal service is named.
 */
export const NOT_RUN_COPY: Readonly<Record<NotRunReason, string>> = {
    access_denied:
        "Ask Dev is not available in this session. Sign in again with your own account, or ask an admin to add you to this organization.",
    no_repository:
        "No repository is available to you here. Connect a repository, or ask an admin for access to one.",
    not_entitled: "Ask Dev is not available for this organization.",
    repo_forbidden:
        "A repository this question needs is not available to you. If it was connected just now, wait for its first sync.",
    budget_refusal: "This question needs more than one answer can hold. Ask a narrower question.",
    rate_limited: "Too many questions in a short time. Wait a moment, then ask again.",
};

/** Why ACR stopped a run after it started (CHAOS-12201). No retry: the way on is a new question. */
export const STOPPED_COPY: Readonly<Record<StoppedReason, string>> = {
    rate_limited: "This question was rate limited after it started. Wait a moment, then ask again.",
    interpretation_rejected:
        "Dev could not accept an interpretation of your question. Try rephrasing it.",
    synthesis_rejected: "Dev could not accept a generated answer. Try rephrasing your question.",
};

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
    /** CHAOS-12104: no ACR access in this tab, or ACR's 401; the Connect link follows. */
    connect:
        "Ask Dev needs your permission to answer from your data. Connect Ask Dev, then ask again.",
    threadClosed:
        "This conversation has ended (deleted, expired or full). Ask again to start a new one.",
    /** CHAOS-11956: a restored turn whose answer is being read again. */
    restoring: "Loading this answer…",
    unavailable: "This answer is not available to you now.",
    restoreFailed: "This answer could not be loaded.",
    observing:
        "This question was still running when the conversation was loaded. Checking for its answer…",
    /** E6 design v5 N4: a failed read confirms nothing, so no liveness is claimed. */
    unconfirmed: "The current state could not be confirmed. Check back later.",
    /** Only from a status read that succeeded (N4); followed by the local time. */
    lastSeenRunning: "Last seen running at",
    /** CHAOS-11957: Stop reached ACR; the run ends on its own terminal. */
    canceling: "Canceling…",
    /** After a Stop, the status cannot tell a cancel from a lost run (E6 design v5 §5.4). */
    halted: "Stopped or interrupted. Ask again.",
    stopRequested: "Stopping…",
    /** ACR cannot stop a run that has no lease, and this tab does not hold its connection. */
    stopNotLeased: "This run cannot be stopped. It ends on its own.",
    /** A turn ACR admitted before it recorded questions. Display only: it is never sent. */
    questionNotRecorded: "Question not recorded",
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
        case "not_run":
            return NOT_RUN_COPY[outcome.reason];
        case "connect":
            return TURN_STATUS_COPY.connect;
        case "stopped":
            return STOPPED_COPY[outcome.reason];
        case "restoring":
            return TURN_STATUS_COPY.restoring;
        case "unavailable":
            return TURN_STATUS_COPY.unavailable;
        case "restore_failed":
            return TURN_STATUS_COPY.restoreFailed;
        case "observing":
            return TURN_STATUS_COPY.observing;
        case "unconfirmed":
            return TURN_STATUS_COPY.unconfirmed;
        case "canceling":
            return TURN_STATUS_COPY.canceling;
        case "halted":
            return TURN_STATUS_COPY.halted;
    }
}

/** The question as the user asked it, or the plain note that ACR did not record it. */
function TurnQuestion({ question }: { question: string | null }) {
    if (question === null) {
        return (
            <p
                data-testid="ask-dev-turn-question-not-recorded"
                className="rounded-(--radius-sm) bg-(--surface-raised) px-3 py-2 text-sm italic text-(--ink-muted)"
            >
                {TURN_STATUS_COPY.questionNotRecorded}
            </p>
        );
    }
    return (
        <p className="rounded-(--radius-sm) bg-(--surface-raised) px-3 py-2 text-sm text-foreground">
            <span className="sr-only">{CLARIFICATION_COPY.youAsked}: </span>
            <SafeAnswerText text={question} />
        </p>
    );
}

/** A failed turn may be sent again under its key only when the store said so. */
/** Where the ACR authorization starts (c2, CHAOS-12303); `return` brings the tab back here. */
export const ACR_OAUTH_START_PATH = "/ask-dev/oauth/start";

/**
 * "Connect Ask Dev" (CHAOS-12104): the tab holds no ACR access, or ACR answered 401. A link to the
 * start page, which owns the flow and its own failures; the panel never starts it by itself.
 */
function ConnectAskDev() {
    // A turn exists only in the browser (the store is client state), so the page is known here.
    const [href] = useState(() =>
        typeof window === "undefined"
            ? ACR_OAUTH_START_PATH
            : `${ACR_OAUTH_START_PATH}?return=${encodeURIComponent(
                  `${window.location.pathname}${window.location.search}`,
              )}`,
    );
    return (
        <a
            href={href}
            data-testid="ask-dev-turn-connect"
            className="inline-flex items-center rounded-(--radius-sm) border border-(--card-stroke) bg-(--surface) px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-(--surface-raised) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)"
        >
            {CTA_LABELS.askDevConnect}
        </a>
    );
}

function retryable(outcome: StatusOutcome): boolean {
    return (
        (outcome.kind === "failed" || outcome.kind === "limited" || outcome.kind === "not_run") &&
        outcome.retry
    );
}

/** One turn of the store: the answer views once ACR answered, else the question and its status. */
export function AskDevConversationTurn({
    turn,
    onConfirm,
    onReask,
    onRetry,
    onReload,
}: {
    turn: StoreTurn;
    /** The three actions are given on the live (last) turn only; a prior turn is read-only. */
    onConfirm?: ((choice: ClarificationChoice) => void) | undefined;
    onReask?: ((reask: NarrowerReask) => void) | undefined;
    onRetry?: (() => void) | undefined;
    /** "Load again" on a restored turn whose answer read failed: a GET (CHAOS-11956). */
    onReload?: (() => void) | undefined;
}) {
    const { outcome } = turn;
    if (outcome.kind === "answered") {
        const answer = <AskDevTurn turn={outcome.result} onConfirm={onConfirm} onReask={onReask} />;
        // CHAOS-11958: feedback on an answer; a clarification or a no-match asks nothing to judge.
        if (isNonAnswer(outcome.result.status)) return answer;
        return (
            <div className="space-y-3">
                {answer}
                <AskDevFeedback resultId={outcome.result.result_id} />
            </div>
        );
    }
    if (outcome.kind === "refused") {
        return (
            <AskDevTurn
                turn={{
                    question: turn.question ?? TURN_STATUS_COPY.questionNotRecorded,
                    refusal: outcome.refusal,
                }}
                onReask={turn.question === null ? undefined : onReask}
            />
        );
    }
    return (
        <div
            className="space-y-3"
            data-testid="ask-dev-turn"
            data-status={outcome.kind}
            data-origin={turn.origin}
        >
            <TurnQuestion question={turn.question} />
            <div className="space-y-2" data-testid="ask-dev-turn-state">
                <p data-testid="ask-dev-turn-status" className="text-sm text-(--ink-muted)">
                    {statusLine(outcome)}
                </p>
                {outcome.kind === "running" ? (
                    <AskDevStageChecklist stages={outcome.stages} />
                ) : null}
                {outcome.kind === "running" ||
                outcome.kind === "recovering" ||
                outcome.kind === "observing" ||
                outcome.kind === "canceling" ? (
                    <AskDevElapsed startedAt={outcome.startedAt} />
                ) : null}
                {outcome.kind === "unconfirmed" && outcome.lastSeenRunningAt !== undefined ? (
                    <p data-testid="ask-dev-turn-last-seen" className="text-xs text-(--ink-muted)">
                        {TURN_STATUS_COPY.lastSeenRunning}{" "}
                        {new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(
                            new Date(outcome.lastSeenRunningAt),
                        )}
                    </p>
                ) : null}
                {turn.stop === "requested" ? (
                    <p data-testid="ask-dev-turn-stop" className="text-sm text-(--ink-muted)">
                        {TURN_STATUS_COPY.stopRequested}
                    </p>
                ) : turn.stop === "not_leased" ? (
                    <p data-testid="ask-dev-turn-stop" className="text-sm text-(--ink-muted)">
                        {TURN_STATUS_COPY.stopNotLeased}
                    </p>
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
            {outcome.kind === "connect" ? <ConnectAskDev /> : null}
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
            {outcome.kind === "restore_failed" && onReload ? (
                <button
                    type="button"
                    data-testid="ask-dev-turn-reload"
                    onClick={onReload}
                    className="inline-flex items-center rounded-(--radius-sm) border border-(--card-stroke) bg-(--surface) px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-(--surface-raised) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent-2)"
                >
                    {CTA_LABELS.askDevLoadAgain}
                </button>
            ) : null}
        </div>
    );
}
