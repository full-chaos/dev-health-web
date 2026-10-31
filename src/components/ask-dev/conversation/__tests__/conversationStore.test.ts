import { beforeEach, describe, expect, it, vi } from "vitest";

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: log }));

import type { TranscriptResult } from "../../answer/AskDevTurn";
import {
    carryOfChoice,
    ConversationStore,
    STATUS_POLL_INTERVAL_MS,
    type ConversationStoreOptions,
} from "../conversationStore";
import { isCorrelationId } from "../keys";
import { TransportFailure, TransportRefusal } from "../transport";
import {
    accepted,
    acrError,
    captureResult,
    deferred,
    errorEvent,
    FakeTransport,
    resultEvent,
    status,
} from "./fakeTransport";

const PARTIAL = captureResult("kiac_project_status_partial.event.json");
const CLARIFICATION = captureResult("kiac_project_status_clarification.event.json");
const ORG_A = "org-a\u0000user-1\u0000";
const ORG_B = "org-b\u0000user-1\u0000";

let transport: FakeTransport;
let clock: number;
let sleeps: number[];

function makeStore(options: Partial<ConversationStoreOptions> = {}): ConversationStore {
    let n = 0;
    const store = new ConversationStore({
        transport,
        now: () => clock,
        sleep: async (ms) => {
            sleeps.push(ms);
            clock += ms;
        },
        uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
        ...options,
    });
    store.setPartition(ORG_A);
    return store;
}

const settled = (store: ConversationStore) =>
    vi.waitFor(() => expect(store.getSnapshot().inFlight).toBe(false));
const last = (store: ConversationStore) => store.getSnapshot().turns.at(-1)!;

beforeEach(() => {
    transport = new FakeTransport();
    clock = Date.parse("2026-10-30T12:00:00Z");
    sleeps = [];
    vi.clearAllMocks();
});

