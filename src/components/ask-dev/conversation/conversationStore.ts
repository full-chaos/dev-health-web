import type {
    ACRErrorV1,
    ACRContextFabricInvestigationRequestV1 as InvestigationRequest,
    SubjectHint,
} from "@/lib/acr/generated";
import {
    buildConversationTurns,
    deriveParentReference,
    nonBlank,
    type ConversationSourceTurn,
} from "@/lib/ask-dev/conversation";
import { RUN_TIMEOUT_DEFAULT_MS } from "@/lib/ask-dev/deadline";
import {
    buildInvestigationRequest,
    newRequestId,
    type InvestigationRequestInput,
    type StructureReceipts,
} from "@/lib/ask-dev/request-builder";
import { logger } from "@/lib/logger";

import type { RefusalEvent, TranscriptResult } from "@/lib/ask-dev/transcript";
import { isCorrelationId, newSubmissionId, newThreadId, partitionTag } from "./keys";
import {
    TransportFailure,
    TransportRefusal,
    type AskDevTransport,
    type CancelAnswer,
    type EvidenceView,
    type InvestigationEvent,
    type InvestigationStage,
    type ThreadSummaryView,
    type ThreadTurnView,
    type ThreadView,
    type TransportFailureReason,
} from "./transport";

/**
 * The Ask Dev conversation store (plan §2.5 D-20, §2.7.4, §2.7.5; CHAOS-11928). One per tab.
 *
 * - **Partition.** It holds one conversation for one (org, principal). `setPartition` with another
 *   key (org switch, impersonation change, sign-out) aborts the run, clears the turns, drops the
 *   thread and bumps `generation`; a late event of the run it aborted is dropped.
 * - **Runs.** The store starts every run and owns its `AbortController`: a run outlives the panel
 *   that showed it, and only `cancel` or a partition change ends it from the browser side.
 * - **Keys (INV-2).** `thread_id` per conversation, `submission_id` per user submit. A key is reused
 *   only by `retry`, with the identical request. One run is in flight per thread: a second submit
 *   while one runs (a double click) is refused and sends nothing.
 * - **Recovery (§2.7.5).** A run that ends without a terminal is read again through the submission
 *   status, every 3 s until the run's deadline: `done` replays the FINAL `result_id`.
 * - **History (CHAOS-11956, E6 design v5 §3, §4).** A conversation is ACR's thread: `selectThread`
 *   reads it again (zero investigation calls), each answer is replayed by its final `result_id`,
 *   and a turn still running is observed through its status. Every async step checks an ownership
 *   token before it commits: transcript work holds the selection, history work the history
 *   revision, a delete only the partition (a delete that lands after a switch still hides its
 *   row). The history list and its tombstones are per partition and survive a thread switch.
 *
 * It holds no token, org id or scope; ACR authorizes every call (INV-1). Logs carry ids only, never
 * the question or the answer.
 */

/** §2.7.5: the status poll interval while recovering a dropped run. */
export const STATUS_POLL_INTERVAL_MS = 3_000;

/**
 * E6 design v5 §5.3: how long a restored running turn is observed through its status when no run
 * budget is known (no `accepted` was seen in this tab). ACR ends a run at its budget plus 30 s, so
 * a run still `running` after this window has a state the browser cannot confirm.
 */
export const OBSERVATION_CAP_MS = 10 * 60_000;

/**
 * E6 design v5 §5.2: one attach and at most two reattaches (after a gap, a protocol error, a stall
 * or a drop), then the submission status.
 */
export const ATTACH_ATTEMPTS = 3;

/** `context_fabric_investigation_event.v1` `elapsed_ms`: at most this much more than the last one. */
export const ELAPSED_STEP_MAX_MS = 11_000;

/** ACR ends a run at its budget plus 30 s (abandoned): an observed run's own bound (§5.3). */
export const BUDGET_GRACE_MS = 30_000;

/** E6 design v5 §4.2: at most this many answers of a restored thread are read at a time. */
export const REPLAY_CONCURRENCY = 4;

/** E6 design v5 §4.3: one page of the history list. */
export const HISTORY_PAGE_SIZE = 20;

/** Session storage: the hint of this tab's current conversation (E6 design v5 §4.4). */
export const THREAD_HINT_KEY = "ask-dev:thread";

/** What the stream said about one stage: started, then (usually) completed. */
export type StageState = "started" | "completed";

/** Every stage the stream named, with the furthest state it reached. A stage ACR skipped is absent. */
export type StageProgress = Readonly<Partial<Record<InvestigationStage, StageState>>>;

/**
 * Which deadline ended the run (plan §2.7.6, §2.7.8 "deadline"): `model` and `request` are ACR's
 * (`504 upstream_unavailable`, `details.deadline`); `admission` (no headers in time) and
 * `budget_exhausted` (nothing sent) are the browser transport's.
 */
export type DeadlineKind = "model" | "request" | "admission" | "budget_exhausted";

/**
 * Which shared limit refused a new submission (plan §2.9, §2.7.8 "429"). `concurrency` is a
 * `concurrency_limited` whose `details.limit` is absent or outside the contract's enum.
 */
export type LimitKind = "principal" | "org" | "concurrency" | "allowance";

export type TurnOutcome =
    /**
     * The stream is open. `stage` is the last stage ACR started; `stages` is every stage it named.
     * `startedAt` is when this run began (epoch ms, the store's clock).
     */
    | {
          readonly kind: "running";
          readonly startedAt: number;
          readonly stage?: InvestigationStage | undefined;
          readonly stages: StageProgress;
      }
    /** The stream dropped; the store is polling the submission status. */
    | { readonly kind: "recovering"; readonly startedAt: number }
    | { readonly kind: "answered"; readonly result: TranscriptResult }
    /** ACR ended the stream with a budget refusal (`AskDevRefusal` renders it). */
    | { readonly kind: "refused"; readonly refusal: RefusalEvent }
    /**
     * The run did not answer, for a reason with no state of its own (plan §2.7.8 "other errors").
     * `retry` is true only when sending the same request under the same key again is safe and
     * useful: ACR never admitted it, or it answered and the replay failed. `reference` is a
     * correlation code to quote: ACR's `request_id` when it sent one, else this turn's.
     */
    | {
          readonly kind: "failed";
          readonly retry: boolean;
          readonly reference?: string | undefined;
      }
    /** A deadline ended the run before an answer. The way on is a new question. */
    | { readonly kind: "deadline"; readonly deadline: DeadlineKind }
    /**
     * A shared limit refused the submission; nothing was admitted. `retryAfterSeconds` is ACR's
     * `Retry-After`; `retry` is ACR's `retryable` (the same key may be sent again).
     */
    | {
          readonly kind: "limited";
          readonly limit: LimitKind;
          readonly retry: boolean;
          readonly retryAfterSeconds?: number | undefined;
      }
    /** `406 stream_unavailable`: the deployment has the event stream turned off. Not retryable. */
    | { readonly kind: "stream_unavailable" }
    /** `409 submission_mismatch`: the key was reused for another request (a defect). */
    | { readonly kind: "mismatch"; readonly reference?: string | undefined }
    /** `done_unsaved`: the answer was served but not stored; there is nothing to replay. */
    | { readonly kind: "unsaved" }
    /** `409 submission_abandoned`: this key's run ended without an answer. */
    | { readonly kind: "abandoned" }
    /** A dropped run whose status read found no answer (`abandoned`, a lost record, the deadline). */
    | { readonly kind: "interrupted" }
    /** No bytes for 30 s after `accepted`: the browser transport aborted the stream. */
    | { readonly kind: "stalled" }
    | { readonly kind: "canceled" }
    /**
     * `409 thread_closed`: ACR closed this conversation (deleted, expired or full). Nothing ran; the
     * next question starts a new conversation with a new `thread_id`.
     */
    | { readonly kind: "thread_closed" }
    /**
     * ACR refused the call before anything ran, for a reason with its own guidance (CHAOS-12201):
     * the user's access, no repository in scope, Ask Dev not entitled, a repository not available, a
     * question too large, or ACR's rate limit. `retry` only where nothing was admitted and sending
     * the same request again can help.
     */
    | { readonly kind: "not_run"; readonly reason: NotRunReason; readonly retry: boolean }
    /**
     * ACR stopped a run after it started, with a terminal error that has its own meaning
     * (CHAOS-12201). The key is spent: the way on is a new question, never a same-key retry.
     */
    | { readonly kind: "stopped"; readonly reason: StoppedReason }
    /**
     * No ACR token came from the web session (CHAOS-12474): the silent step failed, or ACR refused
     * the token twice. Nothing ran. `retry` lets the user's Try again repeat the question, under
     * its key, once per click. Never retried here.
     */
    | {
          readonly kind: "authorization_failed";
          readonly reason: AuthorizationFailure;
          readonly retry: boolean;
      }
    /** A restored turn whose answer is being read again (CHAOS-11956). */
    | { readonly kind: "restoring" }
    /**
     * A restored turn whose answer ACR does not serve to the reader now: `result_withheld`, or a
     * 404 on the replay. Nothing to do.
     */
    | { readonly kind: "unavailable" }
    /** A restored turn whose answer read failed. "Load again" reads it again (GET only). */
    | { readonly kind: "restore_failed" }
    /**
     * A restored turn that was still running when the thread was read: the store reads its status
     * every 3 s (E6 design v5 §5.3). `startedAt` is ACR's `admitted_at` (epoch ms).
     */
    | { readonly kind: "observing"; readonly startedAt: number }
    /**
     * The observation window ended without a final state: the browser cannot confirm the run's
     * state (a failed read confirms nothing). The turn stays restorable from history.
     */
    | {
          readonly kind: "unconfirmed";
          /**
           * The last status read that succeeded and said `running` (epoch ms), if any: a failed
           * read confirms nothing, so this is the only state the turn may name (§5.3, N4).
           */
          readonly lastSeenRunningAt?: number | undefined;
      }
    /**
     * Stop reached ACR and the run is still running (202): the run ends on its own terminal
     * (`canceled`, or a result that finished first, which is kept). CHAOS-11957.
     */
    | { readonly kind: "canceling"; readonly startedAt: number }
    /**
     * A run that was asked to stop ended `abandoned`, as its status said. The status cannot tell a
     * cancel from a lost run, so the turn says either (E6 design v5 §5.4).
     */
    | { readonly kind: "halted" };

/** ACR's refusals before a run that have no state of their own above (error.v1). */
export type NotRunReason =
    | "access_denied"
    | "no_repository"
    | "not_entitled"
    | "repo_forbidden"
    | "budget_refusal"
    | "rate_limited";

/** Terminal errors after admission that are neither an outage nor a refusal turn. */
export type StoppedReason = "rate_limited" | "interpretation_rejected" | "synthesis_rejected";

/** Whether a same-key retry is offered, decided from the closed code, never from the wire's flag. */
const NOT_RUN_RETRY: Readonly<Record<NotRunReason, boolean>> = {
    access_denied: false,
    no_repository: false,
    not_entitled: false,
    repo_forbidden: false,
    // Before the stream there is no reserved result to show as a refusal turn; ask narrower.
    budget_refusal: false,
    // ACR's rate limit before admission: nothing ran, so the same key may be sent again.
    rate_limited: true,
};

/** ACR's codes before a run → the reason shown (two codes share "not entitled"). */
const NOT_RUN_REASON_OF: Readonly<Record<string, NotRunReason>> = {
    access_denied: "access_denied",
    no_repository: "no_repository",
    feature_not_enabled: "not_entitled",
    insufficient_scope: "not_entitled",
    repo_forbidden: "repo_forbidden",
    budget_refusal: "budget_refusal",
    rate_limited: "rate_limited",
};

/**
 * Why no ACR token came from the web session (CHAOS-12474). `session_ended` is on its way to the
 * normal sign-in; `impersonating` and `not_entitled` cannot be helped by trying again.
 */
export type AuthorizationFailure =
    "failed" | "rate_limited" | "not_entitled" | "impersonating" | "session_ended";

const AUTHORIZATION_FAILURE_OF: Readonly<
    Partial<Record<TransportFailureReason, AuthorizationFailure>>
