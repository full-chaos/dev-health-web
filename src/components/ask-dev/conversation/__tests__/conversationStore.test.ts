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
import { TransportRefusal } from "../transport";
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
        expect(last(store).outcome).toEqual({ kind: "failed", retry: true });

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
        expect(last(store).outcome).toEqual({ kind: "failed", retry: false });
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
        await vi.waitFor(() => expect(last(store).outcome).toEqual({ kind: "recovering" }));
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
            expect(last(store).outcome).toEqual({ kind: "running", stage: "reading_facts" }),
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

    // CHAOS-12201: the owner's cancel (ACR run lease) is the canceled state; a lost run is interrupted.
    it.each([
        ["canceled", { kind: "canceled" }],
        ["run_lost", { kind: "interrupted" }],
    ] as const)("ends an in-stream %s as %j", async (code, outcome) => {
        const store = makeStore();
        transport.scripts.push([accepted(), errorEvent(code)]);
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(last(store).outcome).toEqual(outcome);
        expect(store.retry(last(store).id)).toBe(false);
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
        expect(last(store).outcome).toEqual({ kind: "failed", retry: true });
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
        ["submission_abandoned", { kind: "interrupted" }],
        ["submission_mismatch", { kind: "failed", retry: false }],
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
        expect(last(store).outcome).toEqual({ kind: "failed", retry: false });
        expect(log.error).toHaveBeenCalledWith(
            expect.objectContaining({ code: "submission_required" }),
            "ask-dev create sent without a submission id",
        );
    });

    // CHAOS-12201: ACR refused before anything ran. Each refusal keeps its own reason; a retry under
    // the same key is offered only where nothing was admitted and waiting can help.
    it.each([
        ["access_denied", 403, false],
        ["no_repository", 409, false],
        ["budget_exhausted", 503, true],
        ["concurrency_limited", 429, true],
        ["allowance_exhausted", 429, false],
    ] as const)("ends a %s refusal (%i) as not run, retry %s", async (code, status, retry) => {
        const store = makeStore();
        transport.scripts.push(
            [{ fail: new TransportRefusal(status, acrError(code, status, retry)) }],
            [resultEvent(PARTIAL)],
        );
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(last(store).outcome).toEqual({ kind: "not_run", reason: code, retry });
        expect(transport.statusCalls).toEqual([]);
        expect(store.retry(last(store).id)).toBe(retry);
        if (retry) {
            await settled(store);
            expect(transport.calls[1]!.submissionId).toBe(transport.calls[0]!.submissionId);
            expect(last(store).outcome).toEqual({ kind: "answered", result: PARTIAL });
        }
    });

    // codex r1 on #1639: the rest of the create vocabulary before a run.
    it.each([
        ["stream_unavailable", 406, "stream_unavailable"],
        ["feature_not_enabled", 403, "not_entitled"],
        ["feature_not_enabled", 501, "not_entitled"],
        ["insufficient_scope", 403, "not_entitled"],
        ["repo_forbidden", 403, "repo_forbidden"],
        ["budget_refusal", 413, "budget_refusal"],
    ] as const)("ends %s (%i) as not run: %s, no retry", async (code, status, reason) => {
        const store = makeStore();
        transport.scripts.push([
            { fail: new TransportRefusal(status, acrError(code, status, true)) },
        ]);
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(last(store).outcome).toEqual({ kind: "not_run", reason, retry: false });
        expect(store.retry(last(store).id)).toBe(false);
    });

    // codex r2 on #1639: ACR's rate limit before a run; nothing ran, so the same key may be retried.
    it("ends rate_limited (429) as not run, with a retry under the same key", async () => {
        const store = makeStore();
        transport.scripts.push(
            [{ fail: new TransportRefusal(429, acrError("rate_limited", 429, true)) }],
            [resultEvent(PARTIAL)],
        );
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(last(store).outcome).toEqual({
            kind: "not_run",
            reason: "rate_limited",
            retry: true,
        });
        expect(store.retry(last(store).id)).toBe(true);
        await settled(store);
        expect(transport.calls[1]!.submissionId).toBe(transport.calls[0]!.submissionId);
    });

    it("logs an invalid request as a defect", async () => {
        const store = makeStore();
        transport.scripts.push([
            { fail: new TransportRefusal(400, acrError("invalid_request", 400, false)) },
        ]);
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(last(store).outcome).toEqual({ kind: "failed", retry: false });
        expect(log.error).toHaveBeenCalledWith(
            expect.objectContaining({ code: "invalid_request" }),
            "ask-dev investigation request refused as invalid",
        );
    });

    it.each([
        ["canceled", 409, { kind: "canceled" }],
        ["run_lost", 503, { kind: "interrupted" }],
    ] as const)("ends a %s answer before the stream (%i) as %j", async (code, status, outcome) => {
        const store = makeStore();
        transport.scripts.push([
            { fail: new TransportRefusal(status, acrError(code, status, false)) },
        ]);
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(last(store).outcome).toEqual(outcome);
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
