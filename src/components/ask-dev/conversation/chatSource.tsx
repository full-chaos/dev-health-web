"use client";

import { useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import {
    REFUSAL_COPY,
    type AnsweredOutcome,
    type AskIntent,
    type AssistantOutcome,
    type BatchItem,
    type ChatAssistantTurn,
    type ChatFeedbackEntry,
    type ChatFeedbackSource,
    type ChatHistorySnapshot,
    type ChatProgress,
    type ChatSnapshot,
    type ChatSource,
    type ChatStatus,
    type ChatTurn,
    type ChatUserTurn,
    type SubmittedSelections,
    type WorkbenchFailure,
} from "@full-chaos/ask-dev/render";

import type { PageEntityRef } from "@/lib/ask-dev/page-context";

import { isRefusalTurn, type TranscriptResult, type TranscriptTurn } from "../answer/AskDevTurn";
import { narrowingAxis, type RefusalEvent } from "../answer/refusalModel";
import { useTestModeTurns } from "../answer/testModeAnswer";
import { pageHintsOf, useAskDevPageProposal } from "../pageContext/AskDevPageContext";
import { ConnectAskDev } from "./AskDevConnect";
import {
    useAskDevConversation,
    useAskDevFeedbackStore,
    useAskDevNotSaved,
    useAskDevSessionPartition,
} from "./AskDevConversationContext";
import {
    IN_FLIGHT,
    type ConversationSnapshot,
    type ConversationStore,
    type StoreTurn,
    type SubmittedTurn,
    type TurnCarry,
    type TurnOutcome,
} from "./conversationStore";
import type { FeedbackEntry, FeedbackStore } from "./feedbackStore";

/**
 * Web's conversation behind ask-dev's seam (CHAOS-12383; `ChatSource` in `@full-chaos/ask-dev/render`).
 * One render of Ask Dev exists, in ask-dev; this file gives it web's store, and draws nothing itself.
 *
 * Web's rules stay on this side: consent (`slots.connect`), the partition and its clear, the 401
 * rule (a `connect` turn), page context, and the single run per thread. No token crosses the seam.
 *
 * A source holds per-store state and outlives a page: a batch goes on when the viewer minimizes to
 * the panel. So there is one per store (`chatSourceOf`), subscribed for the store's whole life.
 */

/** What only React knows: `useAskDevChatSource` feeds it. */
export type HostInputs = {
    readonly notSaved: boolean;
    /** The session's (org, principal) key, as `useAskDevSessionPartition` reads it. */
    readonly partition: string | null | undefined;
    readonly pageRefs: readonly PageEntityRef[];
    readonly removePageRef: (ref: PageEntityRef) => void;
};

export type HostChatSource = ChatSource & {
    readonly setHostInputs: (inputs: HostInputs) => void;
    /**
     * How many store turns have render-only state here. One conversation's at most: a selection
     * change clears it, so it cannot grow with a tab that stays open.
     */
    readonly retainedTurns: () => number;
};

const NO_REFS: readonly PageEntityRef[] = [];

const NO_HOST: Omit<HostInputs, "removePageRef"> = {
    notSaved: false,
    partition: undefined,
    pageRefs: NO_REFS,
};

/** The render's id of a store turn. The same ids web already sends on the wire (`toSourceTurns`). */
const userIdOf = (webId: number): number => webId * 2;
const assistantIdOf = (webId: number): number => webId * 2 + 1;
const webIdOf = (assistantId: number): number => (assistantId - 1) / 2;

const iso = (epochMs: number): string => new Date(epochMs).toISOString();

/** Every field of the request that carries a receipt. */
const RECEIPT_FIELDS = [
    "prior_subject_receipts",
    "prior_kind_receipts",
    "prior_anchor_receipts",
    "prior_handle_receipts",
    "prior_window_receipts",
    "prior_candidate_receipts",
] as const;

const carriesReceipts = ({ request }: SubmittedTurn): boolean =>
    RECEIPT_FIELDS.some((field) => (request[field]?.length ?? 0) > 0);

const count = (value: unknown): number | undefined =>
    typeof value === "number" && value >= 0 ? value : undefined;

/**
 * A budget refusal as the seam's failure (`isBudgetRefusal` names one by `upstreamCode`). ACR sends
 * tokens and numbers only; the render writes the words. `message` is required and the render words
 * a refusal itself, so it holds the same sentence ask-dev's client puts there.
 */
function refusalFailure(event: RefusalEvent): WorkbenchFailure {
    const { request_id: upstreamRequestId, error } = event.error;
    const details: Record<string, unknown> = error.details ?? {};
    const axis = narrowingAxis(event);
    const family = (details.narrower_continuation as { family?: unknown } | undefined)?.family;
    const overrun = details.overrun;
    return {
        code: "acr_rejected_request",
        message: REFUSAL_COPY.lead,
        upstreamCode: error.code,
        upstreamRequestId,
        retryable: error.retryable,
        ...(axis === null
            ? {}
            : {
                  narrowerContinuation: {
                      axis,
                      ...(typeof family === "string" ? { family } : {}),
                  },
              }),
        ...(typeof overrun === "string" ? { overrun } : {}),
        measuredItems: count(details.measured_items),
        maxItems: count(details.max_items),
        measuredBytes: count(details.measured_bytes),
        maxBytes: count(details.max_serialized_bytes),
        nothingLeftToCut: details.nothing_left_to_cut === true,
    };
}

/**
 * The result crosses the seam as it is: web holds the whole schema-valid ACR result at run time
 * (`asTranscriptResult` returns the same object), and its `Pick` type only names what web reads.
 */
const seamResult = (result: TranscriptResult): AnsweredOutcome["result"] =>
    result as unknown as AnsweredOutcome["result"];

const statusOutcome = (status: ChatStatus, retry = false): AssistantOutcome => ({
    kind: "status",
    status,
    retry,
});

/** A correlation code when there is one: the seam's field is optional, not `undefined`. */
const referenceOf = (reference: string | undefined): { reference?: string } =>
    reference === undefined ? {} : { reference };

/** The turn's place in a batch, when it has one. */
type BatchPlace = NonNullable<ChatProgress["batch"]>;

function pending(turn: StoreTurn, progress: ChatProgress, place?: BatchPlace): AssistantOutcome {
    return {
        kind: "pending",
        progress: {
            ...progress,
            ...(turn.stop === undefined ? {} : { stop: turn.stop }),
            ...(place === undefined ? {} : { batch: place }),
        },
    };
}

/**
 * One outcome of the store on the seam. Exhaustive: a kind added to `TurnOutcome` does not compile
 * until it is mapped. Every `IN_FLIGHT` kind is `pending`, or the composer would stay open.
 */
function outcomeOf(turn: StoreTurn, place?: BatchPlace): AssistantOutcome {
    const { outcome } = turn;
    switch (outcome.kind) {
        case "running":
            return pending(
                turn,
                {
                    phase: "running",
                    ...(outcome.stage === undefined ? {} : { stage: outcome.stage }),
                    stages: Object.entries(outcome.stages).map(([stage, state]) => ({
                        stage: stage as keyof typeof outcome.stages,
                        state,
                    })),
                    startedAt: iso(outcome.startedAt),
                },
                place,
            );
        case "recovering":
            return pending(turn, { phase: "recovering", startedAt: iso(outcome.startedAt) }, place);
        case "observing":
            return pending(turn, { phase: "observing", startedAt: iso(outcome.startedAt) }, place);
        case "restoring":
            return pending(turn, { phase: "restoring" }, place);
        case "canceling":
            return pending(
                turn,
                {
                    phase: turn.origin === "restored" ? "observing" : "running",
                    startedAt: iso(outcome.startedAt),
                    stop: "canceling",
                },
                place,
            );
        case "answered":
            return { kind: "answered", result: seamResult(outcome.result) };
        case "refused":
            return { kind: "failed", failure: refusalFailure(outcome.refusal) };
        case "failed":
            return statusOutcome(
                { kind: "failed", ...referenceOf(outcome.reference) },
                outcome.retry,
            );
        case "deadline":
            return statusOutcome({ kind: "deadline", which: outcome.deadline });
        case "limited":
            return statusOutcome(
                {
                    kind: "limited",
                    which: outcome.limit,
                    ...(outcome.retryAfterSeconds === undefined
                        ? {}
                        : { retryAfterSeconds: outcome.retryAfterSeconds }),
                },
                outcome.retry,
            );
        case "mismatch":
            return statusOutcome({ kind: "mismatch", ...referenceOf(outcome.reference) });
        case "not_run":
            return statusOutcome({ kind: "not_run", reason: outcome.reason }, outcome.retry);
        case "stopped":
            return statusOutcome({ kind: "stopped", reason: outcome.reason });
        case "unconfirmed":
            return statusOutcome({
                kind: "unconfirmed",
                ...(outcome.lastSeenRunningAt === undefined
                    ? {}
                    : { lastSeenRunningAt: iso(outcome.lastSeenRunningAt) }),
            });
        case "stream_unavailable":
        case "unsaved":
        case "abandoned":
        case "interrupted":
        case "stalled":
        case "canceled":
        case "thread_closed":
        case "connect":
        case "unavailable":
        case "restore_failed":
        case "halted":
            return statusOutcome({ kind: outcome.kind });
        default: {
            const unmapped: never = outcome;
            throw new Error(`unmapped turn outcome: ${JSON.stringify(unmapped)}`);
        }
    }
}

/** What the render knew when it asked, and the store has no field for. */
type TurnIntent = {
    readonly chosenSubject: ChatAssistantTurn["chosenSubject"];
    /** A chosen subject or a structure batch: not a plain ask, even with no receipt to show it. */
    readonly reAsk: boolean;
    readonly narrowingRoot: string | undefined;
};

/** One store turn as the render's pair. */
function chatTurnsOf(
    turn: StoreTurn,
    intent: TurnIntent | undefined,
    selections: SubmittedSelections | undefined,
    place: BatchPlace | undefined,
): readonly [ChatUserTurn, ChatAssistantTurn] {
    // A restored turn has no request: it is never sent again, so it offers no retry.
    const plain =
        turn.origin === "submitted" && !carriesReceipts(turn) && intent?.reAsk !== true
            ? turn.question
            : undefined;
    return [
        {
            role: "user",
            id: userIdOf(turn.id),
            question: turn.question,
            createdAt: turn.createdAt,
            showBubble: turn.origin === "restored" || plain !== undefined,
        },
        {
            role: "assistant",
            id: assistantIdOf(turn.id),
            createdAt: turn.createdAt,
            outcome: outcomeOf(turn, place),
            chosenSubject: intent?.chosenSubject,
            submittedStructureBatch: selections?.submittedStructureBatch,
            submittedCandidateReceiptIds: selections?.submittedCandidateReceiptIds,
            submittedStructureCandidateReceiptIds:
                selections?.submittedStructureCandidateReceiptIds,
            retryQuestion: plain,
            rootQuestion: plain === undefined ? undefined : (intent?.narrowingRoot ?? plain),
        },
    ];
}

/** An item of a batch that has not started. Its ids are negative: a store id never is. */
type QueuedItem = {
    readonly item: BatchItem;
    readonly position: number;
    readonly userId: number;
    readonly assistantId: number;
};

/**
 * A batch, run in sequence: ACR allows 2 running per principal (`acr:internal/contextfabric/
 * submission_limits.go`), and the store runs one at a time per thread.
 */
type Batch = {
    readonly question: string;
    readonly total: number;
    readonly createdAt: string;
    /**
     * What every item is asked as of: the turn being answered, and the page as it was. In sequence
     * an item must send what a parallel fan-out would: no trace of the items before it.
     */
    readonly asOfTurnId: number | undefined;
    readonly pageRefs: readonly PageEntityRef[];
    readonly queued: QueuedItem[];
    /** The item the store runs. `null` while the next one is being submitted. */
    running: { readonly turnId: number; readonly position: number } | null;
};

/**
 * The outcomes that end a batch before its last item: a run canceled with no Stop of this tab, or a
 * state in which the next item cannot be answered either. A plain failure does not. A Stop ends it
 * too, wherever it was pressed (the panel calls the store directly): `turn.stop` says so at once.
 */
const ENDS_BATCH = new Set<TurnOutcome["kind"]>(["canceled", "connect", "thread_closed"]);

/** A queued item, as the render's pair: so a batch never stalls silently. */
function queuedTurns(
    { item, position, userId, assistantId }: QueuedItem,
    { question, total, createdAt }: Batch,
): readonly [ChatUserTurn, ChatAssistantTurn] {
    return [
        { role: "user", id: userId, question, createdAt, showBubble: false },
        {
            role: "assistant",
            id: assistantId,
            createdAt,
            outcome: {
                kind: "pending",
                progress: { phase: "queued", batch: { position, total } },
            },
            chosenSubject: item.chosenSubject,
            submittedStructureBatch: undefined,
            submittedCandidateReceiptIds: undefined,
            submittedStructureCandidateReceiptIds: undefined,
            retryQuestion: undefined,
            rootQuestion: undefined,
        },
    ];
}

function historyOf(snapshot: ConversationSnapshot): ChatHistorySnapshot {
    const { history } = snapshot;
    return {
        status: history.status,
        rows: history.threads.map((thread) => ({
            id: thread.threadId,
            firstQuestion: thread.firstQuestion,
            lastTurnAt: thread.lastTurnAt,
            turnCount: thread.turnCount,
        })),
        currentId: snapshot.threadId,
        hasMore: history.nextCursor !== null,
        loadingMore: history.loadingMore,
        moreFailed: history.moreFailed,
        deleting: history.deleting,
        deleteFailed: history.deleteFailed,
        running: snapshot.inFlight,
    };
}

/** The result a set of receipts came from: the re-ask's parent. */
function parentOf(intent: Pick<AskIntent, "priorSubjectReceipts" | "structureBatch">) {
    const first = intent.priorSubjectReceipts?.[0] ?? Object.values(intent.structureBatch ?? {})[0];
    return first?.result_id;
}

const once = <T,>(value: T | undefined): readonly T[] | undefined =>
    value === undefined ? undefined : [value];

function carryOf(
    intent: Pick<AskIntent, "priorSubjectReceipts" | "structureBatch">,
    pageRefs: readonly PageEntityRef[],
): TurnCarry {
    const batch = intent.structureBatch;
    return {
        parentResultId: parentOf(intent),
        priorSubjectReceipts: intent.priorSubjectReceipts,
        pageHints: pageHintsOf(pageRefs),
        ...(batch === undefined
            ? {}
            : {
                  structureReceipts: {
                      priorKindReceipts: once(batch.expected_kind),
                      priorAnchorReceipts: once(batch.subject_anchor),
                      priorHandleReceipts: once(batch.subject_handle),
                      priorWindowReceipts: once(batch.window),
                      priorCandidateReceipts: once(batch.subject_candidate),
                  },
              }),
    };
}

/** Web's Connect link: the auth flow is the host's, and ask-dev cannot hold it. */
const connectSlot = () => <ConnectAskDev testId="ask-dev-connect" />;

export function createChatSource({
    store,
    feedback,
}: {
    readonly store: ConversationStore;
    readonly feedback: FeedbackStore;
}): HostChatSource {
    const listeners = new Set<() => void>();
    const feedbackListeners = new Set<() => void>();
    let host = NO_HOST;
    let removePageRef: HostInputs["removePageRef"] = () => undefined;
    let selection = store.getSnapshot().selection;
    /** By web turn id. Render-only, so it goes with the conversation. */
    const intents = new Map<number, TurnIntent>();
    const superseded = new Map<number, SubmittedSelections>();
    const waiters = new Set<{ turnId: number; settle: (answered: boolean) => void }>();
    let batch: Batch | null = null;
    /** Counts down: a queued item's ids stay put until it starts, and never meet a store id. */
    let nextQueuedId = -1;
    /** Bumped when anything the turns are built from changes, other than the store's turns. */
    let turnRevision = 0;
    /** One change in progress: listeners hear of it once, when it is whole. */
    let holding = false;
    let heldEmit = false;
    let built:
        | {
              readonly from: ConversationSnapshot;
              readonly host: Omit<HostInputs, "removePageRef">;
              readonly turnRevision: number;
              readonly snapshot: ChatSnapshot;
              /** The turns held another partition's: nothing may be reused from this build. */
              readonly foreign: boolean;
          }
        | undefined;

    function emit(): void {
        if (holding) {
            heldEmit = true;
            return;
        }
        for (const listener of [...listeners]) listener();
    }

    /** Runs `change` with the listeners held: they hear one update, with all of it. */
    function atOnce<T>(change: () => T): T {
        const nested = holding;
        holding = true;
        try {
            return change();
        } finally {
            holding = nested;
            if (!nested && heldEmit) {
                heldEmit = false;
                emit();
            }
        }
    }

    function buildTurns(from: ConversationSnapshot): readonly ChatTurn[] {
        const running = batch?.running;
        const total = batch?.total ?? 0;
        const turns = from.turns.flatMap((turn) =>
            chatTurnsOf(
                turn,
                intents.get(turn.id),
                superseded.get(turn.id),
                running?.turnId === turn.id ? { position: running.position, total } : undefined,
            ),
        );
        if (batch === null) return turns;
        const { queued } = batch;
        return [...turns, ...queued.flatMap((item) => queuedTurns(item, batch as Batch))];
    }

    function getSnapshot(): ChatSnapshot {
        const from = store.getSnapshot();
        if (
            built !== undefined &&
            built.from === from &&
            built.host === host &&
            built.turnRevision === turnRevision
        ) {
            return built.snapshot;
        }
        // On an org switch the session moves in this commit, and the provider rebinds the store
        // in an effect after paint. Until then these turns are another (org, principal)'s: the
        // render gets none of them, and a composer that cannot send. A session still loading
        // (`undefined`) is not a switch.
        const foreign = host.partition !== undefined && host.partition !== from.partition;
        if (foreign) {
            const snapshot: ChatSnapshot = {
                turns: [],
                stoppable: false,
                conversationKey: from.selection,
                composerLocked: true,
                notSaved: false,
                pageContext: NO_REFS,
            };
            built = { from, host, turnRevision, snapshot, foreign };
            return snapshot;
        }
        const sameTurns =
            built !== undefined &&
            !built.foreign &&
            built.from.turns === from.turns &&
            built.turnRevision === turnRevision;
        const snapshot: ChatSnapshot = {
            turns: sameTurns ? built!.snapshot.turns : buildTurns(from),
            stoppable: from.stoppable,
            conversationKey: from.selection,
            thread: from.thread,
            // The seam's two meanings: a `loaded` thread is reading an answer; a `new` one has no
            // viewer. The other kinds lock the composer by themselves (`composerLockOf`).
            composerLocked: !from.ready || (from.thread.kind === "loaded" && from.replaying),
            notSaved: host.notSaved,
            pageContext: host.pageRefs,
            ...(from.ready ? { history: historyOf(from) } : {}),
        };
        built = { from, host, turnRevision, snapshot, foreign };
        return snapshot;
    }

    function settleWaiters(from: ConversationSnapshot): void {
        for (const waiter of waiters) {
            const turn = from.turns.find((candidate) => candidate.id === waiter.turnId);
            if (turn !== undefined && IN_FLIGHT.has(turn.outcome.kind)) continue;
            waiters.delete(waiter);
            waiter.settle(turn?.outcome.kind === "answered");
        }
    }

    function dropBatch(): void {
        if (batch === null) return;
        batch = null;
        turnRevision += 1;
        emit();
    }

    /** Submits the first queued item. `false` when there is none, or `submit` refused it. */
    function startNext(current: Batch): boolean {
        const next = current.queued[0];
        if (next === undefined) return false;
        const carry = carryOf(next.item, current.pageRefs);
        if (!store.submit(current.question, { ...carry, asOfTurnId: current.asOfTurnId })) {
            return false;
        }
        current.queued.shift();
        const turnId = newestTurnId();
        recordIntent(turnId, next.item);
        current.running = { turnId, position: next.position };
        return true;
    }

    /**
     * The next item goes out in the update that ended the last one, re-entering `store.submit` from
     * the store's own listener: the run that ended has been released, and there is no tick in which
     * the composer, here or in the panel, could take a question.
     */
    function advanceBatch(from: ConversationSnapshot): void {
        const current = batch;
        const running = current?.running;
        if (current === null || running === null || running === undefined) return;
        const turn = from.turns.find((candidate) => candidate.id === running.turnId);
        if (turn === undefined || turn.stop !== undefined || ENDS_BATCH.has(turn.outcome.kind)) {
            dropBatch();
            return;
        }
        if (IN_FLIGHT.has(turn.outcome.kind)) return;
        current.running = null;
        if (!startNext(current)) dropBatch();
    }

    function onStoreChange(): void {
        atOnce(() => {
            const from = store.getSnapshot();
            if (from.selection !== selection) {
                selection = from.selection;
                intents.clear();
                superseded.clear();
            }
            settleWaiters(from);
            advanceBatch(from);
            emit();
        });
    }

    // For the store's life: a run goes on, and resolves its ask, with no page mounted.
    store.subscribe(onStoreChange);

    /** Resolves when the turn leaves `IN_FLIGHT`: `true` when it ended answered. */
    function whenSettled(turnId: number): Promise<boolean> {
        const settled = new Promise<boolean>((settle) => waiters.add({ turnId, settle }));
        settleWaiters(store.getSnapshot());
        return settled;
    }

    function recordIntent(turnId: number, intent: AskIntent): void {
        intents.set(turnId, {
            chosenSubject: intent.chosenSubject,
            reAsk: intent.chosenSubject !== undefined || intent.structureBatch !== undefined,
            narrowingRoot: intent.narrowingRoot,
        });
        turnRevision += 1;
    }

    function recordSupersedes(selections: SubmittedSelections | undefined): void {
        if (selections === undefined) return;
        superseded.set(webIdOf(selections.turnId), selections);
        turnRevision += 1;
    }

    /** The store's newest turn: the one a `submit` that returned `true` just added. */
    const newestTurnId = (): number => store.getSnapshot().turns.at(-1)!.id;

    function ask(question: string, intent: AskIntent = {}): Promise<boolean> {
        return atOnce(() => {
            if (!store.submit(question, carryOf(intent, host.pageRefs))) {
                return Promise.resolve(false);
            }
            const turnId = newestTurnId();
            recordIntent(turnId, intent);
            recordSupersedes(intent.supersedes);
            return whenSettled(turnId);
        });
    }

    function askBatch(
        items: readonly BatchItem[],
        question: string,
        supersedes?: SubmittedSelections,
    ): void {
        const current: Batch = {
            question,
            total: items.length,
            createdAt: new Date().toISOString(),
            asOfTurnId: store.getSnapshot().turns.at(-1)?.id,
            pageRefs: host.pageRefs,
            queued: items.map((item, index) => ({
                item,
                position: index + 1,
                userId: nextQueuedId--,
                assistantId: nextQueuedId--,
            })),
            running: null,
        };
        atOnce(() => {
            if (!startNext(current)) return;
            batch = current;
            recordSupersedes(supersedes);
        });
    }

    /** The same turn, under the same submission id. The store refuses all but a retryable one. */
    function retry(turnId: number): Promise<boolean> {
        const webId = webIdOf(turnId);
        return store.retry(webId) ? whenSettled(webId) : Promise.resolve(false);
    }

    function setHostInputs(next: HostInputs): void {
        removePageRef = next.removePageRef;
        const partitionChanged = next.partition !== host.partition;
        if (
            !partitionChanged &&
            next.notSaved === host.notSaved &&
            next.pageRefs === host.pageRefs
        ) {
            return;
        }
        host = next;
        emit();
        if (partitionChanged) {
            // The session left this store's partition: no further item goes out under the old one,
            // though the provider has not rebound the store yet.
            if (next.partition !== undefined && next.partition !== store.getSnapshot().partition) {
                dropBatch();
            }
            for (const listener of [...feedbackListeners]) listener();
        }
    }

    /** Built once per entry, so `entryFor` gives the same object until the entry changes. */
    const feedbackEntries = new WeakMap<FeedbackEntry, ChatFeedbackEntry>();
    function seamEntry(entry: FeedbackEntry): ChatFeedbackEntry {
        let built = feedbackEntries.get(entry);
        if (built === undefined) {
            const { state, desired, saving, notSaved } = entry;
            built = { state, desired, saving, notSaved };
            feedbackEntries.set(entry, built);
        }
        return built;
    }

    const feedbackSource: ChatFeedbackSource = {
        subscribe(listener) {
            feedbackListeners.add(listener);
            const off = feedback.subscribe(listener);
            return () => {
                feedbackListeners.delete(listener);
                off();
            };
        },
        isReady: () => feedback.boundTo(host.partition),
        entryFor(resultId) {
            const entry = feedback.entryFor(resultId, host.partition);
            return entry === undefined ? undefined : seamEntry(entry);
        },
        ensure: (resultId) => feedback.ensure(resultId),
        retryRead: (resultId) => {
            feedback.retryRead(resultId);
        },
        choose: (resultId, question, value) => {
            feedback.choose(resultId, question, value);
        },
    };

    return {
        subscribe(listener) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        getSnapshot,
        ask,
        askBatch,
        retry,
        stop: () => store.cancel(),
        reloadTurn(turnId) {
            store.reloadTurn(webIdOf(turnId));
        },
        newConversation: () => store.newConversation(),
        slots: { connect: connectSlot },
        history: {
            load() {
                store.loadHistory();
            },
            loadMore() {
                store.loadMoreHistory();
            },
            open(id) {
                store.selectThread(id, "local");
            },
            remove(id) {
                store.deleteThread(id);
            },
        },
        feedback: feedbackSource,
        pageContext: {
            remove(ref) {
                removePageRef(ref);
            },
        },
        reloadThread() {
            store.retryThreadRead();
        },
        loadEarlier() {
            store.loadEarlierTurns();
        },
        setHostInputs,
        retainedTurns: () => intents.size + superseded.size,
    };
}

const sources = new WeakMap<ConversationStore, HostChatSource>();

/** The one source of a store: it outlives the page that first asked for it. */
export function chatSourceOf(store: ConversationStore, feedback: FeedbackStore): HostChatSource {
    let source = sources.get(store);
    if (source === undefined) {
        source = createChatSource({ store, feedback });
        sources.set(store, source);
    }
    return source;
}

/** A fixed time: a test-mode turn has none of its own, and the render shows only the clock. */
const NO_TIME = "2026-01-01T00:00:00.000Z";

function readOnlyTurns(turn: TranscriptTurn, index: number): readonly ChatTurn[] {
    const refusal = isRefusalTurn(turn);
    const question = turn.question;
    return [
        {
            role: "user",
            id: userIdOf(index),
            question,
            createdAt: NO_TIME,
            showBubble: true,
        },
        {
            role: "assistant",
            id: assistantIdOf(index),
            createdAt: NO_TIME,
            outcome: refusal
                ? { kind: "failed", failure: refusalFailure(turn.refusal) }
                : { kind: "answered", result: seamResult(turn) },
            chosenSubject: undefined,
            submittedStructureBatch: undefined,
            submittedCandidateReceiptIds: undefined,
            submittedStructureCandidateReceiptIds: undefined,
            retryQuestion: undefined,
            rootQuestion: undefined,
        },
    ];
}

/**
 * The source with no transport: no store exists, so nothing can be sent and no composer is drawn.
 * Never "no source": the render would then build its own, and call ask-dev's standalone route.
 * In test mode it shows what `useTestModeTurns` read; a production build has no such turns.
 */
export function readOnlyChatSource(turns: readonly TranscriptTurn[]): ChatSource {
    const snapshot: ChatSnapshot = {
        turns: turns.flatMap(readOnlyTurns),
        stoppable: false,
        thread: { kind: "new" },
        composerHidden: true,
    };
    return {
        subscribe: () => () => undefined,
        getSnapshot: () => snapshot,
        ask: () => Promise.resolve(false),
        askBatch: () => undefined,
        retry: () => Promise.resolve(false),
        newConversation: () => undefined,
    };
}

const noSubscription = () => () => undefined;
const onClient = () => true;
const onServer = () => false;

/**
 * The render's source for this tab, or `null` until the page has hydrated: the server renders no
 * conversation, and hydration renders exactly that. React-only inputs reach the source before
 * paint, so a commit of an org switch never paints the old (org, principal)'s feedback.
 */
export function useAskDevChatSource(): ChatSource | null {
    const live = useAskDevConversation();
    const feedback = useAskDevFeedbackStore();
    const hydrated = useSyncExternalStore(noSubscription, onClient, onServer);
    const notSaved = useAskDevNotSaved();
    const partition = useAskDevSessionPartition();
    const { refs, remove } = useAskDevPageProposal();
    const { turns } = useTestModeTurns();
    const store = live?.store;
    const source =
        store === undefined || feedback === null ? undefined : chatSourceOf(store, feedback);
    const pageRefs = refs.length === 0 ? NO_REFS : refs;
    useLayoutEffect(() => {
        source?.setHostInputs({ notSaved, partition, pageRefs, removePageRef: remove });
    }, [source, notSaved, partition, pageRefs, remove]);
    const readOnly = useMemo(() => readOnlyChatSource(turns), [turns]);
    if (!hydrated) return null;
    return source ?? readOnly;
}