> = {
    authorization_required: "failed",
    authorization_failed: "failed",
    authorization_limited: "rate_limited",
    not_entitled: "not_entitled",
    impersonating: "impersonating",
    session_ended: "session_ended",
};

/** The access failure a transport failure is, or `undefined` for anything else. */
export const authorizationFailureOf = (error: unknown): AuthorizationFailure | undefined =>
    error instanceof TransportFailure ? AUTHORIZATION_FAILURE_OF[error.reason] : undefined;

const authorizationOutcome = (reason: AuthorizationFailure): TurnOutcome => ({
    kind: "authorization_failed",
    reason,
    retry: reason === "failed" || reason === "rate_limited",
});

/** ACR's 409: no repository in scope. Reading again cannot help, so nothing offers a retry. */
export const noRepositoryInScope = (error: unknown): boolean =>
    error instanceof TransportRefusal && error.error.error.code === "no_repository";

/**
 * ACR's 503 for an organization above its access limit, on every protected route. It is the only
 * `upstream_unavailable` 503 that ACR marks `retryable: false` (acr `docs/authentication.md`), so
 * that field alone tells it from an outage. No retry can clear it (CHAOS-12469).
 */
const aboveAccessLimit = (error: unknown): boolean =>
    error instanceof TransportRefusal &&
    error.status === 503 &&
    error.error.error.code === "upstream_unavailable" &&
    !error.error.error.retryable;

/**
 * True once ACR holds the current thread: it admitted a turn (`accepted`), or the turns came from
 * it. Only a thread ACR does not hold can be "not saved" (CHAOS-12503).
 */
export const threadAdmitted = (snapshot: ConversationSnapshot): boolean =>
    snapshot.turns.some(
        (turn) =>
            turn.threadId === snapshot.threadId &&
            (turn.origin === "restored" || turn.reservedResultId !== undefined),
    );

/** ACR says that reading again cannot help, so nothing offers a retry. */
export const readCannotHelp = (error: unknown): boolean =>
    noRepositoryInScope(error) || aboveAccessLimit(error);

const notRunReasonOf = (code: string): NotRunReason | undefined =>
    Object.hasOwn(NOT_RUN_REASON_OF, code) ? NOT_RUN_REASON_OF[code] : undefined;

/**
 * The one map of terminal error codes in the stream that keep their own meaning (CHAOS-12201).
 * `budget_refusal` (a refusal turn), `thread_closed` (a new conversation) and a 504 deadline need
 * the event or the thread and are decided apart; any other code is the generic failure.
 */
const TERMINAL_OUTCOMES: Readonly<Record<string, TurnOutcome>> = {
    // The owner canceled the run (ACR run lease): the canceled state, not a failure.
    canceled: { kind: "canceled" },
    // The run's service instance stopped: the run ended without an answer.
    run_lost: { kind: "interrupted" },
    // The answer was served but not stored: the unsaved state.
    submission_unsaved: { kind: "unsaved" },
    // A model or graph limit after admission: wait, then ask again (no same-key retry).
    rate_limited: { kind: "stopped", reason: "rate_limited" },
    interpretation_rejected: { kind: "stopped", reason: "interpretation_rejected" },
    synthesis_rejected: { kind: "stopped", reason: "synthesis_rejected" },
};

const terminalOutcomeOf = (code: string): TurnOutcome | undefined =>
    Object.hasOwn(TERMINAL_OUTCOMES, code) ? TERMINAL_OUTCOMES[code] : undefined;

type TurnBase = {
    readonly id: number;
    /** The conversation this turn belongs to (it replaces a numeric thread boundary). */
    readonly threadId: string;
    readonly createdAt: string;
    /** `X-ACR-Submission-ID` of this turn: its stable key, across pages and reloads. */
    readonly submissionId: string;
    /** The result id ACR reserved at admission (`accepted`), once seen. */
    readonly reservedResultId?: string | undefined;
    readonly outcome: TurnOutcome;
    /**
     * Stop and its answer (CHAOS-11957): `requested` while ACR has not answered, `not_leased` when
     * ACR said the run cannot be stopped (it ends on its own). Absent otherwise.
     */
    readonly stop?: "requested" | "not_leased" | undefined;
};

/** A turn this tab sent: a retry sends `request` again under the same `submission_id`. */
export type SubmittedTurn = TurnBase & {
    readonly origin: "submitted";
    readonly question: string;
    /** The exact request this turn sent. */
    readonly request: InvestigationRequest;
};

/**
 * A turn read back from ACR's thread (CHAOS-11956). It has no request, so it is never sent again:
 * its only action is "Load again", a GET. `question` is `null` on a turn ACR admitted before it
 * recorded questions: shown as "Question not recorded", never sent.
 */
export type RestoredTurn = TurnBase & {
    readonly origin: "restored";
    readonly question: string | null;
    readonly request: null;
};

export type StoreTurn = SubmittedTurn | RestoredTurn;

/**
 * The conversation's thread, as the store holds it (E6 design v5 §4).
 *
 * - `new`: no thread on ACR yet (a fresh conversation); the first submit mints its id.
 * - `restoring`: the thread is being read, or its answers replayed: submit waits.
 * - `loaded`: the thread is the store's. `earlier` says whether earlier turns can be read.
 * - `unavailable`: a malformed id, or ACR's 404 (the same for every cause): read-only.
 * - `read_failed`: the read failed (a 5xx, the network, a body that broke the contract, or no ACR
 *   token, CHAOS-12474): read-only, with "Try again". That click is a user act, so with no token it
 *   runs the silent step.
 */
export type ThreadAccess =
    | { readonly kind: "new" }
    | { readonly kind: "restoring" }
    | {
          readonly kind: "loaded";
          readonly earlier: "none" | "available" | "loading" | "failed";
      }
    | { readonly kind: "unavailable" }
    | { readonly kind: "read_failed" };

/** Who selected the current conversation: only a `local` selection writes the `/dev` URL. */
export type SelectionSource = "initial" | "incoming" | "local";

/** The history list of the bound partition (E6 design v5 §4.3), shared by both surfaces. */
export type HistorySnapshot = {
    /**
     * `no_repository`: ACR's 409, no repository in scope (CHAOS-12439); there are no rows.
     * `unavailable`: ACR says no retry can clear the read (`aboveAccessLimit`); no rows either.
     * `read_failed`: the list was not read, which says nothing of whether conversations exist. No
     * ACR token lands here, never in `ready` (CHAOS-12474): an empty `ready` reads "No conversations
     * yet", and with no token nothing is known.
     */
    readonly status: "idle" | "loading" | "ready" | "read_failed" | "no_repository" | "unavailable";
    readonly threads: readonly ThreadSummaryView[];
    readonly nextCursor: string | null;
    readonly loadingMore: boolean;
    readonly moreFailed: boolean;
    /** Threads whose delete is in flight. */
    readonly deleting: readonly string[];
    /** The thread whose last delete failed, if any. */
    readonly deleteFailed: string | null;
};

const EMPTY_HISTORY: HistorySnapshot = {
    status: "idle",
    threads: [],
    nextCursor: null,
    loadingMore: false,
    moreFailed: false,
    deleting: [],
    deleteFailed: null,
};

export type ConversationSnapshot = {
    /** Bumped by every partition clear; a run of an older generation can change nothing. */
    readonly generation: number;
    /**
     * Bumped by every selection change and every clear: transcript work of an older selection
     * changes nothing (E6 design v5 §3.1).
     */
    readonly selection: number;
    readonly selectionSource: SelectionSource;
    /** This conversation's `thread_id`; `null` until the first submit, or when none is usable. */
    readonly threadId: string | null;
    readonly thread: ThreadAccess;
    readonly turns: readonly StoreTurn[];
    /** A run of this thread is running, recovering or observed: a submit is refused. */
    readonly inFlight: boolean;
    /** A submitted run is in flight that Stop can end (an observed run has no Stop yet). */
    readonly stoppable: boolean;
    /**
     * An answer of this conversation is being read (a restore, "Load again", an earlier page or
     * an observed run's final answer): a submit waits, so a follow-up never goes out without the
     * answer it threads on (codex r3 on #1648).
     */
    readonly replaying: boolean;
    readonly history: HistorySnapshot;
    /** False while signed out or before the session is known: a submit is refused. */
    readonly ready: boolean;
    /**
     * The (org, principal) key these turns belong to; `null` before the first bind or while signed
     * out (CHAOS-11934: the reload marker names the conversation's own partition, not the session's).
     */
    readonly partition: string | null;
};

/** What a follow-up carries beyond the question (a clarification choice, CHAOS-3440). */
export type TurnCarry = {
    readonly parentResultId?: string | undefined;
    /** CHAOS-12383: the `subject_resolution.candidates` a re-ask picked. */
    readonly priorSubjectReceipts?: InvestigationRequestInput["priorSubjectReceipts"];
    readonly structureReceipts?: StructureReceipts | undefined;
    /**
     * CHAOS-3584: the page context the user left in place, as subject hints. They go first, before
     * the subjects carried from the previous answer; a hint never binds a subject.
     */
    readonly pageHints?: readonly SubjectHint[] | undefined;
    /**
     * CHAOS-12383: builds the request as of this turn: `conversation`, the parent reference and the
     * carried hints read the turns up to and including it, and no later one. A batch runs in
     * sequence, and each item must send what a parallel fan-out would.
     */
    readonly asOfTurnId?: number | undefined;
};

/** The turns a request is built from, in the served order. */
function turnsAsOf(turns: readonly StoreTurn[], asOfTurnId: number | undefined) {
    if (asOfTurnId === undefined) return turns;
    return turns.slice(0, turns.findIndex((turn) => turn.id === asOfTurnId) + 1);
}

/** Page hints first, then the carried ones, each (kind, id) once. */
function mergeSubjectHints(
    first: readonly SubjectHint[],
    then: readonly SubjectHint[],
): SubjectHint[] {
    const seen = new Set<string>();
    return [...first, ...then].filter((hint) => {
        const key = JSON.stringify([
            hint.kind,
            hint.id ?? null,
            hint.id === undefined ? hint.label : null,
        ]);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/** Where the store keeps its restore hint (session storage in the product). */
export type HintStorage = {
    readonly read: () => string | null;
    readonly write: (value: string) => void;
    readonly clear: () => void;
};

const sessionHintStorage: HintStorage = {
    read: () => {
        try {
            return window.sessionStorage.getItem(THREAD_HINT_KEY);
        } catch {
            return null;
        }
    },
    write: (value) => {
        try {
            window.sessionStorage.setItem(THREAD_HINT_KEY, value);
        } catch {
            // No storage (a private window, blocked site data): a reload then restores nothing.
        }
    },
    clear: () => {
        try {
            window.sessionStorage.removeItem(THREAD_HINT_KEY);
        } catch {
            // As above.
        }
    },
};

export type ConversationStoreOptions = {
    readonly transport: AskDevTransport;
    /** The restore hint's storage; session storage by default. */
    readonly hints?: HintStorage;
    /** `W` of the run's absolute deadline `D = submit + W` (plan §2.7.6). */
    readonly runTimeoutMs?: number;
    readonly now?: () => number;
    /** Waits `ms`, or rejects when `signal` aborts. Injected so a test can drive the polling. */
    readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
    readonly uuid?: () => string;
    /**
     * Called once each time the bound key changes, after the clear; never on the first bind or
     * the same key again. The context clears the browser's ACR tokens here (CHAOS-12306).
     */
    readonly onPartitionChanged?: () => void;
};

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            reject(signal.reason);
            return;
        }
        const timer = setTimeout(() => {
            signal.removeEventListener("abort", onAbort);
            resolve();
        }, ms);
        function onAbort() {
            clearTimeout(timer);
            reject(signal.reason);
        }
        signal.addEventListener("abort", onAbort, { once: true });
    });
}

export const IN_FLIGHT = new Set<TurnOutcome["kind"]>([
    "running",
    "recovering",
    "observing",
    "canceling",
]);

