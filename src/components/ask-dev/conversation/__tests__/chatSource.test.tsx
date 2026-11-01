import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import {
    isBudgetRefusal,
    type AssistantOutcome,
    type ChatAssistantTurn,
    type ChatContextRef,
    type ChatSource,
    type ChatStatus,
    type ChatTurn,
    type ChatUserTurn,
    type InvestigationStage as SeamStage,
    type NotRunReason as SeamNotRunReason,
    type StoppedReason as SeamStoppedReason,
} from "@full-chaos/ask-dev/render";

import type { PageEntityRef } from "@/lib/ask-dev/page-context";

import { createChatSource, readOnlyChatSource, type HostInputs } from "../chatSource";
import {
    ConversationStore,
    IN_FLIGHT,
    type ConversationStoreOptions,
    type NotRunReason,
    type StoppedReason,
    type TurnOutcome,
} from "../conversationStore";
import { FeedbackStore } from "../feedbackStore";
import { TransportFailure, TransportRefusal } from "../transport";
import type { InvestigationEvent, InvestigationStage } from "../transport";
import {
    accepted,
    acrError,
    captureResult,
    deferred,
    errorEvent,
    FakeTransport,
    resultEvent,
    stageEvent,
    status,
    summary,
    threadTurn,
    threadView,
} from "./fakeTransport";

/**
 * CHAOS-12383: web's store behind ask-dev's seam. Every test here runs the real
 * `ConversationStore` over `FakeTransport`, with real captured results.
 */

const PARTIAL = captureResult("kiac_project_status_partial.event.json");
const CLARIFICATION = captureResult("kiac_project_status_clarification.event.json");
const ORG_A = "org-a\u0000user-1\u0000";
const ORG_B = "org-b\u0000user-1\u0000";
const THREAD_A = "thread_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const THREAD_B = "thread_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SUB = "sub_00000000000000000000000000000001";
const START = Date.parse("2026-10-31T12:00:00Z");
const START_ISO = "2026-10-31T12:00:00.000Z";
const QUESTION = "Which projects are at risk?";
const CAPTURES = join(process.cwd(), "tests/fixtures/ask-dev/captures");

let transport: FakeTransport;
let clock: number;

function makeStore(
    options: Partial<ConversationStoreOptions> = {},
    partition: string | null = ORG_A,
): ConversationStore {
    let n = 0;
    const store = new ConversationStore({
        transport,
        hints: { read: () => null, write: () => undefined, clear: () => undefined },
        now: () => clock,
        sleep: async (ms) => {
            clock += ms;
        },
        uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
        ...options,
    });
    store.setPartition(partition);
    return store;
}

function makeSource(options: Partial<ConversationStoreOptions> = {}) {
    const store = makeStore(options);
    const feedback = new FeedbackStore({ transport });
    feedback.setPartition(ORG_A);
    const source = createChatSource({ store, feedback });
    return { store, feedback, source };
}

const settled = (store: ConversationStore) =>
    vi.waitFor(() => expect(store.getSnapshot().inFlight).toBe(false));
const last = (store: ConversationStore) => store.getSnapshot().turns.at(-1)!;
const assistants = (source: ChatSource) =>
    source
        .getSnapshot()
        .turns.filter((turn): turn is ChatAssistantTurn => turn.role === "assistant");
const users = (source: ChatSource) =>
    source.getSnapshot().turns.filter((turn): turn is ChatUserTurn => turn.role === "user");
const latest = (source: ChatSource): ChatAssistantTurn => assistants(source).at(-1)!;

const NO_REFS: HostInputs["pageRefs"] = [];
const noRemoval = () => undefined;
const host = (patch: Partial<HostInputs> = {}): HostInputs => ({
    notSaved: false,
    partition: ORG_A,
    pageRefs: NO_REFS,
    removePageRef: noRemoval,
    ...patch,
});

beforeEach(() => {
    transport = new FakeTransport();
    clock = START;
    vi.clearAllMocks();
});

/** The real captured budget refusals (the ACR encoder's own bytes). */
function capturedRefusal(file: string): InvestigationEvent {
    return JSON.parse(readFileSync(join(CAPTURES, file), "utf8")) as InvestigationEvent;
}

/** One outcome: how the real store reaches it, and what the seam must then say. */
type Case = {
    readonly drive: (store: ConversationStore) => Promise<void> | void;
    readonly expected: AssistantOutcome;
    /** The turn's seam fields beyond the outcome, when they matter. */
    readonly origin?: "restored";
};

const kindOf = (store: ConversationStore) => last(store).outcome.kind;
const reaches = (store: ConversationStore, kind: TurnOutcome["kind"]) =>
    vi.waitFor(() => expect(kindOf(store)).toBe(kind), { timeout: 5_000 });

/** A submit whose stream refuses before it opens. */
const refusedWith = (error: unknown, kind: TurnOutcome["kind"]) => async (s: ConversationStore) => {
    transport.scripts.push([{ fail: error }]);
    s.submit(QUESTION);
    await reaches(s, kind);
};

/** A submit whose stream ends with one terminal error code. */
const terminal = (code: string, kind: TurnOutcome["kind"]) => async (s: ConversationStore) => {
    transport.scripts.push([accepted(), errorEvent(code)]);
    s.submit(QUESTION);
    await reaches(s, kind);
};

/** Opens a thread of one restored turn. */
const restored = (turn: ReturnType<typeof threadTurn>) => (s: ConversationStore) => {
    transport.threads.set(THREAD_A, threadView(THREAD_A, [turn]));
    s.selectThread(THREAD_A, "local");
};

const LIMIT_429 = new TransportRefusal(
    429,
    {
        ...acrError("concurrency_limited", 429, true),
        error: {
            ...acrError("concurrency_limited", 429, true).error,
            details: { limit: "principal" },
        },
    },
    3,
);

const DEADLINE_504: InvestigationEvent = {
    ...errorEvent("upstream_unavailable"),
    type: "error",
    reserved_result_id: "result_reserved_0001",
    error: {
        ...acrError("upstream_unavailable", 504, false),
        error: {
            ...acrError("upstream_unavailable", 504, false).error,
            details: { deadline: "model" },
        },
    },
} as InvestigationEvent;

/**
 * `Record` over the store's own union: a kind added to `TurnOutcome` without a case here does not
 * compile. This is the pin that every kind is mapped.
 */
