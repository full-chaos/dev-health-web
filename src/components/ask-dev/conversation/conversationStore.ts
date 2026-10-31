import type {
    ACRErrorV1,
    ACRContextFabricInvestigationRequestV1 as InvestigationRequest,
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
    type StructureReceipts,
} from "@/lib/ask-dev/request-builder";
import { logger } from "@/lib/logger";

import type { TranscriptResult } from "../answer/AskDevTurn";
import type { ClarificationChoice } from "../answer/clarificationModel";
import type { RefusalEvent } from "../answer/refusalModel";
import { newSubmissionId, newThreadId } from "./keys";
import {
    TransportFailure,
    TransportRefusal,
    type AskDevTransport,
    type InvestigationEvent,
    type InvestigationStage,
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
 *
 * It holds no token, org id or scope; ACR authorizes every call (INV-1). Logs carry ids only, never
 * the question or the answer.
 */

/** §2.7.5: the status poll interval while recovering a dropped run. */
export const STATUS_POLL_INTERVAL_MS = 3_000;

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
    | { readonly kind: "stopped"; readonly reason: StoppedReason };

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

export type StoreTurn = {
    readonly id: number;
    readonly question: string;
    readonly createdAt: string;
    /** `X-ACR-Submission-ID` of this turn; a retry sends it again with `request`. */
    readonly submissionId: string;
    /** The exact request this turn sent. */
    readonly request: InvestigationRequest;
    /** The result id ACR reserved at admission (`accepted`), once seen. */
    readonly reservedResultId?: string | undefined;
    readonly outcome: TurnOutcome;
};

export type ConversationSnapshot = {
    /** Bumped by every clear; a run of an older generation can change nothing. */
    readonly generation: number;
    /** This conversation's `thread_id`; `null` until the first submit. */
    readonly threadId: string | null;
    readonly turns: readonly StoreTurn[];
    /** A run of this thread is running or recovering. */
    readonly inFlight: boolean;
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
    readonly structureReceipts?: StructureReceipts | undefined;
};

/**
 * A clarification choice as a follow-up's carry: its parent result and the receipts it picked, each
 * already bound to that result (`buildChoice`, INV-1).
 */
export function carryOfChoice(choice: ClarificationChoice): TurnCarry {
    const { receipts } = choice;
    return {
        parentResultId: choice.parentResultId,
        structureReceipts: {
            priorKindReceipts: receipts.prior_kind_receipts,
            priorAnchorReceipts: receipts.prior_anchor_receipts,
            priorHandleReceipts: receipts.prior_handle_receipts,
            priorWindowReceipts: receipts.prior_window_receipts,
            priorCandidateReceipts: receipts.prior_candidate_receipts,
        },
    };
}

export type ConversationStoreOptions = {
    readonly transport: AskDevTransport;
    /** `W` of the run's absolute deadline `D = submit + W` (plan §2.7.6). */
    readonly runTimeoutMs?: number;
    readonly now?: () => number;
    /** Waits `ms`, or rejects when `signal` aborts. Injected so a test can drive the polling. */
    readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
    readonly uuid?: () => string;
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

const IN_FLIGHT = new Set<TurnOutcome["kind"]>(["running", "recovering"]);

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

/** The builders' timeline shape: a user turn, then its assistant turn (ids 2n and 2n + 1). */
function toSourceTurns(turns: readonly StoreTurn[]): ConversationSourceTurn[] {
    return turns.flatMap((turn): ConversationSourceTurn[] => [
        { role: "user", id: turn.id * 2, question: turn.question, createdAt: turn.createdAt },
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

type ActiveRun = {
    readonly turnId: number;
    readonly controller: AbortController;
    /** When the run began (epoch ms): the panel's elapsed time counts from it. */
    readonly startedAt: number;
    /** Fires at the run's deadline D (plan §2.7.6 "abort at D"), whatever the run is waiting on. */
    timer: ReturnType<typeof setTimeout> | undefined;
};

export class ConversationStore {
    private readonly transport: AskDevTransport;
    private readonly runTimeoutMs: number;
    private readonly now: () => number;
    private readonly sleep: (ms: number, signal: AbortSignal) => Promise<void>;
    private readonly uuid: () => string;
    private readonly listeners = new Set<() => void>();
    private partition: string | null | undefined = undefined;
    private active: ActiveRun | null = null;
    private nextTurnId = 0;
    /** The first turn of the current thread; earlier turns stay on screen but are not threaded. */
    private threadStart = 0;
    private snapshot: ConversationSnapshot = {
        generation: 0,
        threadId: null,
        turns: [],
        inFlight: false,
        ready: false,
        partition: null,
    };

    constructor(options: ConversationStoreOptions) {
        this.transport = options.transport;
        this.runTimeoutMs = options.runTimeoutMs ?? RUN_TIMEOUT_DEFAULT_MS;
        this.now = options.now ?? Date.now;
        this.sleep = options.sleep ?? abortableSleep;
        this.uuid = options.uuid ?? (() => crypto.randomUUID());
    }

    readonly subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    readonly getSnapshot = (): ConversationSnapshot => this.snapshot;

    /**
     * Binds the store to one (org, principal) key, or to none (`null`: signed out). Another key
     * than the bound one clears the conversation; the first bind clears nothing.
     */
    setPartition(key: string | null): void {
        if (this.partition !== undefined && key !== this.partition) this.clear("partition_changed");
        this.partition = key;
        this.commit({ ...this.snapshot, ready: key !== null, partition: key });
    }

    /**
     * Aborts the run, drops every turn and the thread, and bumps the generation. A late event of
     * the run it aborted changes nothing.
     */
    clear(reason: "partition_changed" | "unmounted"): void {
        const aborted = this.active;
        if (aborted !== null) this.release(aborted);
        aborted?.controller.abort();
        const generation = this.snapshot.generation + 1;
        logger.info(
            { generation, reason, run_aborted: aborted !== null },
            "ask-dev conversation cleared",
        );
        this.commit({ ...this.snapshot, generation, threadId: null, turns: [], inFlight: false });
    }

    /**
     * Sends a new question as a new turn with a new `submission_id`. Refused (`false`, nothing
     * sent) when it is blank, while signed out, or while a run of this thread is in flight.
     */
    submit(question: string, carry?: TurnCarry): boolean {
        const trimmed = question.trim();
        if (nonBlank(trimmed) === undefined || !this.snapshot.ready || this.snapshot.inFlight) {
            return false;
        }
        const threadId = this.snapshot.threadId ?? newThreadId(this.uuid());
        // Only the current thread's turns: a closed conversation's turns carry nothing forward.
        const prior = toSourceTurns(
            this.snapshot.turns.filter((turn) => turn.id >= this.threadStart),
        );
        const parent = deriveParentReference(prior);
        const request = buildInvestigationRequest({
            question: trimmed,
            requestId: newRequestId(this.uuid()),
            conversation: buildConversationTurns(prior),
            parentResultId: carry?.parentResultId ?? parent.parentResultId,
            subjectHints: parent.subjectHints,
            structureReceipts: carry?.structureReceipts,
        });
        const turn: StoreTurn = {
            id: this.nextTurnId++,
            question: trimmed,
            createdAt: new Date(this.now()).toISOString(),
            submissionId: newSubmissionId(this.uuid()),
            request,
            outcome: this.running(),
        };
        this.commit({
            ...this.snapshot,
            threadId,
            turns: [...this.snapshot.turns, turn],
            inFlight: true,
        });
        void this.run(turn.id);
        return true;
    }

    /**
     * Sends the last turn's request again under its own `submission_id` (INV-2: the only reuse of a
     * key). Only for a `failed` or `limited` turn that allows it (nothing was admitted, or the
     * answer is stored), and only when no run is in flight.
     */
    retry(turnId: number): boolean {
        const last = this.snapshot.turns[this.snapshot.turns.length - 1];
        if (last?.id !== turnId || this.snapshot.inFlight || !this.snapshot.ready) return false;
        const { outcome } = last;
        if (
            (outcome.kind !== "failed" &&
                outcome.kind !== "limited" &&
                outcome.kind !== "not_run") ||
            !outcome.retry
        ) {
            return false;
        }
        this.setOutcome(turnId, this.running(), true);
        void this.run(turnId);
        return true;
    }

    /** Stops the run in flight (a disconnect is ACR's only cancel). A finished answer is kept. */
    cancel(): void {
        const active = this.active;
        if (active === null) return;
        this.release(active);
        const turn = this.turn(active.turnId);
        logger.info(
            {
                submission_id: turn?.submissionId,
                request_id: turn?.request.request_id,
                t_req: new Date(this.now()).toISOString(),
            },
            "ask-dev run canceled",
        );
        active.controller.abort();
        this.setOutcome(active.turnId, { kind: "canceled" }, false);
    }

    /** A run that just began: no stage yet, and the elapsed time counts from now. */
    private running(): TurnOutcome {
        return { kind: "running", startedAt: this.now(), stages: {} };
    }

    private commit(next: ConversationSnapshot): void {
        this.snapshot = next;
        for (const listener of this.listeners) listener();
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
        return this.active === run;
    }

    /** Lets the run go: nothing it still delivers changes the store after this. */
    private release(run: ActiveRun): void {
        if (this.active === run) this.active = null;
        clearTimeout(run.timer);
    }

    /**
     * The run reached its deadline D in any phase (streaming, recovering or replaying): it ends as
     * interrupted, and the thread is free. A transport call that never answers cannot hold it.
     */
    private expire(run: ActiveRun): void {
        if (!this.owns(run)) return;
        const turn = this.turn(run.turnId);
        logger.warn(
            {
                submission_id: turn?.submissionId,
                request_id: turn?.request.request_id,
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
        this.threadStart = this.nextTurnId;
        this.settle(run, { kind: "thread_closed" });
        this.commit({ ...this.snapshot, threadId: null });
    }

    private settle(run: ActiveRun, outcome: TurnOutcome): void {
        this.release(run);
        this.setOutcome(run.turnId, outcome, false);
    }

    private async run(turnId: number): Promise<void> {
        const turn = this.turn(turnId);
        const threadId = this.snapshot.threadId;
        if (turn === undefined || threadId === null) return;
        const startedAt = turn.outcome.kind === "running" ? turn.outcome.startedAt : this.now();
        const run: ActiveRun = {
            turnId,
            controller: new AbortController(),
            startedAt,
            timer: undefined,
        };
        this.active = run;
        const deadline = this.now() + this.runTimeoutMs;
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
                // A late event of a run the store gave up (cleared, canceled) is dropped.
                if (!this.owns(run)) return;
                if (event.type === "accepted") accepted = true;
                if (this.apply(run, event)) return;
            }
        } catch (error) {
            if (!this.owns(run)) return;
            if (error instanceof TransportRefusal) {
                await this.refused(run, deadline, error);
                return;
            }
            if (error instanceof TransportFailure) {
                this.transportFailed(run, error.reason);
                return;
            }
            logger.warn(
                { err: error, submission_id: submissionId, request_id: requestId },
                "ask-dev stream dropped",
            );
        }
        if (!this.owns(run)) return;
        logger.warn(
            { submission_id: submissionId, request_id: requestId, accepted },
            "ask-dev stream ended without a terminal; recovering",
        );
        await this.recover(run, deadline, accepted);
    }

    /** Applies one event; `true` when it was the terminal. */
    private apply(run: ActiveRun, event: InvestigationEvent): boolean {
        switch (event.type) {
            case "accepted":
                this.update(
                    run.turnId,
                    (turn) => ({ ...turn, reservedResultId: event.reserved_result_id }),
                    true,
                );
                return false;
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
                        request_id: turn?.request.request_id,
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
                const reason = notRunReasonOf(code);
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
            { submission_id: turn?.submissionId, request_id: turn?.request.request_id, reason },
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
        }
    }

    /**
     * The correlation code a failed turn shows: ACR's `request_id` from its `error.v1`, when it is a
     * plain id, else the `request_id` this turn sent. Never free text.
     */
    private reference(run: ActiveRun, error?: ACRErrorV1): string | undefined {
        if (error !== undefined && REFERENCE_PATTERN.test(error.request_id))
            return error.request_id;
        const own = this.turn(run.turnId)?.request.request_id;
        return own !== undefined && REFERENCE_PATTERN.test(own) ? own : undefined;
    }

    /**
     * §2.7.5 recovery: polls the submission status every 3 s until the deadline. Each poll is a
     * fresh call that ACR authorizes again. `done` replays the FINAL `result_id` (a reused answer
     * keeps its own id, which is not the reserved one).
     */
    private async recover(run: ActiveRun, deadline: number, accepted: boolean): Promise<void> {
        const turn = this.turn(run.turnId);
        if (turn === undefined) return;
        const submissionId = turn.submissionId;
        const requestId = turn.request.request_id;
        const signal = run.controller.signal;
        this.setOutcome(run.turnId, { kind: "recovering", startedAt: run.startedAt }, true);
        for (;;) {
            let status;
            try {
                status = await this.transport.submissionStatus(submissionId, signal);
            } catch (error) {
                if (!this.owns(run)) return;
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
                        ? { kind: "interrupted" }
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
                this.settle(run, { kind: "interrupted" });
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
            logger.warn(
                { err: error, submission_id: submissionId, result_id: resultId },
                "ask-dev result replay failed",
            );
            // The submission is done: the same key replays the stored result, it never runs again.
            this.settle(run, { kind: "failed", retry: true, reference: this.reference(run) });
            return;
        }
        if (!this.owns(run)) return;
        this.settle(run, { kind: "answered", result });
    }
}
