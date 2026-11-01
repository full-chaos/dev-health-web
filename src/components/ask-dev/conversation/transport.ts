import type {
    ACRContextFabricInvestigationRequestV1 as InvestigationRequest,
    ACRErrorV1,
    ContextFabricSubmissionStatusV1,
} from "@/lib/acr/generated";

import type { TranscriptResult } from "@/lib/ask-dev/transcript";

/**
 * The one seam between the Ask Dev conversation store (CHAOS-11928) and ACR. The browser calls ACR
 * directly (design amendment 2026-10-30, "Ask Dev: browser calls ACR directly with an ACR OAuth
 * credential"): there is no web or ask-dev proxy in front of it. The store decides WHEN to call and
 * what each answer means; a transport only carries the calls.
 *
 * The live transport is `src/lib/ask-dev/acr-transport/` (T14a, CHAOS-12104; T14b, CHAOS-12336),
 * on the ACR browser OAuth client (T13, CHAOS-12103). `acrBrowserTransport()` returns it only while
 * the browser ACR config is set (`ACR_OAUTH_ISSUER`); otherwise it is `null`, and the panel draws no
 * composer and sends nothing (prod, until the T13 roll). Test mode supplies a transport of its own
 * (`testModeTransport.ts`). The live proofs are CHAOS-12192, 12199 and the other tickets T14 blocks.
 *
 * Authorization is not part of this seam: the transport attaches the credential, and ACR decides
 * every call again (INV-1). The store never sees a token.
 *
 * The thread calls (history, reload recovery, reattach, cancel, feedback), the selection rules, the
 * ownership tokens and the browser contract checks are documented in
 * `docs/architecture/ask-dev-thread-seam.md` (E6 web design v5).
 */

/** ACR's closed stage vocabulary, in its one order (`context_fabric_investigation_event.v1`). */
export const INVESTIGATION_STAGES = [
    "interpreting",
    "resolving_subjects",
    "reading_facts",
    "synthesizing",
    "validating",
] as const;

export type InvestigationStage = (typeof INVESTIGATION_STAGES)[number];

type EventBase = { readonly seq: number; readonly request_id: string };

/**
 * One parsed `context_fabric_investigation_event.v1` event, as the store reads it. The transport
 * parses and checks the frames (T14 owns the grammar); `result` and `error` are terminal.
 */
export type InvestigationEvent =
    | (EventBase & {
          readonly type: "accepted";
          readonly reserved_result_id: string;
          readonly submission_id?: string | undefined;
          readonly thread_id?: string | undefined;
          readonly started_at: string;
          readonly budget_seconds: number;
      })
    | (EventBase & {
          readonly type: "stage";
          readonly stage: InvestigationStage;
          readonly state: "started" | "completed";
          readonly elapsed_ms: number;
      })
    | (EventBase & {
          readonly type: "heartbeat";
          readonly stage?: InvestigationStage | undefined;
          /** Milliseconds since `started_at` (CHAOS-11957: the attach continuity check reads it). */
          readonly elapsed_ms: number;
      })
    | (EventBase & { readonly type: "result"; readonly result: TranscriptResult })
    | (EventBase & {
          readonly type: "error";
          readonly reserved_result_id: string;
          readonly error: ACRErrorV1;
          readonly stage?: InvestigationStage | undefined;
      });

export type InvestigateCall = {
    /** The wire request, built by `buildInvestigationRequest`; sent byte for byte. */
    readonly request: InvestigationRequest;
    /** `X-ACR-Submission-ID`: one per user submit, reused only to retry this identical request. */
    readonly submissionId: string;
    /** `X-ACR-Thread-ID`: one per conversation, sent on every turn. */
    readonly threadId: string;
    /**
     * The run's absolute deadline D (epoch ms). The transport computes ACR's wait-budget header from
     * what is left of it (plan §2.7.6); the store aborts the run at D whatever it is waiting on.
     */
    readonly deadline: number;
    /** Aborting it is the only cancel (plan §2.7.4: a disconnect ends the run). */
    readonly signal: AbortSignal;
};