const CASES: Record<TurnOutcome["kind"], Case> = {
    running: {
        drive: async (s) => {
            const gate = deferred();
            transport.scripts.push([
                accepted(),
                stageEvent("interpreting", "started", 100),
                stageEvent("interpreting", "completed", 200),
                stageEvent("reading_facts", "started", 300),
                { wait: gate.promise },
            ]);
            s.submit(QUESTION);
            await vi.waitFor(() => {
                const { outcome } = last(s);
                expect(outcome.kind === "running" && outcome.stage).toBe("reading_facts");
            });
        },
        expected: {
            kind: "pending",
            progress: {
                phase: "running",
                stage: "reading_facts",
                stages: [
                    { stage: "interpreting", state: "completed" },
                    { stage: "reading_facts", state: "started" },
                ],
                startedAt: START_ISO,
            },
        },
    },
    recovering: {
        drive: async (s) => {
            transport.statusHangs = true;
            transport.scripts.push([]);
            s.submit(QUESTION);
            await reaches(s, "recovering");
        },
        expected: { kind: "pending", progress: { phase: "recovering", startedAt: START_ISO } },
    },
    observing: {
        drive: async (s) => {
            transport.statusHangs = true;
            restored(threadTurn(SUB, "running", { at: "2026-10-31T11:59:00Z" }))(s);
            await reaches(s, "observing");
        },
        expected: {
            kind: "pending",
            progress: { phase: "observing", startedAt: "2026-10-31T11:59:00.000Z" },
        },
    },
    restoring: {
        drive: async (s) => {
            transport.readHangs = true;
            restored(threadTurn(SUB, "done", { resultId: PARTIAL.result_id }))(s);
            await reaches(s, "restoring");
        },
        expected: { kind: "pending", progress: { phase: "restoring" } },
    },
    canceling: {
        drive: async (s) => {
            transport.cancelAnswers.push({ kind: "running" });
            transport.scripts.push([accepted(), { wait: new Promise(() => undefined) }]);
            s.submit(QUESTION);
            await vi.waitFor(() => expect(last(s).reservedResultId).toBeDefined());
            s.cancel();
            await reaches(s, "canceling");
        },
        expected: {
            kind: "pending",
            progress: { phase: "running", startedAt: START_ISO, stop: "canceling" },
        },
    },
    answered: {
        drive: async (s) => {
            transport.scripts.push([accepted(), resultEvent(PARTIAL)]);
            s.submit(QUESTION);
            await reaches(s, "answered");
        },
        expected: { kind: "answered", result: PARTIAL as never },
    },
    refused: {
        drive: async (s) => {
            transport.scripts.push([
                accepted(),
                capturedRefusal("acr_encoder_budget_refusal_evidence_window.event.json"),
            ]);
            s.submit(QUESTION);
            await reaches(s, "refused");
        },
        expected: {
            kind: "failed",
            failure: expect.objectContaining({ upstreamCode: "budget_refusal" }) as never,
        },
    },
    failed: {
        drive: terminal("internal_error", "failed"),
        expected: {
            kind: "status",
            status: { kind: "failed", reference: "req_test" },
            retry: false,
        },
    },
    deadline: {
        drive: async (s) => {
            transport.scripts.push([accepted(), DEADLINE_504]);
            s.submit(QUESTION);
            await reaches(s, "deadline");
        },
        expected: { kind: "status", status: { kind: "deadline", which: "model" }, retry: false },
    },
    limited: {
        drive: refusedWith(LIMIT_429, "limited"),
        expected: {
            kind: "status",
            status: { kind: "limited", which: "principal", retryAfterSeconds: 3 },
            retry: true,
        },
    },
    stream_unavailable: {
        drive: refusedWith(
            new TransportRefusal(406, acrError("stream_unavailable", 406, false)),
            "stream_unavailable",
        ),
        expected: { kind: "status", status: { kind: "stream_unavailable" }, retry: false },
    },
    mismatch: {
        drive: refusedWith(
            new TransportRefusal(409, acrError("submission_mismatch", 409, false)),
            "mismatch",
        ),
        expected: {
            kind: "status",
            status: { kind: "mismatch", reference: "req_test" },
            retry: false,
        },
    },
    unsaved: {
        drive: terminal("submission_unsaved", "unsaved"),
        expected: { kind: "status", status: { kind: "unsaved" }, retry: false },
    },
    abandoned: {
        drive: refusedWith(
            new TransportRefusal(409, acrError("submission_abandoned", 409, false)),
            "abandoned",
        ),
        expected: { kind: "status", status: { kind: "abandoned" }, retry: false },
    },
    interrupted: {
        drive: terminal("run_lost", "interrupted"),
        expected: { kind: "status", status: { kind: "interrupted" }, retry: false },
    },
    stalled: {
        drive: refusedWith(new TransportFailure("stalled"), "stalled"),
        expected: { kind: "status", status: { kind: "stalled" }, retry: false },
    },
    canceled: {
        drive: terminal("canceled", "canceled"),
        expected: { kind: "status", status: { kind: "canceled" }, retry: false },
    },
    thread_closed: {
        drive: terminal("thread_closed", "thread_closed"),
        expected: { kind: "status", status: { kind: "thread_closed" }, retry: false },
    },
    not_run: {
        drive: refusedWith(
            new TransportRefusal(429, acrError("rate_limited", 429, true)),
            "not_run",
        ),
        expected: {
            kind: "status",
            status: { kind: "not_run", reason: "rate_limited" },
            retry: true,
        },
    },
    stopped: {
        drive: terminal("interpretation_rejected", "stopped"),
        expected: {
            kind: "status",
            status: { kind: "stopped", reason: "interpretation_rejected" },
            retry: false,
        },
    },
    authorization_failed: {
        drive: refusedWith(new TransportFailure("authorization_failed"), "authorization_failed"),
        expected: { kind: "status", status: { kind: "failed" }, retry: true },
    },
    unavailable: {
        drive: async (s) => {
            restored(threadTurn(SUB, "done", { resultId: null as never }))(s);
            await reaches(s, "unavailable");
        },
        expected: { kind: "status", status: { kind: "unavailable" }, retry: false },
    },
    restore_failed: {
        drive: async (s) => {
            transport.readErrors.set(PARTIAL.result_id, new Error("offline"));
            restored(threadTurn(SUB, "done", { resultId: PARTIAL.result_id }))(s);
            await reaches(s, "restore_failed");
        },
        expected: { kind: "status", status: { kind: "restore_failed" }, retry: false },
    },
    unconfirmed: {
        drive: async (s) => {
            transport.statuses.push(status("running"), new Error("network"));
            restored(threadTurn(SUB, "running", { at: START_ISO }))(s);
            await reaches(s, "unconfirmed");
        },
        expected: {
            kind: "status",
            status: { kind: "unconfirmed", lastSeenRunningAt: START_ISO },
            retry: false,
        },
    },
    halted: {
        drive: async (s) => {
            transport.cancelAnswers.push({ kind: "final" });
            transport.statuses.push(status("abandoned"));
            transport.scripts.push([accepted(), { wait: new Promise(() => undefined) }]);
            s.submit(QUESTION);
            await vi.waitFor(() => expect(last(s).reservedResultId).toBeDefined());
            s.cancel();
            await reaches(s, "halted");
        },
        expected: { kind: "status", status: { kind: "halted" }, retry: false },
    },
};