/** The states Stop can end (the run is this tab's, submitted or observed). */
const STOPPABLE = new Set<TurnOutcome["kind"]>(["running", "recovering", "observing"]);

/** One event's own content, to tell a duplicate from a changed event at the same `seq`. */
const fingerprint = (event: InvestigationEvent): string => JSON.stringify(event);

/** A child controller: it aborts with `parent`, and alone. */
function childController(parent: AbortSignal): AbortController {
    const child = new AbortController();
    if (parent.aborted) child.abort(parent.reason);
    else parent.addEventListener("abort", () => child.abort(parent.reason), { once: true });
    return child;
}

/** A correlation code the panel may show: a plain id, never free text. */
const REFERENCE_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/u;

/**
 * ACR's `details.deadline` of a `504 upstream_unavailable`; a value outside the enum is absent.
 * error.v1 defines it on a 504 only: another status that carries it is not a deadline.
 */
function deadlineOf(error: ACRErrorV1): DeadlineKind | undefined {
    if (error.error.code !== "upstream_unavailable" || error.error.http_status !== 504) {
        return undefined;
    }
    const deadline: unknown = error.error.details?.deadline;
    return deadline === "model" || deadline === "request" ? deadline : undefined;
}

/** The shared limit a 429 names; a `details.limit` outside the enum is absent. */
function limitOf(error: ACRErrorV1): LimitKind {
    if (error.error.code === "allowance_exhausted") return "allowance";
    const limit: unknown = error.error.details?.limit;
    return limit === "principal" || limit === "org" ? limit : "concurrency";
}

/**
 * One `stage` event applied to a running turn. A stage keeps its furthest state (a late `started`
 * after `completed` changes nothing); `stage` follows the last stage ACR started.
 */
function advanceStage(
    turn: StoreTurn,
    event: Extract<InvestigationEvent, { type: "stage" }>,
): StoreTurn {
    const { outcome } = turn;
    if (outcome.kind !== "running") return turn;
    if (outcome.stages[event.stage] === "completed") return turn;
    return {
        ...turn,
        outcome: {
            ...outcome,
            stage: event.state === "started" ? event.stage : outcome.stage,
            stages: { ...outcome.stages, [event.stage]: event.state },
        },
    };
}

/**
 * The builders' timeline shape: a user turn, then its assistant turn (ids 2n and 2n + 1). A turn
 * whose question was not recorded stands as an empty question here: the parent reference reads
 * only the immediate predecessor, whatever its question; `conversationOf` leaves it out.
 */
function toSourceTurns(turns: readonly StoreTurn[]): ConversationSourceTurn[] {
    return turns.flatMap((turn): ConversationSourceTurn[] => [
        {
            role: "user",
            id: turn.id * 2,
            question: turn.question ?? "",
            createdAt: turn.createdAt,
        },
        {
            role: "assistant",
            id: turn.id * 2 + 1,
            createdAt: turn.createdAt,
            outcome:
                turn.outcome.kind === "answered"
                    ? { kind: "answered", result: turn.outcome.result }
                    : IN_FLIGHT.has(turn.outcome.kind)
                      ? { kind: "pending" }
                      : { kind: "failed" },
        },
    ]);
}

/**
 * The `conversation` a follow-up carries: the prior turns without those whose question was not
 * recorded (both their user and their assistant entries), so no placeholder is ever sent.
 */
function conversationOf(turns: readonly StoreTurn[]) {
    return buildConversationTurns(toSourceTurns(turns.filter((turn) => turn.question !== null)));
}

/** The hint's stored shape: a thread id, the partition's tag, and ACR's `expires_at`. */
type ThreadHint = {
    readonly thread_id: string;
    readonly partition: string;
    readonly expires_at: string | null;
};

function parseHint(raw: string | null): ThreadHint | null {
    if (raw === null) return null;
    try {
        const value: unknown = JSON.parse(raw);
        if (typeof value !== "object" || value === null) return null;
        const hint = value as Record<string, unknown>;
        if (typeof hint.thread_id !== "string" || typeof hint.partition !== "string") return null;
        if (hint.expires_at !== null && typeof hint.expires_at !== "string") return null;
        return {
            thread_id: hint.thread_id,
            partition: hint.partition,
            expires_at: hint.expires_at,
        };
    } catch {
        return null;
    }
}

/** A content-free status for a log line: an HTTP status, a transport reason, or `network`. */
function failureStatus(error: unknown): number | string {
    if (error instanceof TransportRefusal) return error.status;
    if (error instanceof TransportFailure) return error.reason;
    return "network";
}

/** The page's turns in the served order, each `submission_id` once, none of `known`. */
function uniqueTurns(
    turns: readonly ThreadTurnView[],
    known: ReadonlySet<string>,
): ThreadTurnView[] {
    const seen = new Set(known);
    return turns.filter((turn) => {
        if (seen.has(turn.submissionId)) return false;
        seen.add(turn.submissionId);
        return true;
    });
}

/** The outcome a restored turn starts with, from the state ACR served. */
function restoredOutcome(turn: ThreadTurnView): TurnOutcome {
    switch (turn.state) {
        case "running":
            return { kind: "observing", startedAt: epochOf(turn.admittedAt) };
        case "done":
            return turn.resultId === null ? { kind: "unavailable" } : { kind: "restoring" };
        case "done_unsaved":
            return { kind: "unsaved" };
        case "abandoned":
            return { kind: "abandoned" };
    }
}

const epochOf = (iso: string): number => {
    const value = Date.parse(iso);
    return Number.isNaN(value) ? Date.now() : value;
};

/**
 * One run the store follows (E6 design v5 §5.2): the submitted run of this tab (`active`), or a
 * restored turn still running (`observed`). It is also the resume state an attach serves.
 */
type ActiveRun = {
    readonly turnId: number;
    readonly submissionId: string;
    readonly origin: "submitted" | "restored";
    readonly controller: AbortController;
    /** When the run began (epoch ms): the panel's elapsed time counts from it. */
    readonly startedAt: number;
    /** The run's absolute deadline D (epoch ms). */
    deadline: number;
    /** Fires at the run's deadline D (plan §2.7.6 "abort at D"), whatever the run is waiting on. */
    timer: ReturnType<typeof setTimeout> | undefined;
    /**
     * The conversation it belongs to is no longer shown (another selection, a new conversation, a
     * delete): the stream stays open to its terminal so ACR's run is not ended by a disconnect
     * (a run without a lease ends on one), and nothing it delivers commits. `detachTimer` closes
     * it at D.
     */
    detached: boolean;
    detachTimer: ReturnType<typeof setTimeout> | undefined;
    /** Where D comes from (E6 design v5 §5.3): submit time + W, `accepted`, or the 10-minute cap. */
    deadlineSource: "memory" | "accepted" | "observation_cap";
    /** The run's `request_id`, from `accepted` or the first event seen. */
    requestId: string | null;
    /** The next `seq` the run must deliver. */
    nextSeq: number;
    /** The last `elapsed_ms` applied (0 at `accepted`). */
    lastElapsedMs: number | null;
    /** Each applied event by `seq`, to tell a duplicate from a changed event. */
    readonly applied: Map<number, string>;
    /** Bumped on every attach: an event of an older attachment changes nothing. */
    attachmentGeneration: number;
    /** Stop's progress (§5.4). */
    stop: "idle" | "requested" | "canceling" | "not_leased" | "final";
    /** When a status read last confirmed the run `running` (epoch ms). */
    lastSeenRunningAt: number | undefined;
    /**
     * This tab's own investigate stream is still open: only then can a disconnect stop a run that
     * has no lease (codex r3 on #1657). An attach never owns a run.
     */
    streaming: boolean;
};

export class ConversationStore {
    private readonly transport: AskDevTransport;
    private readonly runTimeoutMs: number;
    private readonly now: () => number;
    private readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;
    private readonly uuid: () => string;
    private readonly hints: HintStorage;
    private readonly onPartitionChanged: (() => void) | undefined;
    private readonly listeners = new Set<() => void>();
    private partition: string | null | undefined = undefined;
    private active: ActiveRun | null = null;
    private nextTurnId = 0;
    /** Restored running turns the store observes, by `submission_id`. */
    private readonly observed = new Map<string, ActiveRun>();
    /** Aborts every transcript read of the current selection (thread, replays, earlier pages). */
    private selectionAbort = new AbortController();
    /** The `submission_id`s whose answer is queued or being read in this selection. */
    private readonly replaying = new Set<string>();
    /** Answer reads waiting for a slot (at most `REPLAY_CONCURRENCY` run at a time). */
    private replayQueue: (() => Promise<void>)[] = [];
    private replaysRunning = 0;
    /** The current restore: when it began and what it found (for its Info event). */
    private restore: {
        readonly selection: number;
        readonly startedAt: number;
        pending: number;
        replays: number;
        unavailable: number;
        failed: number;
    } | null = null;
    /** Bumped when the history list is read again from its first page. */
    private historyRevision = 0;
    private historyAbort = new AbortController();
    /** Threads this partition deleted: a late list page cannot bring one back. */
    private readonly deleted = new Set<string>();
    /** No thread was selected yet in this load: only that first selection can be the lost one. */
    private firstSelection = true;
    /** The thread being read is the conversation this tab lost to the reload (CHAOS-12503). */
    private readingLostThread = false;
    /** Aborts deletes; only a partition clear does (a list read again must not abort a delete). */
    private deleteAbort = new AbortController();
    /** The current thread's `earlier_turns_cursor`, opaque. */
    private earlierCursor: string | null = null;
    /** The final `result_id` of each restored `done` turn, for "Load again". */
    private readonly restoredResultIds = new Map<string, string>();
    private snapshot: ConversationSnapshot = {
        generation: 0,
        selection: 0,
        selectionSource: "initial",
        threadId: null,
        thread: { kind: "new" },
        turns: [],
        inFlight: false,
        stoppable: false,
        replaying: false,
        history: EMPTY_HISTORY,
        ready: false,
        partition: null,
    };

    constructor(options: ConversationStoreOptions) {
        this.transport = options.transport;
        this.runTimeoutMs = options.runTimeoutMs ?? RUN_TIMEOUT_DEFAULT_MS;
        this.now = options.now ?? Date.now;
        this.sleep = options.sleep ?? abortableSleep;
        this.uuid = options.uuid ?? (() => crypto.randomUUID());
        this.hints = options.hints ?? sessionHintStorage;
        this.onPartitionChanged = options.onPartitionChanged;
    }

    readonly subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    readonly getSnapshot = (): ConversationSnapshot => this.snapshot;

    /**
     * Binds the store to one (org, principal) key, or to none (`null`: signed out). Another key
     * than the bound one clears the conversation, the history and the restore hint; the first
     * bind clears nothing.
     */
    setPartition(key: string | null): void {
        const changed = this.partition !== undefined && key !== this.partition;
        if (changed) {
            this.clear("partition_changed");
            this.hints.clear();
        }
        this.partition = key;
        this.commit({ ...this.snapshot, ready: key !== null, partition: key });
        // After the clear: the run of the old key is already aborted (CHAOS-12306).
        if (changed) this.onPartitionChanged?.();
    }

    /**
     * Aborts every run and read, drops every turn, the thread and the history, and bumps the
     * generation. A late answer of anything it aborted changes nothing.
     */
    clear(reason: "partition_changed" | "unmounted"): void {
        const aborted = this.active;
        const observed = this.observed.size;
        this.dropSelectionWork("abort");
        this.historyAbort.abort();
        this.historyAbort = new AbortController();
        this.deleteAbort.abort();
        this.deleteAbort = new AbortController();
        this.historyRevision += 1;
        this.deleted.clear();
        const generation = this.snapshot.generation + 1;
        logger.info(
            { generation, reason, run_aborted: aborted !== null, observed_aborted: observed },
            "ask-dev conversation cleared",
        );
        this.commit({
            ...this.snapshot,
            generation,
            selection: this.snapshot.selection + 1,
            selectionSource: "initial",
            threadId: null,
            thread: { kind: "new" },
            turns: [],
            inFlight: false,
            history: EMPTY_HISTORY,
        });
    }