describe("thread and submission keys (plan §2.5, INV-2)", () => {
    it("mints one thread id per conversation and a new submission id per submit", async () => {
        const store = makeStore();
        transport.scripts.push([accepted(), resultEvent(PARTIAL)], [resultEvent(PARTIAL)]);

        expect(store.submit("Which projects are at risk?")).toBe(true);
        await settled(store);
        expect(store.submit("And the second one?")).toBe(true);
        await settled(store);

        const [first, second] = transport.calls;
        expect(first!.threadId).toBe(second!.threadId);
        expect(first!.submissionId).not.toBe(second!.submissionId);
        for (const id of [first!.threadId, first!.submissionId, second!.submissionId]) {
            expect(isCorrelationId(id)).toBe(true);
        }
        expect(store.getSnapshot().threadId).toBe(first!.threadId);
    });

    it("threads turn 2 on turn 1: parent result, its subjects and the conversation", async () => {
        const store = makeStore();
        transport.scripts.push([resultEvent(PARTIAL)], [resultEvent(PARTIAL)]);
        store.submit("Which projects are at risk?");
        await settled(store);
        store.submit("Why?");
        await settled(store);

        const second = transport.calls[1]!.request;
        expect(second.parent_result_id).toBe(PARTIAL.result_id);
        expect(second.requested_scope?.subject_hints?.map((hint) => hint.id)).toEqual(
            PARTIAL.subject_resolution.committed.map((subject) => subject.canonical_id),
        );
        expect(second.conversation?.map((turn) => [turn.role, turn.content])).toEqual([
            ["user", "Which projects are at risk?"],
            ["assistant", PARTIAL.deterministic_answer],
        ]);
        expect(transport.calls[0]!.request.parent_result_id).toBeUndefined();
    });

    it("sends one request for a double submit, and none for a blank one", async () => {
        const store = makeStore();
        const gate = deferred();
        transport.scripts.push([{ wait: gate.promise }, resultEvent(PARTIAL)]);

        expect(store.submit("Which projects are at risk?")).toBe(true);
        expect(store.submit("Which projects are at risk?")).toBe(false);
        expect(store.submit("Another question")).toBe(false);
        gate.resolve();
        await settled(store);
        expect(store.submit("   ​ ")).toBe(false);
        expect(transport.calls).toHaveLength(1);
        expect(store.getSnapshot().turns).toHaveLength(1);
    });

    it("retries only a retryable failure, under the same key with the identical request", async () => {
        const store = makeStore();
        // Dropped before `accepted`, and ACR holds no record: the call was never admitted.
        transport.scripts.push([{ fail: new TypeError("network") }], [resultEvent(PARTIAL)]);
        transport.statuses.push(null);
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(last(store).outcome).toEqual({
            kind: "failed",
            retry: true,
            reference: last(store).request.request_id,
        });

        expect(store.retry(last(store).id)).toBe(true);
        await settled(store);
        const [first, again] = transport.calls;
        expect(again!.submissionId).toBe(first!.submissionId);
        expect(again!.request).toBe(first!.request);
        expect(again!.threadId).toBe(first!.threadId);
        expect(last(store).outcome).toEqual({ kind: "answered", result: PARTIAL });
        // An answered turn is not retried.
        expect(store.retry(last(store).id)).toBe(false);
        expect(transport.calls).toHaveLength(2);
    });

    it("never retries a terminal error: the key is spent", async () => {
        const store = makeStore();
        transport.scripts.push([accepted(), errorEvent("timeout")]);
        store.submit("Which projects are at risk?");
        await settled(store);
        // ACR's own request id is the reference to quote (plan §2.7.8 "other errors").
        expect(last(store).outcome).toEqual({
            kind: "failed",
            retry: false,
            reference: "req_test",
        });
        expect(store.retry(last(store).id)).toBe(false);
        expect(transport.calls).toHaveLength(1);
    });

    it("carries a clarification choice: its receipts and its parent result", async () => {
        const store = makeStore();
        transport.scripts.push([resultEvent(CLARIFICATION)], [resultEvent(PARTIAL)]);
        store.submit("What is the status of the project?");
        await settled(store);
        const receipt = { result_id: CLARIFICATION.result_id, receipt_id: "receipt_0001" };
        store.submit(
            "What is the status of the project?",
            carryOfChoice({
                parentResultId: CLARIFICATION.result_id,
                receipts: { prior_anchor_receipts: [receipt] },
            }),
        );
        await settled(store);
        const request = transport.calls[1]!.request;
        expect(request.parent_result_id).toBe(CLARIFICATION.result_id);
        expect(request.prior_anchor_receipts).toEqual([receipt]);
        expect(request.prior_kind_receipts).toBeUndefined();
    });
});

describe("partition, abort, clear and generation (D-20)", () => {
    it("on an org switch aborts the run, clears the turns and drops its late events", async () => {
        const store = makeStore();
        const gate = deferred();
        transport.scripts.push([accepted(), { wait: gate.promise }, resultEvent(PARTIAL)]);
        store.submit("Which projects are at risk?");
        await vi.waitFor(() => expect(last(store).reservedResultId).toBeDefined());
        const before = store.getSnapshot();
        const signal = transport.calls[0]!.signal;

        store.setPartition(ORG_B);
        const cleared = store.getSnapshot();
        expect(signal.aborted).toBe(true);
        expect(cleared).toMatchObject({ turns: [], threadId: null, inFlight: false, ready: true });
        expect(cleared.generation).toBe(before.generation + 1);

        // The aborted run's transport still delivers its result: it is dropped.
        gate.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(store.getSnapshot()).toBe(cleared);
        expect(transport.statusCalls).toEqual([]);

        // The new partition starts a new conversation with a new thread.
        transport.scripts.push([resultEvent(PARTIAL)]);
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(transport.calls[1]!.threadId).not.toBe(transport.calls[0]!.threadId);
        expect(store.getSnapshot().turns).toHaveLength(1);
    });

    it("stops a recovering run on an org switch: no replay after the switch", async () => {
        const parked = deferred();
        // The poll loop sleeps on a gate that ignores the abort, as a slow timer would.
        const store = makeStore({ sleep: () => parked.promise });
        transport.scripts.push([accepted()]);
        transport.statuses.push(status("running"));
        store.submit("Which projects are at risk?");
        await vi.waitFor(() =>
            expect(last(store).outcome).toEqual({ kind: "recovering", startedAt: clock }),
        );
        await vi.waitFor(() => expect(transport.statusCalls).toHaveLength(1));

        store.setPartition(ORG_B);
        transport.statuses.splice(0, transport.statuses.length, status("done", PARTIAL.result_id));
        transport.results.set(PARTIAL.result_id, PARTIAL);
        parked.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(store.getSnapshot().turns).toEqual([]);
        expect(transport.statusCalls).toHaveLength(1);
        expect(transport.readCalls).toEqual([]);
    });

    it("on sign-out clears and refuses every submit until a session is back", async () => {
        const store = makeStore();
        transport.scripts.push([resultEvent(PARTIAL)]);
        store.submit("Which projects are at risk?");
        await settled(store);

        store.setPartition(null);
        expect(store.getSnapshot()).toMatchObject({ turns: [], ready: false });
        expect(store.submit("Which projects are at risk?")).toBe(false);
        expect(transport.calls).toHaveLength(1);
    });

    it("keeps the conversation when the same partition is bound again", async () => {
        const store = makeStore();
        transport.scripts.push([resultEvent(PARTIAL)]);
        store.submit("Which projects are at risk?");
        await settled(store);
        const generation = store.getSnapshot().generation;
        store.setPartition(ORG_A);
        expect(store.getSnapshot().turns).toHaveLength(1);
        expect(store.getSnapshot().generation).toBe(generation);
    });

    it("refuses a submit before a partition is bound", () => {
        const store = new ConversationStore({ transport });
        expect(store.submit("Which projects are at risk?")).toBe(false);
        expect(transport.calls).toHaveLength(0);
    });
});

