import type {
    CancelAnswer,
    InvestigationEvent as AcrInvestigationEvent,
} from "@full-chaos/ask-dev/acr-client";

import type {
    ACRContextFabricInvestigationRequestV1 as InvestigationRequest,
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

export {
    INVESTIGATION_STAGES,
    isTransportFailureReason,
    TRANSPORT_FAILURE_REASONS,
    TransportFailure,
    TransportRefusal,
    type CancelAnswer,
    type InvestigationStage,
    type TransportFailureReason,
} from "@full-chaos/ask-dev/acr-client";

/** One parsed `context_fabric_investigation_event.v1` event, as the store reads it. */
export type InvestigationEvent = AcrInvestigationEvent<TranscriptResult>;

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

/** One evidence reference as ACR expanded it for one result (`expanded_evidence.v1`). */
export type EvidenceView = {
    readonly refId: string;
    /** Served text. */
    readonly citation: string;
    /** Served text. */
    readonly excerpt?: string;
    /** ISO timestamp. */
    readonly observedAt: string;
    /** An open vocabulary: it selects a state, and is never shown. */
    readonly availability: string;
    /** Served text. */
    readonly redactionReason?: string;
    readonly structuredFields: Readonly<Record<string, unknown>>;
};

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
        /**
         * The user opened this conversation (CHAOS-12474): with no token, the read may run the
         * silent step. Unset, a background read: a restore from the hint, an earlier page.
         */
        readonly userAct?: boolean | undefined;
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
     * `GET /api/v1/agent-context/evidence/{ref}?result_id=` (CHAOS-12105): one reference, as the
     * result that cited it cites it. `null` for ACR's 404 (gone, or another principal's: the same
     * answer). A body that fails `parseExpandedEvidence` throws `TransportFailure("invalid_upstream")`.
     */
    readonly readEvidence: (call: {
        readonly refId: string;
        readonly resultId: string;
        readonly signal: AbortSignal;
    }) => Promise<EvidenceView | null>;
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