/**
 * ACR answered before the stream opened: an HTTP status and its `error.v1` body (for example
 * `409 submission_in_progress` on a retry while the first run is still live).
 *
 * `retryAfterSeconds` is ACR's `Retry-After` header in whole seconds, when the response had a
 * valid one (the 429s `concurrency_limited` and `allowance_exhausted`, and
 * `submission_in_progress`). The panel shows it (plan §2.7.8); the transport parses it.
 */
export class TransportRefusal extends Error {
    readonly status: number;
    readonly error: ACRErrorV1;
    readonly retryAfterSeconds: number | undefined;

    constructor(status: number, error: ACRErrorV1, retryAfterSeconds?: number) {
        super(`ACR refused the call: ${String(status)} ${error.error.code}`);
        this.name = "TransportRefusal";
        this.status = status;
        this.error = error;
        this.retryAfterSeconds =
            retryAfterSeconds !== undefined &&
            Number.isSafeInteger(retryAfterSeconds) &&
            retryAfterSeconds >= 0
                ? retryAfterSeconds
                : undefined;
    }
}

/**
 * Why the browser transport ended a run itself (plan §2.7.6 and §2.7.7, moved to the browser by
 * the direct-to-ACR amendment §6 and §8; CHAOS-11929). Each one has its own panel state:
 *
 * - `stalled`: no bytes for 30 s after `accepted`. The transport aborted the stream.
 * - `admission_timeout`: no response headers within min(15 s, D − now). The transport aborted the
 *   call ("deadline: admission").
 * - `budget_exhausted`: what was left of D could not cover ACR's minimum wait budget. Nothing was
 *   sent.
 * - `invalid_upstream`: the stream broke the event grammar or a cap before a valid terminal. The
 *   transport aborted it.
 * - `authorization_required`: the browser holds no ACR access token, or ACR answered 401 and the
 *   token store had no other token. Nothing ran; the way on is to connect Ask Dev to ACR. On a 401
 *   the transport tells the store, reads the token once more, and sends the call once more only
 *   with a different (refreshed) token: at most 2 requests (CHAOS-12305).
 *
 * The browser's abort is a disconnect, and a disconnect ends ACR's run (plan §2.7.4), so the store
 * ends the turn with the reason and does not poll the submission status.
 */
export const TRANSPORT_FAILURE_REASONS = [
    "stalled",
    "admission_timeout",
    "budget_exhausted",
    "invalid_upstream",
    "authorization_required",
] as const;

export type TransportFailureReason = (typeof TRANSPORT_FAILURE_REASONS)[number];

export function isTransportFailureReason(value: unknown): value is TransportFailureReason {
    return (TRANSPORT_FAILURE_REASONS as readonly unknown[]).includes(value);
}

/** The browser transport ended the run itself, for `reason`. */
export class TransportFailure extends Error {
    readonly reason: TransportFailureReason;

    constructor(reason: TransportFailureReason) {
        super(`the Ask Dev transport ended the run: ${reason}`);
        this.name = "TransportFailure";
        this.reason = reason;
    }
}

/** A turn's submission state, as a thread serves it (`context_fabric_thread.v1` `ThreadTurn`). */
export type ThreadTurnState = "running" | "done" | "done_unsaved" | "abandoned";

/**
 * One turn of a thread, as the store reads it (CHAOS-11956). The thread schemas are excluded from
 * `generated.ts` (`scripts/acr-contract-artifacts.mjs`), so these are narrow views of the fields
 * the store uses, built only from a body that passed `parseThread` (`@/lib/acr/threadContract`).
 */