    /**
     * Sends a new question as a new turn with a new `submission_id`. Refused (`false`, nothing
     * sent) when it is blank, while signed out, while a run of this thread is in flight, or while
     * the conversation is restoring or read-only.
     */
    submit(question: string, carry?: TurnCarry): boolean {
        const trimmed = question.trim();
        const { thread } = this.snapshot;
        if (
            nonBlank(trimmed) === undefined ||
            !this.snapshot.ready ||
            this.snapshot.inFlight ||
            this.replaying.size > 0 ||
            (thread.kind !== "new" && thread.kind !== "loaded")
        ) {
            return false;
        }
        const minted = this.snapshot.threadId === null;
        const threadId = this.snapshot.threadId ?? newThreadId(this.uuid());
        // Only this thread's turns: a closed conversation's turns carry nothing forward.
        const prior = turnsAsOf(
            this.snapshot.turns.filter((turn) => turn.threadId === threadId),
            carry?.asOfTurnId,
        );
        const parent = deriveParentReference(toSourceTurns(prior));
        const request = buildInvestigationRequest({
            question: trimmed,
            requestId: newRequestId(this.uuid()),
            conversation: conversationOf(prior),
            parentResultId: carry?.parentResultId ?? parent.parentResultId,
            subjectHints: mergeSubjectHints(carry?.pageHints ?? [], parent.subjectHints),
            priorSubjectReceipts: carry?.priorSubjectReceipts,
            structureReceipts: carry?.structureReceipts,
        });
        const turn: SubmittedTurn = {
            id: this.nextTurnId++,
            threadId,
            origin: "submitted",
            question: trimmed,
            createdAt: new Date(this.now()).toISOString(),
            submissionId: newSubmissionId(this.uuid()),
            request,
            outcome: this.running(),
        };
        this.commit({
            ...this.snapshot,
            threadId,
            thread: minted ? { kind: "loaded", earlier: "none" } : thread,
            // The first submit of a new conversation is a local selection: `/dev` names it.
            selectionSource: minted ? "local" : this.snapshot.selectionSource,
            turns: [...this.snapshot.turns, turn],
            inFlight: true,
        });
        void this.run(turn.id);
        return true;
    }

    /**
     * Sends the last turn's request again under its own `submission_id` (INV-2: the only reuse of a
     * key). Only for a submitted `failed`, `limited`, `not_run` or `authorization_failed` turn that
     * allows it (nothing was admitted, or the answer is stored), and only when no run is in flight.
     * A restored turn has no request: it is never sent again (`reloadTurn` reads it again instead).
     */
    retry(turnId: number): boolean {
        const last = this.snapshot.turns[this.snapshot.turns.length - 1];
        if (last?.id !== turnId || this.snapshot.inFlight || !this.snapshot.ready) return false;
        if (last.origin !== "submitted" || last.threadId !== this.snapshot.threadId) return false;
        const { outcome } = last;
        if (
            (outcome.kind !== "failed" &&
                outcome.kind !== "limited" &&
                outcome.kind !== "not_run" &&
                outcome.kind !== "authorization_failed") ||
            !outcome.retry
        ) {
            return false;
        }
        this.setOutcome(turnId, this.running(), true);
        void this.run(turnId);
        return true;
    }

    /**
     * Stop (CHAOS-11957, E6 design v5 §5.4): asks ACR to cancel the run of the last turn, submitted
     * here or observed after a reload, through the cancel endpoint. The stream stays open: it is the
     * completion channel, and a result that finished first is kept. Before ACR admitted the run
     * (no `accepted`), and for a run ACR cannot stop (no lease) whose connection this tab holds,
     * the disconnect is the cancel.
     */
    cancel(): void {
        const run = this.stoppableRun();
        if (run === null) return;
        if (run.origin === "submitted" && run.requestId === null) {
            this.disconnect(run, "not_admitted");
            return;
        }
        run.stop = "requested";
        this.update(run.turnId, (turn) => ({ ...turn, stop: "requested" }), true);
        logger.info(
            {
                submission_id: run.submissionId,
                // The browser's own time; ACR records its own t_req.
                browser_requested_at: new Date(this.now()).toISOString(),
            },
            "ask-dev cancel requested",
        );
        void this.requestCancel(run);
    }

    /**
     * Starts a new, empty conversation (a local selection): the old one stays on ACR and in the
     * history. Its run, if any, is dropped from this tab; ACR keeps a leased run going.
     */
    newConversation(): void {
        this.resetSelection("new_conversation");
        this.hints.clear();
        this.commit({ ...this.snapshot, selectionSource: "local" });
    }

    /**
     * Selects a conversation by its `thread_id` and reads it back from ACR (E6 design v5 §4.1,
     * §4.2): zero investigation calls. Selecting the thread already shown is a no-op. A malformed
     * id, or ACR's 404, gives the neutral read-only `unavailable` state.
     *
     * `userAct` (CHAOS-12474): the user opened this conversation, by a row of the list (`local`) or
     * by the `/dev` URL, so the read may run the silent step. A restore from the hint is not one.
     */
    selectThread(
        threadId: string,
        source: "incoming" | "local",
        lostThread: string | null = null,
        userAct: boolean = source === "local",
    ): boolean {
        if (!this.snapshot.ready) return false;
        const { thread } = this.snapshot;
        if (
            threadId === this.snapshot.threadId &&
            (thread.kind === "loaded" || thread.kind === "restoring")
        ) {
            return false;
        }
        this.resetSelection("selection_changed");
        this.readingLostThread = this.firstSelection && threadId === lostThread;
        this.firstSelection = false;
        if (!isCorrelationId(threadId)) {
            this.hints.clear();
            logger.info(
                { stage: "read", status: "malformed", selection: this.snapshot.selection },
                "ask-dev thread restore failed",
            );
            this.commit({
                ...this.snapshot,
                selectionSource: source,
                thread: { kind: "unavailable" },
            });
            return true;
        }
        this.commit({
            ...this.snapshot,
            selectionSource: source,
            threadId,
            thread: { kind: "restoring" },
        });
        void this.readThread(threadId, userAct);
        return true;
    }

    /** "Try again" on a conversation whose read failed: the same GET, under a new selection. */
    retryThreadRead(): boolean {
        const { thread, threadId } = this.snapshot;
        if (thread.kind !== "read_failed" || threadId === null || !this.snapshot.ready) {
            return false;
        }
        this.reread(threadId, true);
        return true;
    }

    /**
     * Restores this tab's last conversation from its hint (E6 design v5 §4.4), when the store has
     * none: a reload, or the panel opened again. The hint is never authorization: ACR reads the
     * thread again for the caller, and a 404 clears it.
     */
    restoreFromHint(): boolean {
        if (!this.snapshot.ready || typeof this.partition !== "string") return false;
        if (this.snapshot.threadId !== null || this.snapshot.turns.length > 0) return false;
        if (this.snapshot.thread.kind !== "new") return false;
        const hint = parseHint(this.hints.read());
        if (hint === null) return false;
        const expired = hint.expires_at !== null && !(Date.parse(hint.expires_at) > this.now());
        if (hint.partition !== partitionTag(this.partition) || expired) {
            this.hints.clear();
            return false;
        }
        return this.selectThread(hint.thread_id, "incoming");
    }

    /** One evidence reference, as the result that cited it cites it (CHAOS-12105). */
    readEvidence(call: {
        readonly refId: string;
        readonly resultId: string;
        readonly signal: AbortSignal;
    }): Promise<EvidenceView | null> {
        return this.transport.readEvidence(call);
    }

    /** "Show earlier turns": the page before the oldest shown, prepended (E6 design v5 §4.2.6). */
    loadEarlierTurns(): boolean {
        const { thread, threadId } = this.snapshot;
        if (thread.kind !== "loaded") return false;
        if (thread.earlier !== "available" && thread.earlier !== "failed") return false;
        if (this.earlierCursor === null || threadId === null) return false;
        this.commit({ ...this.snapshot, thread: { kind: "loaded", earlier: "loading" } });
        void this.readEarlier(threadId, this.earlierCursor);
        return true;
    }

    /** "Load again" on a restored turn whose answer read failed: a GET, never an investigation. */
    reloadTurn(turnId: number): boolean {
        const turn = this.turn(turnId);
        if (turn === undefined || turn.origin !== "restored") return false;
        if (turn.outcome.kind !== "restore_failed") return false;
        const resultId = this.restoredResultIds.get(turn.submissionId);
        if (resultId === undefined) return false;
        this.updateRestored(turn.submissionId, { kind: "restoring" });
        this.queueReplay(turn.submissionId, resultId, this.snapshot.selection, false);
        return true;
    }

    /** Reads the history list again from its first page (E6 design v5 §4.3). */
    loadHistory(): boolean {
        if (!this.snapshot.ready) return false;
        this.historyAbort.abort();
        this.historyAbort = new AbortController();
        const revision = ++this.historyRevision;
        const generation = this.snapshot.generation;
        this.commitHistory({ status: "loading", loadingMore: false, moreFailed: false });
        void this.readHistoryPage(undefined, revision, generation);
        return true;
    }

    /** "Show more": the next page of the history list. */
    loadMoreHistory(): boolean {
        const { history } = this.snapshot;
        if (!this.snapshot.ready || history.nextCursor === null || history.loadingMore) {
            return false;
        }
        this.commitHistory({ loadingMore: true, moreFailed: false });
        void this.readHistoryPage(
            history.nextCursor,
            this.historyRevision,
            this.snapshot.generation,
        );
        return true;
    }

    /**
     * Deletes a conversation on ACR (E6 design v5 §4.3). A delete closes the thread; it does not
     * stop a running turn. ACR answers 204 for any well-formed id, so a success says nothing about
     * whose thread it was. The tombstone is the partition's: it lands after a thread switch too.
     */
    deleteThread(threadId: string): boolean {
        const { history } = this.snapshot;
        if (!this.snapshot.ready || history.deleting.includes(threadId)) return false;
        const generation = this.snapshot.generation;
        this.commitHistory({
            deleting: [...history.deleting, threadId],
            deleteFailed: history.deleteFailed === threadId ? null : history.deleteFailed,
        });
        void this.removeThread(threadId, generation);
        return true;
    }

    /** The store follows a run for this turn (submitted, or observed after a reload). */
    private followsTurn(turnId: number): boolean {
        if (this.active?.turnId === turnId) return true;
        for (const run of this.observed.values()) if (run.turnId === turnId) return true;
        return false;
    }

    /** The run Stop acts on: the last turn of the conversation shown, while it runs. */
    private stoppableRun(): ActiveRun | null {
        const { threadId, turns } = this.snapshot;
        const last = [...turns].reverse().find((turn) => turn.threadId === threadId);
        if (last === undefined || last.stop !== undefined || !STOPPABLE.has(last.outcome.kind)) {
            return null;
        }
        if (this.active?.turnId === last.id && !this.active.detached) {
            return this.active.stop === "idle" ? this.active : null;
        }
        for (const run of this.observed.values()) {
            if (run.turnId === last.id) return run.stop === "idle" ? run : null;
        }
        return null;
    }

    /**
     * The disconnect cancel: this tab holds the run's connection, and ACR cannot stop the run any
     * other way (not admitted yet, or no lease).
     */
    private disconnect(run: ActiveRun, reason: "not_admitted" | "not_leased"): void {
        this.release(run);
        logger.info(
            {
                submission_id: run.submissionId,
                reason,
                browser_requested_at: new Date(this.now()).toISOString(),
            },
            "ask-dev run canceled",
        );
        run.controller.abort();
        this.update(
            run.turnId,
            (turn) => ({ ...turn, stop: undefined, outcome: { kind: "canceled" } }),
            false,
        );
    }