describe("every TurnOutcome kind maps onto the seam (the real store reaches each one)", () => {
    it("names 25 kinds", () => {
        expect(Object.keys(CASES)).toHaveLength(25);
    });

    it.each(Object.entries(CASES))("%s", async (_, { drive, expected }) => {
        const { store, source } = makeSource();
        await drive(store);
        expect(latest(source).outcome).toEqual(expected);
    });

    it("every IN_FLIGHT kind is pending, or the composer would stay open", () => {
        for (const kind of IN_FLIGHT) expect(CASES[kind].expected.kind).toBe("pending");
    });

    it("a Stop that is out or was refused says so on a running turn", async () => {
        const { store, source } = makeSource();
        const gate = deferred();
        transport.cancelGate = gate.promise;
        transport.cancelAnswers.push({ kind: "not_leased" });
        transport.statusHangs = true;
        restored(threadTurn(SUB, "running", { at: START_ISO }))(store);
        await reaches(store, "observing");
        store.cancel();
        await vi.waitFor(() => expect(last(store).stop).toBe("requested"));
        expect(latest(source).outcome).toMatchObject({ progress: { stop: "requested" } });
        gate.resolve();
        await vi.waitFor(() => expect(last(store).stop).toBe("not_leased"));
        expect(latest(source).outcome).toMatchObject({ progress: { stop: "not_leased" } });
    });

    it("a restored turn that is canceling reads as observing", async () => {
        const { store, source } = makeSource();
        transport.cancelAnswers.push({ kind: "running" });
        transport.statusHangs = true;
        restored(threadTurn(SUB, "running", { at: START_ISO }))(store);
        await reaches(store, "observing");
        store.cancel();
        await reaches(store, "canceling");
        expect(latest(source).outcome).toEqual({
            kind: "pending",
            progress: { phase: "observing", startedAt: START_ISO, stop: "canceling" },
        });
    });

    it("an unconfirmed turn that was never seen running names no time", async () => {
        const { store, source } = makeSource();
        transport.statuses.push(new Error("network"));
        restored(threadTurn(SUB, "running", { at: START_ISO }))(store);
        await reaches(store, "unconfirmed");
        expect(latest(source).outcome).toEqual({
            kind: "status",
            status: { kind: "unconfirmed" },
            retry: false,
        });
    });
});