export type ThreadTurnView = {
    readonly submissionId: string;
    readonly state: ThreadTurnState;
    /** The question as the caller sent it; `null` on a turn admitted before ACR recorded it. */
    readonly question: string | null;
    /** On a `done` turn ACR would serve now: the final result's id. */
    readonly resultId: string | null;
    /** On a `done` turn ACR would not serve now (`result_withheld`). */
    readonly resultWithheld: boolean;
    readonly admittedAt: string;
};

/** The caller's own conversation: one page of turns, oldest first. */
export type ThreadView = {
    readonly threadId: string;
    readonly turnCount: number;
    readonly createdAt: string;
    readonly lastTurnAt: string;
    readonly expiresAt: string;
    readonly turns: readonly ThreadTurnView[];
    /** Opaque; present when earlier turns exist (pass it back as `before`). */
    readonly earlierTurnsCursor: string | null;
};

/** One row of the caller's conversation list (`context_fabric_thread_list.v1` `ThreadSummary`). */
export type ThreadSummaryView = {
    readonly threadId: string;
    readonly turnCount: number;
    readonly createdAt: string;
    readonly lastTurnAt: string;
    readonly expiresAt: string;
    /**
     * The question of the thread's first turn, as the caller sent it (`first_question`, acr #1823;
     * CHAOS-12238). `null` when ACR serves none: a legacy turn, or its switch is off.
     */
    readonly firstQuestion: string | null;
};

/** One page of the list: newest `last_turn_at` first, then `thread_id`. */
export type ThreadListView = {
    readonly threads: readonly ThreadSummaryView[];
    /** Opaque; present when more threads follow (pass it back as `cursor`). */
    readonly nextCursor: string | null;
};

/** One feedback flag (`context_fabric_result_feedback.v1`): yes, no, or unset. */
export type FeedbackFlag = "yes" | "no" | "unset";

/**
 * The caller's feedback on one of its own results, as the feedback store reads it (CHAOS-11958):
 * the two flags and nothing else. There is no free text in the contract.
 */
export type FeedbackView = {
    readonly resultId: string;
    readonly correct: FeedbackFlag;
    readonly useful: FeedbackFlag;
};

/**
 * ACR's answer to Stop (CHAOS-11957; acr `ContextFabricSubmissionCancelHandler`):
 *
 * - `running` (202): ACR recorded the cancel request (`t_req` is ACR's). The run ends on its own
 *   terminal: `canceled`, or a result that finished first.
 * - `final` (204): the submission is no longer running (done, done_unsaved or abandoned).
 * - `not_leased` (409 `submission_in_progress`, `details.reason: not_leased`): the run has no lease,
 *   so the cancel endpoint cannot stop it. Only the connection that owns it can (a disconnect).
 */
export type CancelAnswer =
    | { readonly kind: "running" }
    | { readonly kind: "final" }
    | { readonly kind: "not_leased"; readonly retryAfterSeconds?: number | undefined };