    private async requestCancel(run: ActiveRun): Promise<void> {
        let answer: CancelAnswer;
        try {
            answer = await this.transport.cancel({
                submissionId: run.submissionId,
                signal: run.controller.signal,
            });
        } catch (error) {
            if (!this.owns(run)) return;
            if (error instanceof TransportRefusal && error.status === 404) {
                // ACR holds no lease on this run (its run lease may be off), so nothing here can
                // stop it (CHAOS-12483). As for `not_leased`: a stream disconnects, which is the
                // cancel, and "Canceling…" never shows for a run that nothing is canceling.
                answer = { kind: "not_leased" };
            } else {
                logger.warn(
                    { submission_id: run.submissionId, status: failureStatus(error) },
                    "ask-dev cancel not sent",
                );
                run.stop = "idle";
                this.update(run.turnId, (turn) => ({ ...turn, stop: undefined }), true);
                return;
            }
        }
        if (!this.owns(run)) return;
        logger.info(
            { submission_id: run.submissionId, answer: answer.kind },
            "ask-dev cancel answered",
        );
        switch (answer.kind) {
            case "running": {
                // 202: the stream stays the completion channel; its terminal ends the turn.
                run.stop = "canceling";
                const turn = this.turn(run.turnId);
                const startedAt =
                    turn !== undefined && "startedAt" in turn.outcome
                        ? turn.outcome.startedAt
                        : run.startedAt;
                this.update(
                    run.turnId,
                    (current) => ({
                        ...current,
                        stop: undefined,
                        outcome: { kind: "canceling", startedAt },
                    }),
                    true,
                );
                return;
            }
            case "final": {
                // 204: the run is not running any more; its status says how it ended.
                run.stop = "final";
                const turn = this.turn(run.turnId);
                const startedAt =
                    turn !== undefined && "startedAt" in turn.outcome
                        ? turn.outcome.startedAt
                        : run.startedAt;
                this.update(
                    run.turnId,
                    (current) => ({
                        ...current,
                        stop: undefined,
                        outcome: { kind: "canceling", startedAt },
                    }),
                    true,
                );
                if (run.origin === "submitted") await this.recover(run, run.deadline, true);
                else await this.observeStatus(run);
                return;
            }
            case "not_leased":
                if (
                    run.origin === "submitted" &&
                    this.active === run &&
                    !run.detached &&
                    run.streaming
                ) {
                    this.disconnect(run, "not_leased");
                    return;
                }
                run.stop = "not_leased";
                this.update(run.turnId, (turn) => ({ ...turn, stop: "not_leased" }), true);
                return;
        }
    }

    /** A run that just began: no stage yet, and the elapsed time counts from now. */
    private running(): TurnOutcome {
        return { kind: "running", startedAt: this.now(), stages: {} };
    }

    private commit(next: ConversationSnapshot): void {
        this.snapshot = {
            ...next,
            // An observed run blocks a submit as a submitted one does (E6 design v5 §3.3).
            inFlight: next.inFlight || this.observed.size > 0,
            replaying: this.replaying.size > 0,
            stoppable: next.turns.some(
                (turn) =>
                    turn.stop === undefined &&
                    STOPPABLE.has(turn.outcome.kind) &&
                    (turn.origin === "submitted" || this.followsTurn(turn.id)),
            ),
        };
        for (const listener of this.listeners) listener();
    }

    private commitHistory(patch: Partial<HistorySnapshot>): void {
        this.commit({ ...this.snapshot, history: { ...this.snapshot.history, ...patch } });
    }

    /**
     * Ends every piece of work of the current selection: the submitted run, the observed runs,
     * the thread and answer reads. A late answer of any of them fails its ownership check.
     */
    private dropSelectionWork(run: "abort" | "detach"): void {
        const active = this.active;
        if (active !== null) {
            this.release(active);
            if (run === "abort") active.controller.abort();
            else this.detach(active);
        }
        for (const run of this.observed.values()) {
            clearTimeout(run.timer);
            run.controller.abort();
        }
        this.observed.clear();
        this.selectionAbort.abort();
        this.selectionAbort = new AbortController();
        this.replayQueue = [];
        this.replaysRunning = 0;
        this.replaying.clear();
        this.restore = null;
        this.earlierCursor = null;
        this.restoredResultIds.clear();
    }

    /**
     * Clears the conversation for another selection and keeps the partition's history and its
     * tombstones (E6 design v5 §3.1).
     */
    private resetSelection(
        reason: "selection_changed" | "new_conversation" | "thread_deleted",
    ): void {
        const detached = this.active;
        const observed = this.observed.size;
        // Delete is not Stop, and a switch does not stop the run either (E6 design v5 §4.2, Q2).
        this.dropSelectionWork("detach");
        const selection = this.snapshot.selection + 1;
        logger.info(
            { selection, reason, run_detached: detached !== null, observed_aborted: observed },
            "ask-dev conversation cleared",
        );
        this.commit({
            ...this.snapshot,
            selection,
            threadId: null,
            thread: { kind: "new" },
            turns: [],
            inFlight: false,
        });
    }

    /** The same thread read again from its latest page, under a new selection. */
    private reread(threadId: string, userAct = false): void {
        const source = this.snapshot.selectionSource;
        this.resetSelection("selection_changed");
        this.commit({
            ...this.snapshot,
            selectionSource: source,
            threadId,
            thread: { kind: "restoring" },
        });
        void this.readThread(threadId, userAct);
    }

    /** True when transcript work of `selection` may still commit; else logs the dropped answer. */
    private ownsSelection(selection: number, operation: string): boolean {
        if (selection === this.snapshot.selection) return true;
        logger.info({ operation, scope: "transcript", selection }, "ask-dev stale answer dropped");
        return false;
    }

    /** True when history work of `revision` may still commit; else logs the dropped answer. */
    private ownsHistory(generation: number, revision: number, operation: string): boolean {
        if (generation === this.snapshot.generation && revision === this.historyRevision) {
            return true;
        }
        logger.info({ operation, scope: "history", revision }, "ask-dev stale answer dropped");
        return false;
    }

    private writeHint(threadId: string, expiresAt: string | null): void {
        if (typeof this.partition !== "string") return;
        const hint: ThreadHint = {
            thread_id: threadId,
            partition: partitionTag(this.partition),
            expires_at: expiresAt,
        };
        this.hints.write(JSON.stringify(hint));
    }

    private async readThread(threadId: string, userAct: boolean): Promise<void> {
        const selection = this.snapshot.selection;
        const signal = this.selectionAbort.signal;
        const startedAt = this.now();
        let view: ThreadView | null;
        try {
            view = await this.transport.readThread({ threadId, signal, userAct });
        } catch (error) {
            if (!this.ownsSelection(selection, "thread_read")) return;
            logger.info(
                { thread_id: threadId, stage: "read", status: failureStatus(error), selection },
                "ask-dev thread restore failed",
            );
            if (readCannotHelp(error)) {
                // Reading again cannot help, on this load or the next.
                if (parseHint(this.hints.read())?.thread_id === threadId) this.hints.clear();
                this.commit({ ...this.snapshot, threadId: null, thread: { kind: "unavailable" } });
                return;
            }
            // Impersonating, or no entitlement: another read cannot help, so nothing offers one.
            const access = authorizationFailureOf(error);
            const closed = access === "impersonating" || access === "not_entitled";
            this.commit({
                ...this.snapshot,
                thread: closed ? { kind: "unavailable" } : { kind: "read_failed" },
            });
            return;
        }
        if (!this.ownsSelection(selection, "thread_read")) return;
        if (view === null || this.deleted.has(threadId)) {
            // ACR's 404 is the same for every cause (INV-1): the neutral read-only state.
            this.hints.clear();
            logger.info(
                { thread_id: threadId, stage: "read", status: 404, selection },
                "ask-dev thread restore failed",
            );
            if (this.readingLostThread) {
                // This tab's own conversation, which ACR never held: a question it refused, or a
                // tab closed before it admitted one. The reader lost nothing they can reopen, so
                // this is a fresh conversation with the "not saved" notice, never a closed
                // composer. "local" lets the page drop the dead id from the URL (CHAOS-12503).
                this.commit({
                    ...this.snapshot,
                    threadId: null,
                    selectionSource: "local",
                    thread: { kind: "new" },
                });
                return;
            }
            this.commit({ ...this.snapshot, threadId: null, thread: { kind: "unavailable" } });
            return;
        }
        if (view.threadId !== threadId) {
            logger.info(
                { thread_id: threadId, stage: "read", status: "invalid_upstream", selection },
                "ask-dev thread restore failed",
            );
            this.commit({ ...this.snapshot, thread: { kind: "read_failed" } });
            return;
        }
        this.writeHint(threadId, view.expiresAt);
        this.earlierCursor = view.earlierTurnsCursor;
        this.restore = {
            selection,
            startedAt,
            pending: 0,
            replays: 0,
            unavailable: 0,
            failed: 0,
        };
        const fresh = uniqueTurns(view.turns, new Set());
        this.commit({
            ...this.snapshot,
            turns: fresh.map((turn) => this.restoredTurn(threadId, turn)),
            thread: { kind: "restoring" },
        });
        this.startRestoredWork(fresh, selection, true);
        this.settleRestoreIfDone();
    }

    private async readEarlier(threadId: string, cursor: string): Promise<void> {
        const selection = this.snapshot.selection;
        const signal = this.selectionAbort.signal;
        let view: ThreadView | null;
        try {
            view = await this.transport.readThread({ threadId, before: cursor, signal });
        } catch (error) {
            if (!this.ownsSelection(selection, "earlier_read")) return;
            logger.info(
                { thread_id: threadId, stage: "earlier", status: failureStatus(error), selection },
                "ask-dev thread restore failed",
            );
            if (error instanceof TransportRefusal && error.status === 400) {
                // A stale cursor: read the thread again from its latest page.
                this.reread(threadId);
                return;
            }
            if (readCannotHelp(error)) {
                // "Try again" on the earlier page cannot help, nor can a reload.
                if (parseHint(this.hints.read())?.thread_id === threadId) this.hints.clear();
                this.dropSelectionWork("detach");
                this.commit({
                    ...this.snapshot,
                    threadId: null,
                    thread: { kind: "unavailable" },
                    turns: [],
                    inFlight: false,
                });
                return;
            }
            this.commit({ ...this.snapshot, thread: { kind: "loaded", earlier: "failed" } });
            return;
        }
        if (!this.ownsSelection(selection, "earlier_read")) return;
        if (view === null) {
            this.hints.clear();
            logger.info(
                { thread_id: threadId, stage: "earlier", status: 404, selection },
                "ask-dev thread restore failed",
            );
            this.dropSelectionWork("detach");
            this.commit({
                ...this.snapshot,
                threadId: null,
                thread: { kind: "unavailable" },
                turns: [],
                inFlight: false,
            });
            return;
        }
        if (view.threadId !== threadId) {
            // Another thread's page is never this conversation's (codex r1 on #1648).
            logger.info(
                { thread_id: threadId, stage: "earlier", status: "invalid_upstream", selection },
                "ask-dev thread restore failed",
            );
            this.commit({ ...this.snapshot, thread: { kind: "loaded", earlier: "failed" } });
            return;
        }
        const known = new Set(this.snapshot.turns.map((turn) => turn.submissionId));
        const fresh = uniqueTurns(view.turns, known);
        this.earlierCursor = view.earlierTurnsCursor;
        this.commit({
            ...this.snapshot,
            turns: [
                ...fresh.map((turn) => this.restoredTurn(threadId, turn)),
                ...this.snapshot.turns,
            ],
            thread: {
                kind: "loaded",
                earlier: view.earlierTurnsCursor === null ? "none" : "available",
            },
        });
        this.startRestoredWork(fresh, selection, false);
    }

    /** A turn read from ACR's thread, with the state its submission was in. */
    private restoredTurn(threadId: string, turn: ThreadTurnView): RestoredTurn {
        return {
            id: this.nextTurnId++,
            threadId,
            origin: "restored",
            question: turn.question,
            createdAt: turn.admittedAt,
            submissionId: turn.submissionId,
            request: null,
            outcome: restoredOutcome(turn),
        };
    }