describe("cancel (plan §2.7.4)", () => {
    it("aborts the stream, says so, and drops a late answer", async () => {
        const store = makeStore();
        const gate = deferred();
        transport.scripts.push([accepted(), { wait: gate.promise }, resultEvent(PARTIAL)]);
        store.submit("Which projects are at risk?");
        await vi.waitFor(() => expect(last(store).reservedResultId).toBeDefined());

        store.cancel();
        expect(transport.calls[0]!.signal.aborted).toBe(true);
        expect(last(store).outcome).toEqual({ kind: "canceled" });
        expect(store.getSnapshot().inFlight).toBe(false);
        expect(log.info).toHaveBeenCalledWith(
            expect.objectContaining({ submission_id: transport.calls[0]!.submissionId }),
            "ask-dev run canceled",
        );
        gate.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(last(store).outcome).toEqual({ kind: "canceled" });
    });

    it("keeps a finished answer: cancel after the result changes nothing", async () => {
        const store = makeStore();
        transport.scripts.push([resultEvent(PARTIAL)]);
        store.submit("Which projects are at risk?");
        await settled(store);
        store.cancel();
        expect(last(store).outcome).toEqual({ kind: "answered", result: PARTIAL });
    });
});

describe("terminals", () => {
    it("records the stage ACR started, then the answer", async () => {
        const store = makeStore();
        const gate = deferred();
        transport.scripts.push([
            accepted("result_reserved_0042"),
            {
                seq: 9,
                request_id: "r",
                type: "stage",
                stage: "reading_facts",
                state: "started",
                elapsed_ms: 10,
            },
            { wait: gate.promise },
            resultEvent(PARTIAL),
        ]);
        store.submit("Which projects are at risk?");
        await vi.waitFor(() =>
            expect(last(store).outcome).toEqual({
                kind: "running",
                startedAt: clock,
                stage: "reading_facts",
                stages: { reading_facts: "started" },
            }),
        );
        expect(last(store).reservedResultId).toBe("result_reserved_0042");
        gate.resolve();
        await settled(store);
        expect(last(store).outcome).toEqual({ kind: "answered", result: PARTIAL });
    });

    // codex r3 on #1632: the event path closes the thread the same way as the 409, and says why.
    it("starts a new conversation after an in-stream thread_closed, and logs the code", async () => {
        const store = makeStore();
        transport.scripts.push(
            [resultEvent(PARTIAL)],
            [accepted(), errorEvent("thread_closed")],
            [resultEvent(PARTIAL)],
        );
        store.submit("Which projects are at risk?");
        await settled(store);
        store.submit("Why?");
        await settled(store);
        expect(last(store).outcome).toEqual({ kind: "thread_closed" });
        expect(store.getSnapshot().threadId).toBeNull();
        expect(log.warn).toHaveBeenCalledWith(
            expect.objectContaining({
                code: "thread_closed",
                submission_id: transport.calls[1]!.submissionId,
            }),
            "ask-dev investigation ended with an error",
        );

        store.submit("Which teams are overloaded?");
        await settled(store);
        const fresh = transport.calls[2]!;
        expect(fresh.threadId).not.toBe(transport.calls[0]!.threadId);
        expect(fresh.request).not.toHaveProperty("parent_result_id");
        expect(fresh.request).not.toHaveProperty("conversation");
    });

    it("keeps a budget refusal as a refusal turn with its reserved id", async () => {
        const store = makeStore();
        transport.scripts.push([accepted(), errorEvent("budget_refusal", "result_reserved_0007")]);
        store.submit("Rank every repository");
        await settled(store);
        expect(last(store).outcome).toMatchObject({
            kind: "refused",
            refusal: { type: "error", reserved_result_id: "result_reserved_0007" },
        });
    });
});