// Compile-time pins against the seam: `pnpm typecheck` fails when either side moves.
type Same<A, B> =
    (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type WebStatusKinds = Exclude<
    TurnOutcome["kind"],
    | "running"
    | "recovering"
    | "observing"
    | "restoring"
    | "canceling"
    | "answered"
    | "refused"
    // CHAOS-12474: drawn with the render's own kinds, and `connect` is never sent.
    | "authorization_failed"
>;
const STATUS_KINDS_MATCH: Same<WebStatusKinds, Exclude<ChatStatus["kind"], "connect">> = true;
const NOT_RUN_MATCH: Same<NotRunReason, SeamNotRunReason> = true;
const STOPPED_MATCH: Same<StoppedReason, SeamStoppedReason> = true;
const STAGES_MATCH: Same<InvestigationStage, SeamStage> = true;
const SCOPE_KINDS_MATCH: Same<PageEntityRef["kind"], ChatContextRef["kind"]> = true;
const SOURCE_IS_THE_SEAM: ReturnType<typeof createChatSource> extends ChatSource ? true : false =
    true;

describe("the type pins are real", () => {
    it("holds", () => {
        expect([
            STATUS_KINDS_MATCH,
            NOT_RUN_MATCH,
            STOPPED_MATCH,
            STAGES_MATCH,
            SCOPE_KINDS_MATCH,
            SOURCE_IS_THE_SEAM,
        ]).toEqual([true, true, true, true, true, true]);
    });
});

describe("a budget refusal, from the encoder's real bytes", () => {
    it.each([
        [
            "acr_encoder_budget_refusal_evidence_window.event.json",
            {
                axis: "evidence_window",
                overrun: "bytes",
                measuredBytes: 301877,
                maxBytes: 262144,
            },
        ],
        [
            "acr_encoder_budget_refusal_result_count.event.json",
            { axis: "result_count", overrun: "items", measuredItems: 41, maxItems: 30 },
        ],
    ])("%s", async (file, { axis, ...numbers }) => {
        const { store, source } = makeSource();
        const event = capturedRefusal(file) as Extract<InvestigationEvent, { type: "error" }>;
        const details = event.error.error.details as { narrower_continuation: { family: string } };
        transport.scripts.push([accepted(), event]);
        store.submit(QUESTION);
        await reaches(store, "refused");

        const { outcome } = latest(source);
        if (outcome.kind !== "failed") throw new Error("not a refusal");
        expect(isBudgetRefusal(outcome.failure)).toBe(true);
        expect(outcome.failure).toMatchObject({
            upstreamCode: "budget_refusal",
            upstreamRequestId: event.error.request_id,
            retryable: false,
            narrowerContinuation: { axis, family: details.narrower_continuation.family },
            ...numbers,
        });
        expect(typeof outcome.failure.message).toBe("string");
        expect(latest(source).retryQuestion).toBe(QUESTION);
        expect(latest(source).rootQuestion).toBe(QUESTION);
    });

    it("a count outside the contract reads as absent", async () => {
        const { store, source } = makeSource();
        const event = capturedRefusal(
            "acr_encoder_budget_refusal_result_count.event.json",
        ) as Extract<InvestigationEvent, { type: "error" }>;
        transport.scripts.push([
            accepted(),
            {
                ...event,
                error: {
                    ...event.error,
                    error: {
                        ...event.error.error,
                        details: {
                            ...event.error.error.details,
                            measured_items: -1,
                            max_items: "30",
                        },
                    },
                },
            } as InvestigationEvent,
        ]);
        store.submit(QUESTION);
        await reaches(store, "refused");
        const { outcome } = latest(source);
        if (outcome.kind !== "failed") throw new Error("not a refusal");
        expect(outcome.failure.measuredItems).toBeUndefined();
        expect(outcome.failure.maxItems).toBeUndefined();
    });

    it("no axis named: no continuation, and nothing narrower is claimed", async () => {
        const { store, source } = makeSource();
        transport.scripts.push([
            accepted(),
            capturedRefusal("acr_encoder_budget_refusal_none.event.json"),
        ]);
        store.submit(QUESTION);
        await reaches(store, "refused");
        const { outcome } = latest(source);
        if (outcome.kind !== "failed") throw new Error("not a refusal");
        expect(outcome.failure.narrowerContinuation).toBeUndefined();
    });

    it("carries nothing_left_to_cut only when ACR said so", async () => {
        const { store, source } = makeSource();
        const event = capturedRefusal(
            "acr_encoder_budget_refusal_result_count.event.json",
        ) as Extract<InvestigationEvent, { type: "error" }>;
        const cut = {
            ...event,
            error: {
                ...event.error,
                error: {
                    ...event.error.error,
                    details: { ...event.error.error.details, nothing_left_to_cut: true },
                },
            },
        } as InvestigationEvent;
        transport.scripts.push([accepted(), cut], [accepted(), event]);
        store.submit(QUESTION);
        await reaches(store, "refused");
        expect(latest(source).outcome).toMatchObject({ failure: { nothingLeftToCut: true } });
        store.submit(QUESTION);
        await vi.waitFor(() => expect(store.getSnapshot().turns).toHaveLength(2));
        await reaches(store, "refused");
        expect(latest(source).outcome).toMatchObject({ failure: { nothingLeftToCut: false } });
    });
});

describe("the snapshot", () => {
    it("one store turn is two turns: user 2n, assistant 2n + 1, the ids web sends", async () => {
        const { store, source } = makeSource();
        transport.scripts.push([resultEvent(PARTIAL)], [resultEvent(PARTIAL)]);
        store.submit(QUESTION);
        await settled(store);
        store.submit("Why?");
        await settled(store);

        const [first, second] = store.getSnapshot().turns;
        expect(source.getSnapshot().turns.map((turn) => [turn.role, turn.id])).toEqual([
            ["user", first!.id * 2],
            ["assistant", first!.id * 2 + 1],
            ["user", second!.id * 2],
            ["assistant", second!.id * 2 + 1],
        ]);
        // The wire already names these ids: the seam's ids and `conversation[].turn_id` agree.
        expect(transport.calls[1]!.request.conversation?.map((turn) => turn.turn_id)).toEqual([
            `turn_${String(first!.id * 2)}`,
            `turn_${String(first!.id * 2 + 1)}`,
        ]);
        expect(users(source)[0]!.createdAt).toBe(first!.createdAt);
        expect(assistants(source)[0]!.createdAt).toBe(first!.createdAt);
    });

    it("conversationKey is the selection: a first question keeps it, another conversation moves it", async () => {
        const { store, source } = makeSource();
        const before = source.getSnapshot().conversationKey;
        transport.scripts.push([resultEvent(PARTIAL)]);
        store.submit(QUESTION);
        await settled(store);
        expect(source.getSnapshot().conversationKey).toBe(before);
        store.newConversation();
        expect(source.getSnapshot().conversationKey).toBe(store.getSnapshot().selection);
        expect(source.getSnapshot().conversationKey).not.toBe(before);
    });

    it("passes the thread through as it is", () => {
        const { store, source } = makeSource();
        expect(source.getSnapshot().thread).toEqual({ kind: "new" });
        store.selectThread("not a thread id", "local");
        expect(source.getSnapshot().thread).toEqual({ kind: "unavailable" });
    });

    it("stoppable is the store's", async () => {
        const { store, source } = makeSource();
        expect(source.getSnapshot().stoppable).toBe(false);
        transport.scripts.push([accepted(), { wait: new Promise(() => undefined) }]);
        store.submit(QUESTION);
        expect(source.getSnapshot().stoppable).toBe(true);
    });

    it("publishes no history until the store is ready", () => {
        const store = makeStore({}, null);
        const feedback = new FeedbackStore({ transport });
        const source = createChatSource({ store, feedback });
        expect(source.getSnapshot().history).toBeUndefined();
        store.setPartition(ORG_A);
        expect(source.getSnapshot().history).toMatchObject({ status: "idle", rows: [] });
    });

    it("maps the history to rows, with the conversation shown and its run", async () => {
        const { store, source } = makeSource();
        transport.listPages.push({
            threads: [{ ...summary(THREAD_A), firstQuestion: QUESTION }],
            nextCursor: "cursor-2",
        });
        source.history?.load();
        await vi.waitFor(() => expect(source.getSnapshot().history?.status).toBe("ready"));
        expect(source.getSnapshot().history).toEqual({
            status: "ready",
            rows: [
                {
                    id: THREAD_A,
                    firstQuestion: QUESTION,
                    lastTurnAt: summary(THREAD_A).lastTurnAt,
                    turnCount: 2,
                },
            ],
            currentId: null,
            hasMore: true,
            loadingMore: false,
            moreFailed: false,
            deleting: [],
            deleteFailed: null,
            running: false,
        });

        transport.scripts.push([accepted(), { wait: new Promise(() => undefined) }]);
        store.submit(QUESTION);
        expect(source.getSnapshot().history).toMatchObject({
            currentId: store.getSnapshot().threadId,
            running: true,
        });
    });

    it("says no more rows when the list has no next cursor", async () => {
        const { source } = makeSource();
        transport.listPages.push({ threads: [summary(THREAD_A)], nextCursor: null });
        source.history?.load();
        await vi.waitFor(() => expect(source.getSnapshot().history?.status).toBe("ready"));
        expect(source.getSnapshot().history?.hasMore).toBe(false);
    });

    it("publishes ACR's 409 no_repository with no rows and nothing to load (CHAOS-12439)", async () => {
        const { source } = makeSource();
        transport.listPages.push({
            fail: new TransportRefusal(409, acrError("no_repository", 409, false)),
        });
        source.history?.load();
        await vi.waitFor(() => expect(source.getSnapshot().history?.status).toBe("no_repository"));
        expect(source.getSnapshot().history).toMatchObject({
            rows: [],
            hasMore: false,
            loadingMore: false,
            moreFailed: false,
        });
    });

    describe("composerLocked, as the seam documents it", () => {
        it("a new conversation is locked only while signed out", () => {
            const store = makeStore({}, null);
            const source = createChatSource({
                store,
                feedback: new FeedbackStore({ transport }),
            });
            expect(source.getSnapshot().composerLocked).toBe(true);
            store.setPartition(ORG_A);
            expect(source.getSnapshot().composerLocked).toBe(false);
        });

        it("a loaded conversation is locked while one of its answers is read", async () => {
            const { store, source } = makeSource();
            const gate = deferred();
            transport.readGates.set(PARTIAL.result_id, gate.promise);
            transport.results.set(PARTIAL.result_id, PARTIAL);
            transport.threads.set(
                THREAD_A,
                threadView(
                    THREAD_A,
                    [threadTurn(SUB, "done", { resultId: PARTIAL.result_id })],
                    "older",
                ),
            );
            store.selectThread(THREAD_A, "local");
            await vi.waitFor(() => expect(transport.readCalls).toHaveLength(1));
            gate.resolve();
            await vi.waitFor(() => expect(store.getSnapshot().thread.kind).toBe("loaded"));
            expect(source.getSnapshot().composerLocked).toBe(false);

            // "Load again" on a loaded thread reads an answer: the composer waits for it.
            const held = deferred();
            transport.readGates.set("result_held_000001", held.promise);
            transport.readErrors.set("result_held_000001", new Error("offline"));
            transport.threads.set(
                THREAD_B,
                threadView(THREAD_B, [threadTurn(SUB, "done", { resultId: "result_held_000001" })]),
            );
            transport.readGates.delete("result_held_000001");
            store.selectThread(THREAD_B, "local");
            await reaches(store, "restore_failed");
            await vi.waitFor(() => expect(store.getSnapshot().thread.kind).toBe("loaded"));
            transport.readGates.set("result_held_000001", held.promise);
            source.reloadTurn?.(store.getSnapshot().turns[0]!.id * 2 + 1);
            expect(store.getSnapshot().replaying).toBe(true);
            expect(store.getSnapshot().thread.kind).toBe("loaded");
            expect(source.getSnapshot().composerLocked).toBe(true);
            held.resolve();
        });
    });

    it("a thread that closed under a running read is new: no lock, as web's own rule says", async () => {
        const { store, source } = makeSource();
        const failing = "result_failing_00001";
        transport.readErrors.set(failing, new Error("offline"));
        transport.threads.set(
            THREAD_A,
            threadView(THREAD_A, [threadTurn(SUB, "done", { resultId: failing })]),
        );
        store.selectThread(THREAD_A, "local");
        await reaches(store, "restore_failed");
        await vi.waitFor(() => expect(store.getSnapshot().thread.kind).toBe("loaded"));
        const restoredTurn = latest(source).id;

        // A question is out, then "Load again" reads the restored answer, and the question's run
        // ends the thread while that read is still out.
        const close = deferred();
        transport.scripts.push([accepted(), { wait: close.promise }, errorEvent("thread_closed")]);
        store.submit(QUESTION);
        await vi.waitFor(() => expect(transport.calls).toHaveLength(1));
        transport.readErrors.clear();
        transport.readGates.set(failing, new Promise(() => undefined));
        source.reloadTurn?.(restoredTurn);
        expect(store.getSnapshot().replaying).toBe(true);
        close.resolve();
        await vi.waitFor(() => expect(store.getSnapshot().thread.kind).toBe("new"));
        expect(store.getSnapshot().replaying).toBe(true);
        expect(source.getSnapshot().composerLocked).toBe(false);
    });

    it("notSaved and the page context come from the host, and a change notifies", () => {
        const { source } = makeSource();
        const listener = vi.fn();
        source.subscribe(listener);
        const ref = { kind: "team", id: "team-1", label: "Platform" } as const;
        source.setHostInputs(host({ notSaved: true, pageRefs: [ref] }));
        expect(source.getSnapshot()).toMatchObject({ notSaved: true, pageContext: [ref] });
        expect(listener).toHaveBeenCalled();
    });

    it("a change of the page context alone reaches the snapshot", () => {
        const { source } = makeSource();
        source.setHostInputs(host());
        const before = source.getSnapshot();
        const ref = { kind: "team", id: "team-1", label: "Platform" } as const;
        source.setHostInputs(host({ pageRefs: [ref] }));
        expect(source.getSnapshot()).not.toBe(before);
        expect(source.getSnapshot().pageContext).toEqual([ref]);
    });

    it("pageContext.remove is the host's", () => {
        const { source } = makeSource();
        const remove = vi.fn();
        const ref = { kind: "team", id: "team-1", label: "Platform" } as const;
        source.setHostInputs(host({ pageRefs: [ref], removePageRef: remove }));
        source.pageContext?.remove(ref);
        expect(remove).toHaveBeenCalledWith(ref);
    });

    describe("an org switch: the session moved, and the store still holds the old turns", () => {
        async function answeredInOrgA() {
            const made = makeSource();
            transport.scripts.push([accepted(), resultEvent(PARTIAL)]);
            made.source.setHostInputs(host());
            made.store.submit(QUESTION);
            await settled(made.store);
            expect(made.source.getSnapshot().turns).toHaveLength(2);
            return made;
        }

        it("shows none of the old partition's turns, and sends nothing", async () => {
            const { source } = await answeredInOrgA();

            source.setHostInputs(host({ partition: ORG_B }));

            expect(source.getSnapshot()).toMatchObject({
                turns: [],
                stoppable: false,
                composerLocked: true,
                notSaved: false,
            });
            expect(source.getSnapshot().history).toBeUndefined();
        });

        it("shows the store again once it holds the session's partition", async () => {
            const { source, store } = await answeredInOrgA();
            source.setHostInputs(host({ partition: ORG_B }));

            store.setPartition(ORG_B);
            transport.scripts.push([accepted(), resultEvent(PARTIAL)]);
            store.submit(QUESTION);
            await settled(store);

            expect(source.getSnapshot().turns).toHaveLength(2);
            expect(source.getSnapshot().composerLocked).toBe(false);
        });

        it("a session that moves back before the store rebinds shows its turns again", async () => {
            const { source } = await answeredInOrgA();
            source.setHostInputs(host({ partition: ORG_B }));
            expect(source.getSnapshot().turns).toEqual([]);

            source.setHostInputs(host());

            expect(source.getSnapshot().turns).toHaveLength(2);
        });

        it("a session still loading changes nothing: a refetch is not a sign-out", async () => {
            const { source } = await answeredInOrgA();

            source.setHostInputs(host({ partition: undefined }));

            expect(source.getSnapshot().turns).toHaveLength(2);
        });
    });

    describe("stays the same object until an input changes", () => {
        it("two reads, with nothing between", async () => {
            const { store, source } = makeSource();
            transport.scripts.push([resultEvent(PARTIAL)]);
            store.submit(QUESTION);
            await settled(store);
            expect(source.getSnapshot()).toBe(source.getSnapshot());
        });

        it("the same host inputs change nothing, and notify nobody", () => {
            const { source } = makeSource();
            source.setHostInputs(host());
            const before = source.getSnapshot();
            const listener = vi.fn();
            source.subscribe(listener);
            source.setHostInputs(host());
            expect(source.getSnapshot()).toBe(before);
            expect(listener).not.toHaveBeenCalled();
        });

        it("a store change gives a new snapshot; the turns stay when only the history moved", async () => {
            const { store, source } = makeSource();
            transport.scripts.push([resultEvent(PARTIAL)]);
            store.submit(QUESTION);
            await settled(store);
            const before = source.getSnapshot();
            source.history?.load();
            await vi.waitFor(() => expect(source.getSnapshot().history?.status).toBe("ready"));
            expect(source.getSnapshot()).not.toBe(before);
            expect(source.getSnapshot().turns).toBe(before.turns);
        });

        it("a host change after a read gives a new snapshot", () => {
            const { source } = makeSource();
            source.setHostInputs(host());
            const before = source.getSnapshot();
            source.setHostInputs(host({ notSaved: true }));
            expect(source.getSnapshot()).not.toBe(before);
            expect(source.getSnapshot().notSaved).toBe(true);
        });

        it("a read in the middle of an update does not freeze half of it", async () => {
            const { store, source } = makeSource();
            transport.scripts.push([resultEvent(CLARIFICATION)], [resultEvent(PARTIAL)]);
            await source.ask(QUESTION);
            const chosen = { kind: "project", canonical_id: "project:1", label: "Atlas" } as never;
            // A store listener runs inside `submit`, before the render-only intent is recorded.
            const off = store.subscribe(() => {
                source.getSnapshot();
            });
            const asked = source.ask(QUESTION, { chosenSubject: chosen, structureBatch: {} });
            off();
            expect(latest(source).chosenSubject).toBe(chosen);
            await asked;
        });

        it("unsubscribe stops the calls", async () => {
            const { store, source } = makeSource();
            const listener = vi.fn();
            const off = source.subscribe(listener);
            store.newConversation();
            const calls = listener.mock.calls.length;
            expect(calls).toBeGreaterThan(0);
            off();
            store.newConversation();
            expect(listener).toHaveBeenCalledTimes(calls);
        });
    });
});

describe("showBubble, retryQuestion, rootQuestion", () => {
    it("a plain submitted turn: a bubble, and both questions", async () => {
        const { store, source } = makeSource();
        transport.scripts.push([resultEvent(PARTIAL)]);
        store.submit(QUESTION);
        await settled(store);
        expect(users(source)[0]).toMatchObject({ question: QUESTION, showBubble: true });
        expect(latest(source)).toMatchObject({ retryQuestion: QUESTION, rootQuestion: QUESTION });
    });

    it.each([
        ["subject", { priorSubjectReceipts: [{ result_id: "r", receipt_id: "a" }] }],
        [
            "kind",
            { structureReceipts: { priorKindReceipts: [{ result_id: "r", receipt_id: "a" }] } },
        ],
        [
            "anchor",
            { structureReceipts: { priorAnchorReceipts: [{ result_id: "r", receipt_id: "a" }] } },
        ],
        [
            "handle",
            { structureReceipts: { priorHandleReceipts: [{ result_id: "r", receipt_id: "a" }] } },
        ],
        [
            "window",
            { structureReceipts: { priorWindowReceipts: [{ result_id: "r", receipt_id: "a" }] } },
        ],
        [
            "candidate",
            {
                structureReceipts: {
                    priorCandidateReceipts: [{ result_id: "r", receipt_id: "a" }],
                },
            },
        ],
    ])("a %s receipt the panel sent: no bubble and no retry", async (_, carry) => {
        const { store, source } = makeSource();
        transport.scripts.push([resultEvent(PARTIAL)]);
        store.submit(QUESTION, carry);
        await settled(store);
        expect(users(source)[0]!.showBubble).toBe(false);
        expect(latest(source).retryQuestion).toBeUndefined();
        expect(latest(source).rootQuestion).toBeUndefined();
    });

    it("the receipt fields it reads are every prior_*_receipts field of the request schema", () => {
        const schema = JSON.parse(
            readFileSync(
                join(
                    process.cwd(),
                    "src/lib/acr/contracts/schemas/context_fabric_investigation_request.v1.schema.json",
                ),
                "utf8",
            ),
        ) as { properties: Record<string, unknown> };
        expect(
            Object.keys(schema.properties)
                .filter((name) => /^prior_.*_receipts$/u.test(name))
                .sort(),
        ).toEqual(
            [
                "prior_anchor_receipts",
                "prior_candidate_receipts",
                "prior_handle_receipts",
                "prior_kind_receipts",
                "prior_subject_receipts",
                "prior_window_receipts",
            ].sort(),
        );
    });

    it("a restored turn: a bubble, no retry, and web's null question passes through", async () => {
        const { store, source } = makeSource();
        transport.results.set(PARTIAL.result_id, PARTIAL);
        transport.threads.set(
            THREAD_A,
            threadView(THREAD_A, [
                threadTurn(SUB, "done", { resultId: PARTIAL.result_id, question: null }),
            ]),
        );
        store.selectThread(THREAD_A, "local");
        await reaches(store, "answered");
        expect(users(source)[0]).toMatchObject({ question: null, showBubble: true });
        expect(latest(source).retryQuestion).toBeUndefined();
        expect(latest(source).rootQuestion).toBeUndefined();
    });

    it("a restored turn with a question keeps it, and still gets no retry", async () => {
        const { store, source } = makeSource();
        transport.results.set(PARTIAL.result_id, PARTIAL);
        transport.threads.set(
            THREAD_A,
            threadView(THREAD_A, [threadTurn(SUB, "done", { resultId: PARTIAL.result_id })]),
        );
        store.selectThread(THREAD_A, "local");
        await reaches(store, "answered");
        expect(users(source)[0]!.question).toBe(`question of ${SUB}`);
        expect(latest(source).retryQuestion).toBeUndefined();
    });

    it("a narrower re-ask keeps the chain's root", async () => {
        const { source } = makeSource();
        transport.scripts.push([resultEvent(PARTIAL)]);
        await source.ask(`${QUESTION}, top 5 only?`, { narrowingRoot: QUESTION });
        expect(latest(source)).toMatchObject({
            retryQuestion: `${QUESTION}, top 5 only?`,
            rootQuestion: QUESTION,
        });
    });
});

describe("ask", () => {
    it("resolves true when the turn ended answered", async () => {
        const { source } = makeSource();
        transport.scripts.push([accepted(), resultEvent(PARTIAL)]);
        await expect(source.ask(QUESTION)).resolves.toBe(true);
    });

    it("resolves true for a clarification too: it ended answered", async () => {
        const { source } = makeSource();
        transport.scripts.push([accepted(), resultEvent(CLARIFICATION)]);
        await expect(source.ask(QUESTION)).resolves.toBe(true);
    });

    it("stays open while the turn is in flight", async () => {
        const { store, source } = makeSource();
        const gate = deferred();
        transport.scripts.push([accepted(), { wait: gate.promise }, resultEvent(PARTIAL)]);
        const done = vi.fn();
        void source.ask(QUESTION).then(done);
        await vi.waitFor(() => expect(last(store).reservedResultId).toBeDefined());
        expect(done).not.toHaveBeenCalled();
        gate.resolve();
        await vi.waitFor(() => expect(done).toHaveBeenCalledWith(true));
    });

    it("resolves false when the turn ended without an answer", async () => {
        const { source } = makeSource();
        transport.scripts.push([accepted(), errorEvent("internal_error")]);
        await expect(source.ask(QUESTION)).resolves.toBe(false);
    });

    it("resolves false at once when submit refuses: a second question, blank, signed out", async () => {
        const { source } = makeSource();
        transport.scripts.push([accepted(), { wait: new Promise(() => undefined) }]);
        void source.ask(QUESTION);
        await expect(source.ask("Another")).resolves.toBe(false);
        expect(transport.calls).toHaveLength(1);

        const signedOut = createChatSource({
            store: makeStore({}, null),
            feedback: new FeedbackStore({ transport }),
        });
        await expect(signedOut.ask(QUESTION)).resolves.toBe(false);
        const { source: fresh } = makeSource();
        await expect(fresh.ask("   ")).resolves.toBe(false);
    });

    it("resolves false when its conversation goes away", async () => {
        const { store, source } = makeSource();
        transport.scripts.push([accepted(), { wait: new Promise(() => undefined) }]);
        const asked = source.ask(QUESTION);
        store.newConversation();
        await expect(asked).resolves.toBe(false);
    });

    it("resolves false when the partition clears it", async () => {
        const { store, source } = makeSource();
        transport.scripts.push([accepted(), { wait: new Promise(() => undefined) }]);
        const asked = source.ask(QUESTION);
        store.setPartition(ORG_B);
        await expect(asked).resolves.toBe(false);
    });

    it("sends the page hints first, then what the previous answer carries", async () => {
        const { source } = makeSource();
        source.setHostInputs(
            host({ pageRefs: [{ kind: "team", id: "team-1", label: "Platform" }] }),
        );
        transport.scripts.push([resultEvent(PARTIAL)]);
        await source.ask(QUESTION);
        expect(transport.calls[0]!.request.requested_scope?.subject_hints).toEqual([
            { kind: "team", id: "team-1", label: "Platform", source: "ask_dev_page_context" },
        ]);
    });

    it("sends every member of a structure batch, each in its own field", async () => {
        const { source } = makeSource();
        const receipt = (receipt_id: string) => ({ result_id: "result_parent_001", receipt_id });
        transport.scripts.push([resultEvent(PARTIAL)]);
        await source.ask(QUESTION, {
            structureBatch: {
                expected_kind: receipt("k"),
                subject_anchor: receipt("a"),
                subject_handle: receipt("h"),
                window: receipt("w"),
                subject_candidate: receipt("c"),
            },
        });
        expect(transport.calls[0]!.request).toMatchObject({
            prior_kind_receipts: [receipt("k")],
            prior_anchor_receipts: [receipt("a")],
            prior_handle_receipts: [receipt("h")],
            prior_window_receipts: [receipt("w")],
            prior_candidate_receipts: [receipt("c")],
        });
    });

    it("sends a subject pick, and names the result its receipts came from as the parent", async () => {
        const { source } = makeSource();
        const receipt = { result_id: "result_parent_001", receipt_id: "subject-1" };
        transport.scripts.push([resultEvent(PARTIAL)]);
        await source.ask(QUESTION, { priorSubjectReceipts: [receipt] });
        expect(transport.calls[0]!.request).toMatchObject({
            prior_subject_receipts: [receipt],
            parent_result_id: "result_parent_001",
        });
    });

    it("drops the selection telemetry: ACR has no field for it", async () => {
        const { source } = makeSource();
        transport.scripts.push([resultEvent(PARTIAL)]);
        await source.ask(QUESTION, {
            selectionEvents: [{ outcome: "selected" }] as never,
        });
        expect(JSON.stringify(transport.calls[0]!.request)).not.toContain("selected");
        expect(Object.keys(transport.calls[0]!.request)).not.toContain("selectionEvents");
    });

    it("a chosen subject alone is a re-ask too: no bubble, as the seam defines", async () => {
        const { source } = makeSource();
        transport.scripts.push([resultEvent(PARTIAL)]);
        await source.ask(QUESTION, {
            chosenSubject: { kind: "project", canonical_id: "project:1", label: "Atlas" } as never,
        });
        expect(users(source)[0]!.showBubble).toBe(false);
        expect(latest(source).retryQuestion).toBeUndefined();
    });

    it("an empty structure batch is still a re-ask: no bubble, as the seam defines", async () => {
        const { source } = makeSource();
        transport.scripts.push([resultEvent(PARTIAL)]);
        await source.ask(QUESTION, { structureBatch: {} });
        expect(users(source)[0]!.showBubble).toBe(false);
        expect(latest(source).retryQuestion).toBeUndefined();
    });
});

describe("render-only intent", () => {
    const chosen = { kind: "project", canonical_id: "project:1", label: "Atlas" } as never;
    const supersedesOf = (turnId: number) => ({
        turnId,
        submittedStructureBatch: {},
        submittedCandidateReceiptIds: new Set(["subject-1"]),
        submittedStructureCandidateReceiptIds: new Set<string>(),
    });

    it("chosenSubject lands on the new turn, and supersedes on the old one, in one update", async () => {
        const { store, source } = makeSource();
        transport.scripts.push([resultEvent(CLARIFICATION)], [resultEvent(PARTIAL)]);
        await source.ask(QUESTION);
        const superseded = latest(source).id;
        const seen: ChatTurn[][] = [];
        source.subscribe(() => seen.push([...source.getSnapshot().turns]));

        void source.ask(QUESTION, {
            chosenSubject: chosen,
            priorSubjectReceipts: [{ result_id: CLARIFICATION.result_id, receipt_id: "subject-1" }],
            supersedes: supersedesOf(superseded),
        });
        // The first update that shows the new turn already holds both.
        const first = seen[0]!.filter((turn) => turn.role === "assistant") as ChatAssistantTurn[];
        expect(first).toHaveLength(2);
        expect(first[1]!.chosenSubject).toBe(chosen);
        expect(first[0]!.submittedCandidateReceiptIds).toEqual(new Set(["subject-1"]));
        await settled(store);
    });

    it("holds one conversation's intent at most: the map cannot grow with the tab", async () => {
        const { store, source } = makeSource();
        transport.scripts.push([resultEvent(CLARIFICATION)], [resultEvent(PARTIAL)]);
        await source.ask(QUESTION);
        await source.ask(QUESTION, {
            chosenSubject: chosen,
            structureBatch: {},
            supersedes: supersedesOf(latest(source).id),
        });
        // Two asks, and one superseded turn.
        expect(source.retainedTurns()).toBe(3);
        store.newConversation();
        expect(source.retainedTurns()).toBe(0);
    });

    it.each([
        ["a new conversation", (store: ConversationStore) => store.newConversation()],
        ["a clear", (store: ConversationStore) => store.clear("unmounted")],
        ["a partition change", (store: ConversationStore) => store.setPartition(ORG_B)],
    ])("%s clears it", async (_, change) => {
        const { store, source } = makeSource();
        transport.scripts.push(
            [resultEvent(CLARIFICATION)],
            [resultEvent(PARTIAL)],
            [resultEvent(PARTIAL)],
        );
        await source.ask(QUESTION);
        await source.ask(QUESTION, {
            chosenSubject: chosen,
            structureBatch: {},
            supersedes: supersedesOf(latest(source).id),
        });
        expect(latest(source).chosenSubject).toBe(chosen);
        change(store);
        store.setPartition(ORG_A);
        await source.ask(QUESTION);
        expect(latest(source).chosenSubject).toBeUndefined();
        expect(latest(source).submittedCandidateReceiptIds).toBeUndefined();
    });
});

describe("retry", () => {
    it("sends the same turn again under the same submission id, and never a new one", async () => {
        const { store, source } = makeSource();
        transport.scripts.push(
            [{ fail: new TransportRefusal(503, acrError("upstream_unavailable", 503, true)) }],
            [accepted(), resultEvent(PARTIAL)],
        );
        await expect(source.ask(QUESTION)).resolves.toBe(false);
        const before = store.getSnapshot().turns;
        expect(latest(source).outcome).toMatchObject({ retry: true });

        await expect(source.retry(latest(source).id)).resolves.toBe(true);
        expect(transport.calls).toHaveLength(2);
        expect(transport.calls[1]!.submissionId).toBe(transport.calls[0]!.submissionId);
        expect(transport.calls[1]!.request).toEqual(transport.calls[0]!.request);
        expect(store.getSnapshot().turns).toHaveLength(before.length);
    });

    it("resolves false when the retry ended without an answer", async () => {
        const { source } = makeSource();
        const failure = {
            fail: new TransportRefusal(503, acrError("upstream_unavailable", 503, true)),
        };
        transport.scripts.push([failure], [failure]);
        await source.ask(QUESTION);
        await expect(source.retry(latest(source).id)).resolves.toBe(false);
    });

    it("resolves false at once when the store refuses, and sends nothing", async () => {
        const { source } = makeSource();
        transport.scripts.push([accepted(), resultEvent(PARTIAL)]);
        await source.ask(QUESTION);
        await expect(source.retry(latest(source).id)).resolves.toBe(false);
        expect(transport.calls).toHaveLength(1);
    });
});

describe("the other actions", () => {
    it("stop is the store's cancel", async () => {
        const { store, source } = makeSource();
        transport.cancelAnswers.push({ kind: "running" });
        transport.scripts.push([accepted(), { wait: new Promise(() => undefined) }]);
        void source.ask(QUESTION);
        await vi.waitFor(() => expect(last(store).reservedResultId).toBeDefined());
        source.stop?.();
        await vi.waitFor(() => expect(transport.cancelCalls).toHaveLength(1));
    });

    it("reloadTurn is a GET of that turn, never an investigation", async () => {
        const { store, source } = makeSource();
        transport.readErrors.set(PARTIAL.result_id, new Error("offline"));
        transport.threads.set(
            THREAD_A,
            threadView(THREAD_A, [threadTurn(SUB, "done", { resultId: PARTIAL.result_id })]),
        );
        store.selectThread(THREAD_A, "local");
        await reaches(store, "restore_failed");
        transport.readErrors.clear();
        transport.results.set(PARTIAL.result_id, PARTIAL);
        source.reloadTurn?.(latest(source).id);
        await reaches(store, "answered");
        expect(transport.calls).toHaveLength(0);
    });

    it("newConversation starts one, and reloadThread reads the failed one again", async () => {
        const { store, source } = makeSource();
        transport.threads.set(THREAD_A, { fail: new Error("offline") });
        store.selectThread(THREAD_A, "local");
        await vi.waitFor(() => expect(store.getSnapshot().thread.kind).toBe("read_failed"));
        source.reloadThread?.();
        await vi.waitFor(() => expect(transport.threadCalls).toHaveLength(2));
        source.newConversation();
        expect(store.getSnapshot()).toMatchObject({ threadId: null, selectionSource: "local" });
    });

    it("loadEarlier reads the earlier page", async () => {
        const { store, source } = makeSource();
        transport.results.set(PARTIAL.result_id, PARTIAL);
        transport.threads.set(
            THREAD_A,
            threadView(
                THREAD_A,
                [threadTurn(SUB, "done", { resultId: PARTIAL.result_id })],
                "older",
            ),
        );
        store.selectThread(THREAD_A, "local");
        await reaches(store, "answered");
        await vi.waitFor(() => expect(store.getSnapshot().thread.kind).toBe("loaded"));
        source.loadEarlier?.();
        await vi.waitFor(() =>
            expect(transport.threadCalls.at(-1)).toMatchObject({ before: "older" }),
        );
    });

    it("history: load, more, open and remove reach the store", async () => {
        const { store, source } = makeSource();
        transport.listPages.push(
            { threads: [summary(THREAD_A)], nextCursor: "cursor-2" },
            { threads: [summary(THREAD_B)], nextCursor: null },
        );
        transport.threads.set(THREAD_A, threadView(THREAD_A, []));
        source.history?.load();
        await vi.waitFor(() => expect(transport.listCalls).toEqual([undefined]));
        await vi.waitFor(() => expect(source.getSnapshot().history?.status).toBe("ready"));
        source.history?.loadMore();
        await vi.waitFor(() => expect(source.getSnapshot().history?.rows).toHaveLength(2));
        source.history?.open(THREAD_A);
        expect(store.getSnapshot()).toMatchObject({
            threadId: THREAD_A,
            selectionSource: "local",
        });
        source.history?.remove(THREAD_B);
        await vi.waitFor(() => expect(transport.deleteCalls).toEqual([THREAD_B]));
    });

    // CHAOS-12474: a signed-in user meets no connect step, so the render gets nothing to draw one.
    it("offers no Connect slot", () => {
        const { source } = makeSource();
        expect(source.slots).toBeUndefined();
    });

    it("holds no credential: the seam is its members and nothing else", () => {
        const { source } = makeSource();
        const { setHostInputs: _inputs, retainedTurns: _retained, ...seam } = source;
        expect(Object.keys(seam).sort()).toEqual(
            [
                "ask",
                "askBatch",
                "feedback",
                "getSnapshot",
                "history",
                "loadEarlier",
                "newConversation",
                "pageContext",
                "reloadThread",
                "reloadTurn",
                "retry",
                "stop",
                "subscribe",
            ].sort(),
        );
    });
});

describe("feedback", () => {
    async function answered() {
        const made = makeSource();
        made.source.setHostInputs(host());
        transport.scripts.push([resultEvent(PARTIAL)]);
        await made.source.ask(QUESTION);
        return made;
    }

    it("isReady is the store bound to the session's partition", async () => {
        const { source, feedback } = await answered();
        expect(source.feedback?.isReady()).toBe(true);
        source.setHostInputs(host({ partition: ORG_B }));
        expect(source.feedback?.isReady()).toBe(false);
        feedback.setPartition(ORG_B);
        expect(source.feedback?.isReady()).toBe(true);
    });

    it("subscribe fires when the session's partition changes, before the store rebinds", async () => {
        const { source } = await answered();
        const listener = vi.fn();
        const off = source.feedback!.subscribe(listener);
        source.setHostInputs(host({ partition: ORG_B }));
        expect(listener).toHaveBeenCalledTimes(1);
        off();
        source.setHostInputs(host({ partition: ORG_A }));
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it("subscribe fires when an entry changes", async () => {
        const { source } = await answered();
        const listener = vi.fn();
        source.feedback!.subscribe(listener);
        source.feedback!.ensure(PARTIAL.result_id);
        await vi.waitFor(() =>
            expect(source.feedback!.entryFor(PARTIAL.result_id)?.state).toBe("ready"),
        );
        expect(listener).toHaveBeenCalled();
    });

    it("never shows another (org, principal) its entry, across the switch", async () => {
        const { source, feedback } = await answered();
        source.feedback!.ensure(PARTIAL.result_id);
        await vi.waitFor(() =>
            expect(source.feedback!.entryFor(PARTIAL.result_id)?.state).toBe("ready"),
        );
        // The session moved first: the store still holds the old key's entry.
        source.setHostInputs(host({ partition: ORG_B }));
        expect(feedback.entry(PARTIAL.result_id)).toBeDefined();
        expect(source.feedback!.entryFor(PARTIAL.result_id)).toBeUndefined();
    });

    it("an entry has the seam's fields only, and stays the same object until it changes", async () => {
        const { source } = await answered();
        source.feedback!.ensure(PARTIAL.result_id);
        await vi.waitFor(() =>
            expect(source.feedback!.entryFor(PARTIAL.result_id)?.state).toBe("ready"),
        );
        const entry = source.feedback!.entryFor(PARTIAL.result_id);
        expect(Object.keys(entry!).sort()).toEqual(["desired", "notSaved", "saving", "state"]);
        expect(source.feedback!.entryFor(PARTIAL.result_id)).toBe(entry);
    });

    it("choose presses a value, a second press clears it, and retryRead reads again", async () => {
        const { source } = await answered();
        transport.feedback.set(PARTIAL.result_id, { fail: new Error("offline") });
        source.feedback!.ensure(PARTIAL.result_id);
        await vi.waitFor(() =>
            expect(source.feedback!.entryFor(PARTIAL.result_id)?.state).toBe("read_failed"),
        );
        transport.feedback.delete(PARTIAL.result_id);
        source.feedback!.retryRead(PARTIAL.result_id);
        await vi.waitFor(() =>
            expect(source.feedback!.entryFor(PARTIAL.result_id)?.state).toBe("ready"),
        );
        source.feedback!.choose(PARTIAL.result_id, "useful", "yes");
        expect(source.feedback!.entryFor(PARTIAL.result_id)?.desired.useful).toBe("yes");
        source.feedback!.choose(PARTIAL.result_id, "useful", "yes");
        expect(source.feedback!.entryFor(PARTIAL.result_id)?.desired.useful).toBe("unset");
    });
});

describe("with no transport: a read-only source", () => {
    it("shows the turns it is given, with no composer, and sends nothing", async () => {
        const source = readOnlyChatSource([PARTIAL]);
        expect(source.getSnapshot()).toBe(source.getSnapshot());
        expect(source.getSnapshot()).toMatchObject({
            composerHidden: true,
            stoppable: false,
            thread: { kind: "new" },
        });
        // Locked is a word to a viewer who could ask: this one has no way to.
        expect(source.getSnapshot().composerLocked).toBeUndefined();
        expect(source.getSnapshot().turns.map((turn) => turn.role)).toEqual(["user", "assistant"]);
        expect(latest(source).outcome).toMatchObject({ kind: "answered" });
        await expect(source.ask(QUESTION)).resolves.toBe(false);
        await expect(source.retry(1)).resolves.toBe(false);
        source.askBatch([], QUESTION);
    });

    it("a refusal turn is the same failed outcome", () => {
        const event = capturedRefusal(
            "acr_encoder_budget_refusal_result_count.event.json",
        ) as Extract<InvestigationEvent, { type: "error" }>;
        const source = readOnlyChatSource([
            {
                question: QUESTION,
                refusal: {
                    type: "error",
                    reserved_result_id: event.reserved_result_id,
                    error: event.error,
                },
            },
        ]);
        expect(users(source)[0]!.question).toBe(QUESTION);
        expect(latest(source).outcome).toMatchObject({
            kind: "failed",
            failure: { upstreamCode: "budget_refusal" },
        });
    });
});