    /** Replays each restored answer and observes each running turn. */
    private startRestoredWork(
        turns: readonly ThreadTurnView[],
        selection: number,
        counted: boolean,
    ): void {
        for (const turn of turns) {
            if (turn.state === "running") {
                void this.followRestored(turn.submissionId, selection);
            } else if (turn.state === "done" && turn.resultId !== null) {
                this.restoredResultIds.set(turn.submissionId, turn.resultId);
                if (counted && this.restore !== null) {
                    this.restore.pending += 1;
                    this.restore.replays += 1;
                }
                this.queueReplay(turn.submissionId, turn.resultId, selection, counted);
            } else if (turn.state === "done" && counted && this.restore !== null) {
                this.restore.unavailable += 1;
            }
        }
    }

    private queueReplay(
        submissionId: string,
        resultId: string,
        selection: number,
        counted: boolean,
        onSettled?: () => boolean,
    ): void {
        const signal = this.selectionAbort.signal;
        this.replaying.add(submissionId);
        // The snapshot says so at once: the composer locks before the read starts.
        this.commit({ ...this.snapshot });
        this.replayQueue.push(() =>
            this.replayRestored(submissionId, resultId, selection, signal, counted, onSettled),
        );
        this.pumpReplays();
    }

    private pumpReplays(): void {
        while (this.replaysRunning < REPLAY_CONCURRENCY && this.replayQueue.length > 0) {
            const task = this.replayQueue.shift();
            if (task === undefined) return;
            const selection = this.snapshot.selection;
            this.replaysRunning += 1;
            void task().finally(() => {
                // A replay of an older selection frees no slot of this one.
                if (selection !== this.snapshot.selection) return;
                this.replaysRunning -= 1;
                this.pumpReplays();
            });
        }
    }

    /** Reads one restored answer again by its final `result_id`: a GET, never an investigation. */
    private async replayRestored(
        submissionId: string,
        resultId: string,
        selection: number,
        signal: AbortSignal,
        counted: boolean,
        onSettled?: () => boolean,
    ): Promise<void> {
        let result: TranscriptResult;
        try {
            result = await this.transport.readResult(resultId, signal);
        } catch (error) {
            if (!this.ownsSelection(selection, "replay")) return;
            this.replaying.delete(submissionId);
            // The run it belongs to already ended (its deadline): this answer changes nothing.
            if (onSettled !== undefined && !onSettled()) return;
            const unavailable =
                (error instanceof TransportRefusal && error.status === 404) ||
                readCannotHelp(error);
            logger.warn(
                {
                    submission_id: submissionId,
                    result_id: resultId,
                    status: failureStatus(error),
                },
                "ask-dev result replay failed",
            );
            this.updateRestored(
                submissionId,
                unavailable ? { kind: "unavailable" } : { kind: "restore_failed" },
            );
            if (counted) this.restoreCounted(selection, unavailable ? "unavailable" : "failed");
            return;
        }
        if (!this.ownsSelection(selection, "replay")) return;
        this.replaying.delete(submissionId);
        if (onSettled !== undefined && !onSettled()) return;
        this.updateRestored(submissionId, { kind: "answered", result });
        if (counted) this.restoreCounted(selection, "answered");
    }

    private restoreCounted(selection: number, how: "answered" | "unavailable" | "failed"): void {
        const restore = this.restore;
        if (restore === null || restore.selection !== selection) return;
        restore.pending -= 1;
        if (how === "unavailable") restore.unavailable += 1;
        if (how === "failed") restore.failed += 1;
        this.settleRestoreIfDone();
    }

    /** Every restored answer settled: the conversation is the store's, and a submit may follow. */
    private settleRestoreIfDone(): void {
        const restore = this.restore;
        if (restore === null || restore.pending > 0) return;
        if (this.snapshot.thread.kind !== "restoring") return;
        this.restore = null;
        logger.info(
            {
                thread_id: this.snapshot.threadId,
                turns: this.snapshot.turns.length,
                replays: restore.replays,
                unavailable: restore.unavailable,
                failed: restore.failed,
                duration_ms: this.now() - restore.startedAt,
                selection: restore.selection,
            },
            "ask-dev thread restored",
        );
        this.commit({
            ...this.snapshot,
            thread: {
                kind: "loaded",
                earlier: this.earlierCursor === null ? "none" : "available",
            },
        });
    }

    /** Sets a restored turn's outcome, found by its `submission_id`. */
    private updateRestored(submissionId: string, outcome: TurnOutcome): void {
        this.commit({
            ...this.snapshot,
            turns: this.snapshot.turns.map((turn) =>
                turn.submissionId === submissionId && turn.origin === "restored"
                    ? { ...turn, outcome }
                    : turn,
            ),
            inFlight: this.active !== null,
        });
    }

    /**
     * A restored turn that was still running (CHAOS-11957, E6 design v5 §5): the store attaches to
     * its events from `accepted` (a reload has no cursor), shows its progress, and ends it on its
     * terminal. When ACR cannot serve the events (404, 410: no lease, the window moved, it ended),
     * the status is read every 3 s instead. Its deadline is `started_at` + budget + 30 s once
     * `accepted` is seen, else the 10-minute observation window; a timer at D ends it whatever it
     * waits on.
     */
    private async followRestored(submissionId: string, selection: number): Promise<void> {
        const turn = this.snapshot.turns.find(
            (candidate) =>
                candidate.submissionId === submissionId && candidate.origin === "restored",
        );
        if (turn === undefined || selection !== this.snapshot.selection) return;
        const startedAt = "startedAt" in turn.outcome ? turn.outcome.startedAt : this.now();
        const run: ActiveRun = {
            turnId: turn.id,
            submissionId,
            origin: "restored",
            controller: new AbortController(),
            startedAt,
            deadline: this.now() + OBSERVATION_CAP_MS,
            timer: undefined,
            detached: false,
            detachTimer: undefined,
            deadlineSource: "observation_cap",
            requestId: null,
            nextSeq: 1,
            lastElapsedMs: null,
            applied: new Map(),
            attachmentGeneration: 0,
            stop: "idle",
            lastSeenRunningAt: undefined,
            streaming: false,
        };
        this.observed.set(submissionId, run);
        run.timer = setTimeout(() => this.expire(run), Math.max(0, run.deadline - this.now()));
        this.commit({ ...this.snapshot });
        if ((await this.reattach(run)) === "done") return;
        if (!this.owns(run)) return;
        await this.observeStatus(run);
    }

    /**
     * An observed run's status, every 3 s until a final state or its D (§5.3). A failed read
     * confirms nothing. Every wait is clamped to the time left before D.
     */
    private async observeStatus(run: ActiveRun): Promise<void> {
        const { submissionId } = run;
        const signal = run.controller.signal;
        const selection = this.snapshot.selection;
        if (this.turn(run.turnId)?.outcome.kind !== "canceling") {
            this.setOutcome(run.turnId, { kind: "observing", startedAt: run.startedAt }, true);
        }
        for (;;) {
            let status;
            try {
                status = await this.transport.submissionStatus(submissionId, signal);
            } catch (error) {
                if (!this.owns(run)) return;
                logger.warn(
                    { err: error, submission_id: submissionId },
                    "ask-dev submission status read failed",
                );
                if (readCannotHelp(error)) {
                    // Polling again cannot help.
                    this.settle(run, { kind: "unavailable" });
                    return;
                }
                status = undefined;
            }
            if (!this.owns(run)) return;
            if (status === null) {
                this.settle(run, { kind: "unavailable" });
                return;
            }
            if (status?.state === "done") {
                if (status.result_id === undefined) {
                    this.settle(run, { kind: "unavailable" });
                    return;
                }
                this.restoredResultIds.set(submissionId, status.result_id);
                // The run stays followed until its answer is read: a follow-up must carry it
                // (codex r1 on #1648). Its timer stays too: a read that never answers ends at D
                // (codex r1 on #1657), and an answer after that is dropped.
                this.updateRestored(submissionId, { kind: "restoring" });
                this.queueReplay(submissionId, status.result_id, selection, false, () => {
                    if (!this.owns(run)) return false;
                    this.release(run);
                    return true;
                });
                return;
            }
            if (status?.state === "done_unsaved") {
                this.settle(run, { kind: "unsaved" });
                return;
            }
            if (status?.state === "abandoned") {
                this.settle(
                    run,
                    run.stop === "idle" ? { kind: "interrupted" } : { kind: "halted" },
                );
                return;
            }
            if (status?.state === "running") run.lastSeenRunningAt = this.now();
            const left = run.deadline - this.now();
            if (left <= 0) {
                this.expire(run);
                return;
            }
            try {
                await this.sleep(Math.min(STATUS_POLL_INTERVAL_MS, left), signal);
            } catch {
                return;
            }
            if (!this.owns(run)) return;
        }
    }

    private async readHistoryPage(
        cursor: string | undefined,
        revision: number,
        generation: number,
    ): Promise<void> {
        let page;
        try {
            page = await this.transport.listThreads({
                cursor,
                limit: HISTORY_PAGE_SIZE,
                signal: this.historyAbort.signal,
            });
        } catch (error) {
            if (!this.ownsHistory(generation, revision, "history_read")) return;
            logger.info(
                { stage: "list", status: failureStatus(error), revision },
                "ask-dev thread restore failed",
            );
            if (cursor !== undefined && error instanceof TransportRefusal && error.status === 400) {
                // A stale cursor: read the list again from its first page.
                this.loadHistory();
                return;
            }
            if (readCannotHelp(error)) {
                // On any page: no rows, nothing to retry.
                this.commitHistory({
                    status: noRepositoryInScope(error) ? "no_repository" : "unavailable",
                    threads: [],
                    nextCursor: null,
                    loadingMore: false,
                    moreFailed: false,
                });
                return;
            }
            this.commitHistory(
                cursor === undefined
                    ? { status: "read_failed", loadingMore: false }
                    : { loadingMore: false, moreFailed: true },
            );
            return;
        }
        if (!this.ownsHistory(generation, revision, "history_read")) return;
        const seen = new Set<string>();
        const rows =
            cursor === undefined
                ? page.threads
                : [...this.snapshot.history.threads, ...page.threads];
        // A deleted thread stays out, whichever page (or late answer) still lists it.
        const threads = rows
            .filter((row) => !this.deleted.has(row.threadId))
            .filter((row) => {
                if (seen.has(row.threadId)) return false;
                seen.add(row.threadId);
                return true;
            });
        this.commitHistory({
            status: "ready",
            threads,
            nextCursor: page.nextCursor,
            loadingMore: false,
        });
    }

    private async removeThread(threadId: string, generation: number): Promise<void> {
        try {
            await this.transport.deleteThread({ threadId, signal: this.deleteAbort.signal });
        } catch (error) {
            if (generation !== this.snapshot.generation) return;
            logger.warn(
                { thread_id: threadId, status: failureStatus(error) },
                "ask-dev thread not deleted",
            );
            this.commitHistory({
                deleting: this.snapshot.history.deleting.filter((id) => id !== threadId),
                deleteFailed: threadId,
            });
            return;
        }
        // The partition's tombstone: it lands after a thread switch too (E6 design v5 N1).
        if (generation !== this.snapshot.generation) {
            logger.info(
                { operation: "delete", scope: "history", revision: this.historyRevision },
                "ask-dev stale answer dropped",
            );
            return;
        }
        this.deleted.add(threadId);
        const current = threadId === this.snapshot.threadId;
        logger.info({ thread_id: threadId, current }, "ask-dev thread deleted");
        const { history } = this.snapshot;
        this.commitHistory({
            deleting: history.deleting.filter((id) => id !== threadId),
            threads: history.threads.filter((row) => row.threadId !== threadId),
            deleteFailed: history.deleteFailed === threadId ? null : history.deleteFailed,
        });
        if (parseHint(this.hints.read())?.thread_id === threadId) this.hints.clear();
        if (current) {
            // Delete is not Stop: ACR keeps a leased run going; this tab drops the conversation.
            this.resetSelection("thread_deleted");
            this.commit({ ...this.snapshot, selectionSource: "local" });
        }
    }

    private turn(turnId: number): StoreTurn | undefined {
        return this.snapshot.turns.find((turn) => turn.id === turnId);
    }

    private update(turnId: number, change: (turn: StoreTurn) => StoreTurn, inFlight: boolean) {
        this.commit({
            ...this.snapshot,
            turns: this.snapshot.turns.map((turn) => (turn.id === turnId ? change(turn) : turn)),
            inFlight,
        });
    }