describe("recovery by submission status (plan §2.7.5)", () => {
    it("polls every 3 s and replays the FINAL result id, not the reserved one", async () => {
        const store = makeStore();
        const reused: TranscriptResult = { ...PARTIAL, result_id: "result_reused_0099" };
        transport.scripts.push([accepted("result_reserved_0001")]);
        transport.statuses.push(
            status("running"),
            status("running"),
            status("done", reused.result_id),
        );
        transport.results.set(reused.result_id, reused);

        store.submit("Which projects are at risk?");
        await settled(store);

        const submissionId = transport.calls[0]!.submissionId;
        expect(transport.statusCalls).toEqual([submissionId, submissionId, submissionId]);
        // §2.7.5: every 3 s.
        expect(sleeps).toEqual([3_000, 3_000]);
        expect(STATUS_POLL_INTERVAL_MS).toBe(3_000);
        expect(transport.readCalls).toEqual(["result_reused_0099"]);
        expect(last(store).outcome).toEqual({ kind: "answered", result: reused });
        expect(transport.calls).toHaveLength(1);
    });

    it.each([
        ["done_unsaved", { kind: "unsaved" }],
        ["abandoned", { kind: "interrupted" }],
    ] as const)("ends a %s submission as %j, with no second run", async (state, outcome) => {
        const store = makeStore();
        transport.scripts.push([accepted(), { fail: new TypeError("network") }]);
        transport.statuses.push(status(state));
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(last(store).outcome).toEqual(outcome);
        expect(transport.calls).toHaveLength(1);
    });

    it("ends as interrupted when ACR lost the record after accepting it", async () => {
        const store = makeStore();
        transport.scripts.push([accepted()]);
        transport.statuses.push(null);
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(last(store).outcome).toEqual({ kind: "interrupted" });
    });

    it("stops at the run's deadline", async () => {
        const store = makeStore({ runTimeoutMs: 10_000 });
        transport.scripts.push([accepted()]);
        transport.statuses.push(status("running"));
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(last(store).outcome).toEqual({ kind: "interrupted" });
        expect(transport.statusCalls.length).toBe(sleeps.length + 1);
        expect(sleeps.reduce((sum, ms) => sum + ms, 0)).toBeLessThanOrEqual(10_000);
        expect(log.warn).toHaveBeenCalledWith(
            expect.objectContaining({ submission_id: transport.calls[0]!.submissionId }),
            "ask-dev recovery reached the run deadline",
        );
    });

    it("polls again after a failed status read", async () => {
        const store = makeStore();
        transport.scripts.push([accepted()]);
        transport.statuses.push(new Error("offline"), status("abandoned"));
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(transport.statusCalls).toHaveLength(2);
        expect(last(store).outcome).toEqual({ kind: "interrupted" });
    });

    it("offers a retry when the replay read fails: the key replays, it never runs again", async () => {
        const store = makeStore();
        transport.scripts.push([accepted()]);
        transport.statuses.push(status("done", "result_missing_0001"));
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(last(store).outcome).toEqual({
            kind: "failed",
            retry: true,
            reference: last(store).request.request_id,
        });
    });
});