export type AskDevTransport = {
    /**
     * Opens one investigation stream (`Accept: text/event-stream`). It yields the events in `seq`
     * order and ends after the terminal. It throws a `TransportRefusal` when ACR answered before
     * the stream, and a `TransportFailure` when it ended the run itself. Ending without a terminal,
     * or throwing anything else but an abort, is a dropped run: the store recovers it through the
     * submission status.
     */
    readonly investigate: (call: InvestigateCall) => AsyncIterable<InvestigationEvent>;
    /**
     * `GET …/investigations/submissions/{submission_id}`: the caller's own submission, or `null`
     * for ACR's 404 (unknown id, or not this principal's). Each call is a fresh authorized call.
     */
    readonly submissionStatus: (
        submissionId: string,
        signal: AbortSignal,
    ) => Promise<ContextFabricSubmissionStatusV1 | null>;
    /**
     * `GET …/investigations/{result_id}`: replays a stored result, which ACR authorizes again. ACR's
     * 404 (not the caller's, or not served now) throws a `TransportRefusal` with status 404.
     */
    readonly readResult: (resultId: string, signal: AbortSignal) => Promise<TranscriptResult>;
    /**
     * `GET /api/v1/context-fabric/threads?limit&cursor` (CHAOS-11956): one page of the caller's
     * conversations. The body is checked with `parseThreadList` before it is mapped; a body that
     * fails it throws `TransportFailure("invalid_upstream")`. A 400 (a stale or foreign cursor)
     * throws a `TransportRefusal`.
     */
    readonly listThreads: (call: {
        readonly cursor?: string | undefined;
        readonly limit: number;
        readonly signal: AbortSignal;
    }) => Promise<ThreadListView>;
    /**
     * `GET /api/v1/context-fabric/threads/{thread_id}?before` (CHAOS-11956): the caller's own
     * conversation, or `null` for ACR's 404 (another principal's, unknown, deleted, expired or
     * malformed: the same answer). Checked with `parseThread`, as above.
     */
    readonly readThread: (call: {
        readonly threadId: string;
        readonly before?: string | undefined;
        readonly signal: AbortSignal;
    }) => Promise<ThreadView | null>;
    /**
     * `DELETE /api/v1/context-fabric/threads/{thread_id}` (CHAOS-11956). ACR answers 204 for the
     * caller's own thread and for any other well-formed id alike, so it resolves for both. A delete
     * closes the thread; it does not stop a running turn.
     */
    readonly deleteThread: (call: {
        readonly threadId: string;
        readonly signal: AbortSignal;
    }) => Promise<void>;
    /**
     * `GET …/investigations/feedback/{result_id}` (CHAOS-11958): the caller's feedback on one of
     * its own results, or `null` for ACR's 404 (not the caller's Ask Dev result, or one ACR would
     * not serve now: the same answer). A never-rated result reads `unset`/`unset`. The body is
     * checked with `parseResultFeedback` before it is mapped; a body that fails it throws
     * `TransportFailure("invalid_upstream")`.
     */
    readonly readFeedback: (call: {
        readonly resultId: string;
        readonly signal: AbortSignal;
    }) => Promise<FeedbackView | null>;
    /**
     * `POST …/investigations/feedback/{result_id}` with the whole feedback (both flags; `unset`
     * clears one): ACR answers what it stored, checked as above. ACR's 404 throws a
     * `TransportRefusal` with status 404.
     */
    readonly setFeedback: (call: {
        readonly resultId: string;
        readonly correct: FeedbackFlag;
        readonly useful: FeedbackFlag;
        readonly signal: AbortSignal;
    }) => Promise<FeedbackView>;
    /**
     * `GET …/investigations/submissions/{submission_id}/events` (CHAOS-11957): attaches to the
     * caller's own leased run. The request sends exactly `Accept: text/event-stream`, and
     * `Last-Event-ID` (a safe integer, in decimal) when `lastEventId` is given. The stream yields the
     * run's own events after the cursor (from `accepted`, `seq` 1, without one), then the new ones,
     * then the terminal. ACR's 404 (not the caller's open submission) and 410 `cursor_expired` (the
     * cursor is outside the kept window, the run has no lease, or it ended) throw a
     * `TransportRefusal`; the store then reads the submission status. The pre-header wait (15 s) and
     * the stall rule (30 s with no byte; a `: keepalive` comment counts) throw a `TransportFailure`.
     * The store checks the continuity of what it yields (`seq`, `request_id`, `elapsed_ms`).
     */
    readonly attach: (call: {
        readonly submissionId: string;
        readonly lastEventId?: number | undefined;
        readonly signal: AbortSignal;
    }) => AsyncIterable<InvestigationEvent>;
    /**
     * `POST …/investigations/submissions/{submission_id}/cancel` (CHAOS-11957). ACR's 404 (not the
     * caller's open submission) throws a `TransportRefusal`.
     */
    readonly cancel: (call: {
        readonly submissionId: string;
        readonly signal: AbortSignal;
    }) => Promise<CancelAnswer>;
};