    private setOutcome(turnId: number, outcome: TurnOutcome, inFlight: boolean): void {
        this.update(turnId, (turn) => ({ ...turn, outcome }), inFlight);
    }

    /**
     * The run is still the store's run. `clear` (a new generation), `cancel` and every terminal drop
     * the active run, so an event, a status answer or a replay of the run they ended changes nothing.
     */
    private owns(run: ActiveRun): boolean {
        return this.active === run || this.observed.get(run.submissionId) === run;
    }

    /**
     * Keeps a released run's stream open to its terminal (a disconnect would end a run that has no
     * lease), and closes it at its deadline D whatever it is waiting on.
     */
    private detach(run: ActiveRun): void {
        run.detached = true;
        run.detachTimer = setTimeout(
            () => run.controller.abort(),
            Math.max(0, run.deadline - this.now()),
        );
    }

    /** Lets the run go: nothing it still delivers changes the store after this. */
    private release(run: ActiveRun): void {
        if (this.active === run) this.active = null;
        if (this.observed.get(run.submissionId) === run) this.observed.delete(run.submissionId);
        clearTimeout(run.timer);
    }

    /**
     * The run reached its deadline D in any phase (streaming, recovering or replaying): it ends as
     * interrupted, and the thread is free. A transport call that never answers cannot hold it.
     */
    private expire(run: ActiveRun): void {
        if (!this.owns(run)) return;
        if (run.origin === "restored") {
            // An answer read still pending for this run no longer holds the composer.
            this.replaying.delete(run.submissionId);
            // E6 design v5 §5.3: a known D ends as interrupted; the observation cap confirms
            // nothing, so it says so.
            logger.info(
                { submission_id: run.submissionId, deadline_source: run.deadlineSource },
                "ask-dev observed run expired",
            );
            this.settle(
                run,
                run.deadlineSource === "observation_cap"
                    ? { kind: "unconfirmed", lastSeenRunningAt: run.lastSeenRunningAt }
                    : { kind: "interrupted" },
            );
            run.controller.abort();
            return;
        }
        const turn = this.turn(run.turnId);
        logger.warn(
            {
                submission_id: turn?.submissionId,
                request_id: turn?.request?.request_id,
                outcome: turn?.outcome.kind,
            },
            "ask-dev run reached its deadline",
        );
        this.settle(run, { kind: "interrupted" });
        run.controller.abort();
    }

    /**
     * `thread_closed` (contract: deleted, expired or full; start a new conversation): the turn ends
     * as `thread_closed`, the thread is dropped, and the next question carries nothing from it.
     */
    private closeThread(run: ActiveRun): void {
        this.settle(run, { kind: "thread_closed" });
        if (parseHint(this.hints.read())?.thread_id === this.snapshot.threadId) this.hints.clear();
        // The closed thread's turns stay on screen under their own `threadId`; the next submit
        // mints a new one and carries nothing from them.
        this.commit({
            ...this.snapshot,
            threadId: null,
            thread: { kind: "new" },
            selectionSource: "local",
        });
    }

    private settle(run: ActiveRun, outcome: TurnOutcome): void {
        this.release(run);
        this.setOutcome(run.turnId, outcome, false);
    }

    private async run(turnId: number): Promise<void> {
        const turn = this.turn(turnId);
        const threadId = this.snapshot.threadId;
        // A restored turn has no request: it is never sent (E6 design v5 §3.2).
        if (turn?.origin !== "submitted" || threadId === null) return;
        const startedAt = turn.outcome.kind === "running" ? turn.outcome.startedAt : this.now();
        const deadline = this.now() + this.runTimeoutMs;
        const run: ActiveRun = {
            turnId,
            submissionId: turn.submissionId,
            origin: "submitted",
            controller: new AbortController(),
            startedAt,
            deadline,
            timer: undefined,
            detached: false,
            detachTimer: undefined,
            deadlineSource: "memory",
            requestId: null,
            nextSeq: 1,
            lastElapsedMs: null,
            applied: new Map(),
            attachmentGeneration: 0,
            stop: "idle",
            lastSeenRunningAt: undefined,
            streaming: true,
        };
        this.active = run;
        run.timer = setTimeout(() => this.expire(run), Math.max(0, deadline - this.now()));
        const submissionId = turn.submissionId;
        const requestId = turn.request.request_id;
        let accepted = false;
        try {
            const events = this.transport.investigate({
                request: turn.request,
                submissionId: turn.submissionId,
                threadId,
                deadline,
                signal: run.controller.signal,
            });
            for await (const event of events) {
                // A detached run is read to its end, and nothing it delivers commits.
                if (run.detached) continue;
                // A late event of a run the store gave up (cleared, canceled) is dropped.
                if (!this.owns(run)) return;
                // Past D nothing is taken, even an event that was already buffered (codex r2 on
                // #1657): the deadline timer may not have run yet.
                if (this.pastDeadline(run)) return;
                if (event.type === "accepted") accepted = true;
                // The transport owns this stream's grammar (T14); the store records where it is,
                // so an attach can resume from the same point (E6 design v5 §5.2).
                this.record(run, event);
                if (this.apply(run, event)) return;
            }
        } catch (error) {
            run.streaming = false;
            if (run.detached) clearTimeout(run.detachTimer);
            if (!this.owns(run)) return;
            if (error instanceof TransportRefusal) {
                await this.refused(run, deadline, error);
                return;
            }
            if (error instanceof TransportFailure) {
                if (error.reason === "stalled" && accepted) {
                    // The browser closed a silent stream; a leased run goes on on ACR, so its
                    // events are read again (codex r3 on #1657). A run ACR then reports ended
                    // without an answer keeps the stalled state.
                    logger.warn(
                        { submission_id: submissionId, request_id: requestId },
                        "ask-dev stream stalled after accepted; attaching",
                    );
                    if ((await this.reattach(run)) === "done") return;
                    if (!this.owns(run)) return;
                    await this.recover(run, deadline, true, { kind: "stalled" });
                    return;
                }
                this.transportFailed(run, error.reason);
                return;
            }
            logger.warn(
                { err: error, submission_id: submissionId, request_id: requestId },
                "ask-dev stream dropped",
            );
        }
        run.streaming = false;
        if (run.detached) clearTimeout(run.detachTimer);
        if (!this.owns(run)) return;
        logger.warn(
            { submission_id: submissionId, request_id: requestId, accepted },
            "ask-dev stream ended without a terminal; recovering",
        );
        // ACR admitted the run: a leased run goes on, so attach from the last event seen. Before
        // `accepted` the call may never have been admitted, so only the status can say.
        if (accepted && (await this.reattach(run)) === "done") return;
        if (!this.owns(run)) return;
        await this.recover(run, deadline, accepted);
    }

    /** At or past D: the run ends now (as its timer would), and nothing more is taken. */
    private pastDeadline(run: ActiveRun): boolean {
        if (this.now() < run.deadline) return false;
        this.expire(run);
        return true;
    }

    /** Where the run is after `event` (applied): the resume state of §5.2. */
    private record(run: ActiveRun, event: InvestigationEvent): void {
        if (run.requestId === null) run.requestId = event.request_id;
        run.applied.set(event.seq, fingerprint(event));
        run.nextSeq = event.seq + 1;
        if (event.type === "accepted") run.lastElapsedMs = 0;
        if (
            (event.type === "stage" || event.type === "heartbeat") &&
            Number.isSafeInteger(event.elapsed_ms)
        ) {
            run.lastElapsedMs = event.elapsed_ms;
        }
    }

    /**
     * What an attached event is (E6 design v5 §5.2), checked in this order: the run's own
     * `request_id`; an older `seq` (a duplicate when identical, dropped with no `elapsed` check);
     * a gap; then, for the next event, an `elapsed_ms` that goes back or jumps more than 11 s.
     */
    private admit(
        run: ActiveRun,
        event: InvestigationEvent,
    ): "apply" | "duplicate" | "gap" | "request_changed" | "payload_changed" | "elapsed_invalid" {
        if (run.requestId !== null && event.request_id !== run.requestId) return "request_changed";
        if (event.seq < run.nextSeq) {
            return run.applied.get(event.seq) === fingerprint(event)
                ? "duplicate"
                : "payload_changed";
        }
        if (event.seq > run.nextSeq) return "gap";
        if (event.type === "stage" || event.type === "heartbeat") {
            const last = run.lastElapsedMs ?? 0;
            const elapsed = event.elapsed_ms;
            if (
                !Number.isSafeInteger(elapsed) ||
                elapsed < last ||
                elapsed - last > ELAPSED_STEP_MAX_MS
            ) {
                return "elapsed_invalid";
            }
        }
        return "apply";
    }

    /**
     * Attaches to the run's events (E6 design v5 §5.2): from its last seen `seq`, or from
     * `accepted` when none was seen (a reload). A gap, a protocol error, a stall or a drop attaches
     * again, at most `ATTACH_ATTEMPTS` times; ACR's 404 or 410 (the cursor left the window, the run
     * has no lease, or it ended) falls back at once. `done` when a terminal ended the run (or the
     * store let it go); `fallback` when only the status can say.
     */
    private async reattach(run: ActiveRun): Promise<"done" | "fallback"> {
        let reason = "dropped";
        for (let attempt = 1; attempt <= ATTACH_ATTEMPTS; attempt++) {
            if (!this.owns(run)) return "done";
            const generation = ++run.attachmentGeneration;
            const attachment = childController(run.controller.signal);
            const cursor = run.applied.size === 0 ? undefined : run.nextSeq - 1;
            logger.info(
                {
                    submission_id: run.submissionId,
                    cursor: cursor ?? "none",
                    attempt,
                    selection: this.snapshot.selection,
                },
                "ask-dev attach selected",
            );
            const current = () => this.owns(run) && generation === run.attachmentGeneration;
            try {
                const events = this.transport.attach({
                    submissionId: run.submissionId,
                    lastEventId: cursor,
                    signal: attachment.signal,
                });
                let broke = false;
                for await (const event of events) {
                    // A detached run is drained to its terminal, as its own stream is.
                    if (run.detached) continue;
                    if (!current()) {
                        logger.info(
                            { operation: "attach", scope: "run", revision: generation },
                            "ask-dev stale answer dropped",
                        );
                        return "done";
                    }
                    const verdict = this.admit(run, event);
                    if (verdict === "duplicate") continue;
                    if (verdict !== "apply") {
                        reason = verdict;
                        broke = true;
                        break;
                    }
                    if (this.pastDeadline(run)) return "done";
                    this.record(run, event);
                    if (this.apply(run, event)) return "done";
                }
                if (run.detached) {
                    clearTimeout(run.detachTimer);
                    return "done";
                }
                attachment.abort();
                if (!broke) reason = "dropped";
            } catch (error) {
                if (run.detached) {
                    clearTimeout(run.detachTimer);
                    return "done";
                }
                attachment.abort();
                if (!current()) return "done";
                if (error instanceof TransportRefusal) {
                    reason =
                        error.error.error.code === "cursor_expired"
                            ? "cursor_expired"
                            : String(error.status);
                    logger.info(
                        { submission_id: run.submissionId, reason, attempts: attempt },
                        "ask-dev attach fell back",
                    );
                    return "fallback";
                }
                reason = error instanceof TransportFailure ? error.reason : "dropped";
            }
        }
        if (!this.owns(run)) return "done";
        logger.info(
            { submission_id: run.submissionId, reason, attempts: ATTACH_ATTEMPTS },
            "ask-dev attach fell back",
        );
        return "fallback";
    }