// codex r1 on #1632: no wait of a run may outlive its deadline D (plan §2.7.6 "abort at D").
describe("the run deadline bounds every wait", () => {
    const D_MS = 40;

    it("hands the transport the run's absolute deadline", async () => {
        const store = makeStore();
        transport.scripts.push([resultEvent(PARTIAL)]);
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(transport.calls[0]!.deadline).toBe(clock + 120_000);
    });

    it.each([
        [
            "a stream that stops sending",
            () => transport.scripts.push([accepted(), { wait: deferred().promise }]),
        ],
        [
            "a status read that never answers",
            () => {
                transport.scripts.push([accepted()]);
                transport.statusHangs = true;
            },
        ],
        [
            "a replay that never answers",
            () => {
                transport.scripts.push([accepted()]);
                transport.statuses.push(status("done", PARTIAL.result_id));
                transport.readHangs = true;
            },
        ],
    ])("ends %s at the deadline as interrupted", async (_name, arrange) => {
        const store = makeStore({ runTimeoutMs: D_MS });
        arrange();
        store.submit("Which projects are at risk?");
        await vi.waitFor(() => expect(store.getSnapshot().inFlight).toBe(false), {
            timeout: 2_000,
        });
        expect(last(store).outcome).toEqual({ kind: "interrupted" });
        expect(transport.calls[0]!.signal.aborted).toBe(true);
        expect(log.warn).toHaveBeenCalledWith(
            expect.objectContaining({ submission_id: transport.calls[0]!.submissionId }),
            "ask-dev run reached its deadline",
        );
        // The thread is free again.
        transport.scripts.push([resultEvent(PARTIAL)]);
        transport.statusHangs = false;
        transport.readHangs = false;
        expect(store.submit("Next question")).toBe(true);
    });
});

describe("refusals before the stream (plan §2.7.5 repeat key)", () => {
    const refuse = (code: string, retryable = false) => ({
        fail: new TransportRefusal(409, acrError(code, 409, retryable)),
    });

    it("follows a submission still in progress instead of starting another run", async () => {
        const store = makeStore();
        transport.scripts.push([refuse("submission_in_progress", true)]);
        transport.statuses.push(status("done", PARTIAL.result_id));
        transport.results.set(PARTIAL.result_id, PARTIAL);
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(transport.calls).toHaveLength(1);
        expect(transport.statusCalls).toHaveLength(1);
        expect(last(store).outcome).toEqual({ kind: "answered", result: PARTIAL });
    });

    it.each([
        ["submission_unsaved", { kind: "unsaved" }],
        // Plan §2.7.8: each submission state has its own copy, so abandoned is not interrupted.
        ["submission_abandoned", { kind: "abandoned" }],
        ["submission_mismatch", { kind: "mismatch", reference: "req_test" }],
    ] as const)("ends %s as %j", async (code, outcome) => {
        const store = makeStore();
        transport.scripts.push([refuse(code)]);
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(last(store).outcome).toEqual(outcome);
        expect(transport.statusCalls).toEqual([]);
    });

    // codex r2 on #1632: ACR closed the conversation (deleted, expired or full); the contract says
    // start a new one. The next question gets a new thread and carries nothing from the old one.
    it("starts a new conversation after thread_closed, keeping the old turns on screen", async () => {
        const store = makeStore();
        transport.scripts.push(
            [resultEvent(PARTIAL)],
            [refuse("thread_closed")],
            [resultEvent(PARTIAL)],
        );
        store.submit("Which projects are at risk?");
        await settled(store);
        store.submit("Why?");
        await settled(store);
        expect(last(store).outcome).toEqual({ kind: "thread_closed" });
        expect(store.retry(last(store).id)).toBe(false);
        expect(store.getSnapshot().threadId).toBeNull();

        store.submit("Which teams are overloaded?");
        await settled(store);
        const [first, closed, fresh] = transport.calls;
        expect(closed!.threadId).toBe(first!.threadId);
        expect(fresh!.threadId).not.toBe(first!.threadId);
        expect(fresh!.request).not.toHaveProperty("parent_result_id");
        expect(fresh!.request).not.toHaveProperty("conversation");
        expect(fresh!.request.requested_scope).toBeUndefined();
        expect(store.getSnapshot().turns).toHaveLength(3);
        expect(store.getSnapshot().threadId).toBe(fresh!.threadId);
    });

    it("logs a create without a submission id as a defect", async () => {
        const store = makeStore();
        transport.scripts.push([
            { fail: new TransportRefusal(400, acrError("submission_required", 400, false)) },
        ]);
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(last(store).outcome).toEqual({
            kind: "failed",
            retry: false,
            reference: "req_test",
        });
        expect(log.error).toHaveBeenCalledWith(
            expect.objectContaining({ code: "submission_required" }),
            "ask-dev create sent without a submission id",
        );
    });

    it("logs a reused key for another request as a defect", async () => {
        const store = makeStore();
        transport.scripts.push([refuse("submission_mismatch")]);
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(log.error).toHaveBeenCalledWith(
            expect.objectContaining({ code: "submission_mismatch" }),
            "ask-dev submission id reused for a different request",
        );
    });
});

// CHAOS-11929 (I-S07): every panel state of plan §2.7.8 is its own outcome, decided by the store.
describe("panel states (plan §2.7.8)", () => {
    const stage = (
        name: "interpreting" | "resolving_subjects" | "reading_facts",
        state: "started" | "completed",
    ) => ({
        seq: 0,
        request_id: "request_test",
        type: "stage" as const,
        stage: name,
        state,
        elapsed_ms: 5,
    });
    const deadlineError = (deadline: unknown) => ({
        ...errorEvent("upstream_unavailable"),
        type: "error" as const,
        reserved_result_id: "result_reserved_0001",
        error: {
            ...acrError("upstream_unavailable", 504, false),
            error: {
                ...acrError("upstream_unavailable", 504, false).error,
                details: { deadline },
            },
        } as ReturnType<typeof acrError>,
    });
    const limitRefusal = (code: string, details: Record<string, unknown>, retryable: boolean) => {
        const error = acrError(code, 429, retryable);
        return new TransportRefusal(
            429,
            { ...error, error: { ...error.error, details } } as ReturnType<typeof acrError>,
            30,
        );
    };

    it("records every stage the stream named, keeping a completed stage completed", async () => {
        const store = makeStore();
        const gate = deferred();
        transport.scripts.push([
            accepted(),
            stage("interpreting", "started"),
            stage("interpreting", "completed"),
            stage("reading_facts", "started"),
            // A late start of a completed stage changes nothing.
            stage("interpreting", "started"),
            { wait: gate.promise },
            resultEvent(PARTIAL),
        ]);
        store.submit("Which projects are at risk?");
        await vi.waitFor(() =>
            expect(last(store).outcome).toEqual({
                kind: "running",
                startedAt: clock,
                stage: "reading_facts",
                stages: { interpreting: "completed", reading_facts: "started" },
            }),
        );
        gate.resolve();
        await settled(store);
        expect(last(store).outcome).toEqual({ kind: "answered", result: PARTIAL });
    });

    it("restarts the elapsed time on a retry", async () => {
        const store = makeStore();
        const gate = deferred();
        transport.scripts.push([{ fail: new TypeError("network") }], [{ wait: gate.promise }]);
        transport.statuses.push(null);
        const first = clock;
        store.submit("Which projects are at risk?");
        await settled(store);
        clock += 60_000;
        expect(store.retry(last(store).id)).toBe(true);
        expect(last(store).outcome).toEqual({
            kind: "running",
            startedAt: first + 60_000,
            stages: {},
        });
        gate.resolve();
        await settled(store);
    });

    it.each([
        ["model", { kind: "deadline", deadline: "model" }],
        ["request", { kind: "deadline", deadline: "request" }],
    ] as const)(
        "ends an ACR %s deadline terminal as its deadline state",
        async (which, outcome) => {
            const store = makeStore();
            transport.scripts.push([accepted(), deadlineError(which)]);
            store.submit("Which projects are at risk?");
            await settled(store);
            expect(last(store).outcome).toEqual(outcome);
            expect(store.retry(last(store).id)).toBe(false);
            expect(transport.statusCalls).toEqual([]);
        },
    );

    it("treats a deadline outside the contract's enum as absent: another error", async () => {
        const store = makeStore();
        transport.scripts.push([accepted(), deadlineError("socket")]);
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(last(store).outcome).toEqual({
            kind: "failed",
            retry: false,
            reference: "req_test",
        });
    });

    // codex r2 on #1638: `details.deadline` is defined on a 504 only (error.v1). A retryable 503
    // that carries it is not a deadline: it stays a retryable failure, so Retry is offered.
    it("reads details.deadline on a 504 only: a retryable 503 with it stays retryable", async () => {
        const store = makeStore();
        const error = acrError("upstream_unavailable", 503, true);
        transport.scripts.push(
            [
                {
                    fail: new TransportRefusal(503, {
                        ...error,
                        error: { ...error.error, details: { deadline: "request" } },
                    } as ReturnType<typeof acrError>),
                },
            ],
            [
                accepted(),
                {
                    ...deadlineError("model"),
                    error: {
                        ...deadlineError("model").error,
                        error: { ...deadlineError("model").error.error, http_status: 503 },
                    },
                },
            ],
        );
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(last(store).outcome).toEqual({ kind: "failed", retry: true, reference: "req_test" });
        store.submit("And now?");
        await settled(store);
        expect(last(store).outcome).toEqual({
            kind: "failed",
            retry: false,
            reference: "req_test",
        });
    });

    it("reads details.deadline on upstream_unavailable only", async () => {
        const store = makeStore();
        const error = acrError("internal_error", 504, false);
        transport.scripts.push([
            {
                fail: new TransportRefusal(504, {
                    ...error,
                    error: { ...error.error, details: { deadline: "model" } },
                } as ReturnType<typeof acrError>),
            },
        ]);
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(last(store).outcome).toEqual({
            kind: "failed",
            retry: false,
            reference: "req_test",
        });
    });

    it("ends a 504 deadline before the stream as its deadline state", async () => {
        const store = makeStore();
        const error = deadlineError("request").error;
        transport.scripts.push([{ fail: new TransportRefusal(504, error) }]);
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(last(store).outcome).toEqual({ kind: "deadline", deadline: "request" });
    });

    it.each([
        ["concurrency_limited", { limit: "principal" }, true, "principal"],
        ["concurrency_limited", { limit: "org" }, true, "org"],
        ["concurrency_limited", {}, true, "concurrency"],
        ["concurrency_limited", { limit: "request_budget" }, true, "concurrency"],
        ["allowance_exhausted", {}, false, "allowance"],
    ] as const)(
        "ends a 429 %s %j as limited %s, with Retry-After",
        async (code, details, retryable, limit) => {
            const store = makeStore();
            transport.scripts.push([{ fail: limitRefusal(code, details, retryable) }]);
            store.submit("Which projects are at risk?");
            await settled(store);
            expect(last(store).outcome).toEqual({
                kind: "limited",
                limit,
                retry: retryable,
                retryAfterSeconds: 30,
            });
            expect(transport.statusCalls).toEqual([]);
        },
    );

    it("retries a retryable limit under the same key with the identical request", async () => {
        const store = makeStore();
        transport.scripts.push(
            [{ fail: limitRefusal("concurrency_limited", { limit: "principal" }, true) }],
            [resultEvent(PARTIAL)],
        );
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(store.retry(last(store).id)).toBe(true);
        await settled(store);
        const [first, again] = transport.calls;
        expect(again!.submissionId).toBe(first!.submissionId);
        expect(again!.request).toBe(first!.request);
        expect(last(store).outcome).toEqual({ kind: "answered", result: PARTIAL });
    });

    // codex r1 on #1638 asked for a new key after a retryable refusal before the stream. The
    // contract (X-ACR-Submission-ID) runs a request at most once per key, and a repeat of an
    // admitted key never runs again; a NEW key is what could run it twice. So Retry keeps the key,
    // and if ACR had admitted the first call, the repeat's 409 makes the store follow that run.
    it("retries a retryable refusal under its key, and follows the run if ACR had admitted it", async () => {
        const store = makeStore();
        const unavailable = new TransportRefusal(503, acrError("upstream_unavailable", 503, true));
        transport.scripts.push(
            [{ fail: unavailable }],
            [
                {
                    fail: new TransportRefusal(
                        409,
                        acrError("submission_in_progress", 409, true),
                        3,
                    ),
                },
            ],
        );
        transport.statuses.push(status("done", PARTIAL.result_id));
        transport.results.set(PARTIAL.result_id, PARTIAL);
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(last(store).outcome).toEqual({ kind: "failed", retry: true, reference: "req_test" });

        expect(store.retry(last(store).id)).toBe(true);
        await settled(store);
        const [first, again] = transport.calls;
        expect(transport.calls).toHaveLength(2);
        expect(again!.submissionId).toBe(first!.submissionId);
        expect(again!.request).toBe(first!.request);
        expect(transport.readCalls).toEqual([PARTIAL.result_id]);
        expect(last(store).outcome).toEqual({ kind: "answered", result: PARTIAL });
    });

    it("does not retry a limit ACR marks not retryable", async () => {
        const store = makeStore();
        transport.scripts.push([{ fail: limitRefusal("allowance_exhausted", {}, false) }]);
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(store.retry(last(store).id)).toBe(false);
        expect(transport.calls).toHaveLength(1);
    });

    it("ends a 406 stream_unavailable as its own state, not retryable", async () => {
        const store = makeStore();
        transport.scripts.push([
            { fail: new TransportRefusal(406, acrError("stream_unavailable", 406, false)) },
        ]);
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(last(store).outcome).toEqual({ kind: "stream_unavailable" });
        expect(store.retry(last(store).id)).toBe(false);
    });

    it.each([
        ["stalled", true, { kind: "stalled" }],
        ["admission_timeout", false, { kind: "deadline", deadline: "admission" }],
        ["budget_exhausted", false, { kind: "deadline", deadline: "budget_exhausted" }],
    ] as const)(
        "ends a transport %s as its own state, without polling",
        async (reason, afterAccepted, outcome) => {
            const store = makeStore();
            transport.scripts.push([
                ...(afterAccepted ? [accepted()] : []),
                { fail: new TransportFailure(reason) },
            ]);
            store.submit("Which projects are at risk?");
            await settled(store);
            expect(last(store).outcome).toEqual(outcome);
            expect(transport.statusCalls).toEqual([]);
            expect(transport.readCalls).toEqual([]);
            expect(store.retry(last(store).id)).toBe(false);
        },
    );

    it("ends an invalid upstream stream as another error with this turn's reference", async () => {
        const store = makeStore();
        transport.scripts.push([accepted(), { fail: new TransportFailure("invalid_upstream") }]);
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(last(store).outcome).toEqual({
            kind: "failed",
            retry: false,
            reference: last(store).request.request_id,
        });
        expect(transport.statusCalls).toEqual([]);
    });

    it("never shows an ACR request id that is not a plain id", async () => {
        const store = makeStore();
        const hostile = errorEvent("internal_error");
        if (hostile.type !== "error") throw new Error("not an error event");
        transport.scripts.push([
            accepted(),
            { ...hostile, error: { ...hostile.error, request_id: "<img src=x onerror=alert(1)>" } },
        ]);
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(last(store).outcome).toEqual({
            kind: "failed",
            retry: false,
            reference: last(store).request.request_id,
        });
    });

    it.each([[-1], [1.5], [Number.NaN], [Number.POSITIVE_INFINITY]])(
        "drops a Retry-After that is not a whole number of seconds (%s)",
        (seconds) => {
            const refusal = new TransportRefusal(
                429,
                acrError("concurrency_limited", 429, true),
                seconds,
            );
            expect(refusal.retryAfterSeconds).toBeUndefined();
        },
    );
});