    /**
     * A restored run's `accepted` (the cursorless attach replays it): its deadline is ACR's own
     * bound, `started_at` + `budget_seconds` + 30 s (E6 design v5 §5.3), and its progress shows.
     */
    private acceptedOnAttach(
        run: ActiveRun,
        event: Extract<InvestigationEvent, { type: "accepted" }>,
    ): void {
        const startedAt = epochOf(event.started_at);
        run.deadline = startedAt + event.budget_seconds * 1000 + BUDGET_GRACE_MS;
        run.deadlineSource = "accepted";
        clearTimeout(run.timer);
        run.timer = setTimeout(() => this.expire(run), Math.max(0, run.deadline - this.now()));
        // A Stop ACR already confirmed (202, or 204 being read) keeps saying so (codex r1 on #1657).
        if (this.turn(run.turnId)?.outcome.kind !== "canceling") {
            this.setOutcome(run.turnId, { kind: "running", startedAt, stages: {} }, true);
        }
    }

    /** Applies one event; `true` when it was the terminal. */
    private apply(run: ActiveRun, event: InvestigationEvent): boolean {
        switch (event.type) {
            case "accepted": {
                if (run.origin === "restored") this.acceptedOnAttach(run, event);
                this.update(
                    run.turnId,
                    (turn) => ({ ...turn, reservedResultId: event.reserved_result_id }),
                    true,
                );
                // ACR admitted a turn of this thread: a reload can now restore it. Its expiry is
                // unknown here (the next thread read gives it).
                const threadId = this.turn(run.turnId)?.threadId;
                if (threadId !== undefined && threadId === this.snapshot.threadId) {
                    this.writeHint(threadId, null);
                }
                return false;
            }
            case "stage":
                this.update(run.turnId, (turn) => advanceStage(turn, event), true);
                return false;
            case "heartbeat":
                return false;
            case "result":
                this.settle(run, { kind: "answered", result: event.result });
                return true;
            case "error": {
                const code = event.error.error.code;
                const turn = this.turn(run.turnId);
                logger.warn(
                    {
                        submission_id: turn?.submissionId,
                        request_id: turn?.request?.request_id,
                        code,
                    },
                    "ask-dev investigation ended with an error",
                );
                if (code === "budget_refusal") {
                    this.settle(run, {
                        kind: "refused",
                        refusal: {
                            type: "error",
                            reserved_result_id: event.reserved_result_id,
                            error: event.error,
                        },
                    });
                } else if (code === "thread_closed") {
                    // The contract sends it as a 409 before the stream; the store does not rely on that.
                    this.closeThread(run);
                } else {
                    // ACR closed the submission with this terminal: the same key cannot run again,
                    // so the way on is a new question.
                    const deadline = deadlineOf(event.error);
                    this.settle(
                        run,
                        terminalOutcomeOf(code) ??
                            (deadline === undefined
                                ? {
                                      kind: "failed",
                                      retry: false,
                                      reference: this.reference(run, event.error),
                                  }
                                : { kind: "deadline", deadline }),
                    );
                }
                return true;
            }
        }
    }

    /** ACR answered before the stream opened (plan §2.7.5 "Repeat key"). */
    private async refused(
        run: ActiveRun,
        deadline: number,
        refusal: TransportRefusal,
    ): Promise<void> {
        const code = refusal.error.error.code;
        const turn = this.turn(run.turnId);
        const fields = { submission_id: turn?.submissionId, status: refusal.status, code };
        switch (code) {
            case "submission_in_progress":
                // The first run under this key is still live: follow it, never start another.
                logger.info(fields, "ask-dev submission still running; recovering");
                await this.recover(run, deadline, true);
                return;
            case "submission_unsaved":
                this.settle(run, { kind: "unsaved" });
                return;
            case "submission_abandoned":
                this.settle(run, { kind: "abandoned" });
                return;
            case "canceled":
                this.settle(run, { kind: "canceled" });
                return;
            case "run_lost":
                this.settle(run, { kind: "interrupted" });
                return;
            case "budget_exhausted":
                // ACR's per-call access read left too little wait budget; nothing ran (CHAOS-12201).
                this.settle(run, { kind: "deadline", deadline: "budget_exhausted" });
                return;
            case "invalid_request":
                // The store builds every request from the contract: a defect, never a user error.
                logger.error(fields, "ask-dev investigation request refused as invalid");
                this.settle(run, {
                    kind: "failed",
                    retry: false,
                    reference: this.reference(run, refusal.error),
                });
                return;
            case "thread_closed":
                // The contract: nothing ran, not retryable under these ids; start a new
                // conversation. The next submit mints a new thread and carries nothing from this one.
                logger.warn(fields, "ask-dev thread closed; the next question starts a new one");
                this.closeThread(run);
                return;
            case "submission_required":
                // The store sends a submission id on every create: a defect, never a user error.
                logger.error(fields, "ask-dev create sent without a submission id");
                this.settle(run, {
                    kind: "failed",
                    retry: false,
                    reference: this.reference(run, refusal.error),
                });
                return;
            case "submission_mismatch":
                // The store reused a key for another request: a defect, never a user error.
                logger.error(fields, "ask-dev submission id reused for a different request");
                this.settle(run, {
                    kind: "mismatch",
                    reference: this.reference(run, refusal.error),
                });
                return;
            case "concurrency_limited":
            case "allowance_exhausted": {
                const limit = limitOf(refusal.error);
                logger.info(
                    {
                        submission_id: fields.submission_id,
                        status: fields.status,
                        code: fields.code,
                        limit,
                        retry_after_seconds: refusal.retryAfterSeconds,
                    },
                    "ask-dev submission refused by a shared limit",
                );
                this.settle(run, {
                    kind: "limited",
                    limit,
                    retry: refusal.error.error.retryable,
                    retryAfterSeconds: refusal.retryAfterSeconds,
                });
                return;
            }
            case "stream_unavailable":
                logger.warn(fields, "ask-dev event stream turned off on this deployment");
                this.settle(run, { kind: "stream_unavailable" });
                return;
            default: {
                // ACR's words for an access limit are not a closed code, and this sentence is true.
                const reason = aboveAccessLimit(refusal) ? "not_entitled" : notRunReasonOf(code);
                if (reason !== undefined) {
                    logger.info(fields, "ask-dev investigation not run");
                    this.settle(run, { kind: "not_run", reason, retry: NOT_RUN_RETRY[reason] });
                    return;
                }
                logger.warn(fields, "ask-dev investigation refused before the stream");
                const deadlineKind = deadlineOf(refusal.error);
                this.settle(
                    run,
                    deadlineKind === undefined
                        ? {
                              kind: "failed",
                              retry: refusal.error.error.retryable,
                              reference: this.reference(run, refusal.error),
                          }
                        : { kind: "deadline", deadline: deadlineKind },
                );
            }
        }
    }

    /**
     * The browser transport ended the run itself (`TransportFailure`). Its abort is a disconnect,
     * which ends ACR's run (plan §2.7.4), so there is nothing to poll for: the turn ends with the
     * reason's own state.
     */
    private transportFailed(run: ActiveRun, reason: TransportFailureReason): void {
        const turn = this.turn(run.turnId);
        logger.warn(
            { submission_id: turn?.submissionId, request_id: turn?.request?.request_id, reason },
            "ask-dev transport ended the run",
        );
        switch (reason) {
            case "stalled":
                this.settle(run, { kind: "stalled" });
                return;
            case "admission_timeout":
                this.settle(run, { kind: "deadline", deadline: "admission" });
                return;
            case "budget_exhausted":
                this.settle(run, { kind: "deadline", deadline: "budget_exhausted" });
                return;
            case "invalid_upstream":
                this.settle(run, { kind: "failed", retry: false, reference: this.reference(run) });
                return;
            case "authorization_required":
            case "authorization_failed":
            case "authorization_limited":
            case "not_entitled":
            case "impersonating":
            case "session_ended":
                this.settle(
                    run,
                    authorizationOutcome(AUTHORIZATION_FAILURE_OF[reason] as AuthorizationFailure),
                );
                return;
        }
    }

    /**
     * The correlation code a failed turn shows: ACR's `request_id` from its `error.v1`, when it is a
     * plain id, else the `request_id` this turn sent. Never free text.
     */
    private reference(run: ActiveRun, error?: ACRErrorV1): string | undefined {
        if (error !== undefined && REFERENCE_PATTERN.test(error.request_id))
            return error.request_id;
        const own = this.turn(run.turnId)?.request?.request_id;
        return own !== undefined && REFERENCE_PATTERN.test(own) ? own : undefined;
    }

    /**
     * §2.7.5 recovery: polls the submission status every 3 s until the deadline. Each poll is a
     * fresh call that ACR authorizes again. `done` replays the FINAL `result_id` (a reused answer
     * keeps its own id, which is not the reserved one).
     */
    /**
     * `lost` is what a run that ended without an answer shows (abandoned, or no record after
     * `accepted`): interrupted, or stalled after a stall (codex r3 on #1657).
     */
    private async recover(
        run: ActiveRun,
        deadline: number,
        accepted: boolean,
        lost: TurnOutcome = { kind: "interrupted" },
    ): Promise<void> {
        const turn = this.turn(run.turnId);
        if (turn === undefined) return;
        const submissionId = turn.submissionId;
        const requestId = turn.request?.request_id;
        const signal = run.controller.signal;
        // A Stop in progress keeps saying so while the status is read.
        if (turn.outcome.kind !== "canceling") {
            this.setOutcome(run.turnId, { kind: "recovering", startedAt: run.startedAt }, true);
        }
        for (;;) {
            let status;
            try {
                status = await this.transport.submissionStatus(submissionId, signal);
            } catch (error) {
                if (!this.owns(run)) return;
                // No token, or ACR's 401: polling again cannot help (CHAOS-12104).
                const access = authorizationFailureOf(error);
                if (access !== undefined) {
                    this.settle(run, authorizationOutcome(access));
                    return;
                }
                // Polling again cannot help.
                if (readCannotHelp(error)) {
                    this.settle(run, { kind: "unavailable" });
                    return;
                }
                // A failed poll is not an answer: poll again until the deadline.
                logger.warn(
                    { err: error, submission_id: submissionId, request_id: requestId },
                    "ask-dev submission status read failed",
                );
                status = undefined;
            }
            if (!this.owns(run)) return;
            if (status === null) {
                // ACR holds no record. Before `accepted` the call may never have been admitted, so
                // the same key may be sent again; after it, the run is gone.
                logger.warn(
                    { submission_id: submissionId, request_id: requestId, accepted },
                    "ask-dev submission not found",
                );
                this.settle(
                    run,
                    accepted
                        ? lost
                        : { kind: "failed", retry: true, reference: this.reference(run) },
                );
                return;
            }
            if (status?.state === "done" && status.result_id !== undefined) {
                await this.replay(run, status.result_id, submissionId);
                return;
            }
            if (status?.state === "done_unsaved") {
                this.settle(run, { kind: "unsaved" });
                return;
            }
            if (status?.state === "abandoned") {
                // After a Stop the status cannot tell a cancel from a lost run (§5.4).
                this.settle(run, run.stop === "idle" ? lost : { kind: "halted" });
                return;
            }
            if (this.now() + STATUS_POLL_INTERVAL_MS > deadline) {
                logger.warn(
                    { submission_id: submissionId, request_id: requestId },
                    "ask-dev recovery reached the run deadline",
                );
                this.settle(run, { kind: "interrupted" });
                return;
            }
            try {
                await this.sleep(STATUS_POLL_INTERVAL_MS, signal);
            } catch {
                return;
            }
            if (!this.owns(run)) return;
        }
    }

    private async replay(run: ActiveRun, resultId: string, submissionId: string): Promise<void> {
        let result: TranscriptResult;
        try {
            result = await this.transport.readResult(resultId, run.controller.signal);
        } catch (error) {
            if (!this.owns(run)) return;
            const access = authorizationFailureOf(error);
            if (access !== undefined) {
                this.settle(run, authorizationOutcome(access));
                return;
            }
            logger.warn(
                { err: error, submission_id: submissionId, result_id: resultId },
                "ask-dev result replay failed",
            );
            if (readCannotHelp(error)) {
                // Reading the stored result again cannot help.
                this.settle(run, { kind: "unavailable" });
                return;
            }
            // The submission is done: the same key replays the stored result, it never runs again.
            this.settle(run, { kind: "failed", retry: true, reference: this.reference(run) });
            return;
        }
        if (!this.owns(run)) return;
        this.settle(run, { kind: "answered", result });
    }
}
