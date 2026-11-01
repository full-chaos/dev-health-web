import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: log }));

import type { TranscriptResult } from "@/lib/ask-dev/transcript";
import {
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
    threadTurn,
    threadView,
} from "./fakeTransport";

const PARTIAL = captureResult("kiac_project_status_partial.event.json");
const CLARIFICATION = captureResult("kiac_project_status_clarification.event.json");
const ORG_A = "org-a\u0000user-1\u0000";
const ORG_B = "org-b\u0000user-1\u0000";

let transport: FakeTransport;
let clock: number;
let sleeps: number[];

function makeStore(
    options: Partial<ConversationStoreOptions> = {},
    partition: string | null = ORG_A,
): ConversationStore {
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
    store.setPartition(partition);
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
            reference: last(store).request?.request_id,
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
        store.submit("What is the status of the project?", {
            parentResultId: CLARIFICATION.result_id,
            structureReceipts: { priorAnchorReceipts: [receipt] },
        });
        await settled(store);
        const request = transport.calls[1]!.request;
        expect(request.parent_result_id).toBe(CLARIFICATION.result_id);
        expect(request.prior_anchor_receipts).toEqual([receipt]);
        expect(request.prior_kind_receipts).toBeUndefined();
    });

    // CHAOS-12383: ask-dev's render offers `subject_resolution.candidates`; a pick is a subject
    // receipt, which the builder always took and the store never passed on.
    it("sends a carry's subject receipts as prior_subject_receipts", async () => {
        const store = makeStore();
        transport.scripts.push([resultEvent(CLARIFICATION)], [resultEvent(PARTIAL)]);
        store.submit("What is the status of the project?");
        await settled(store);
        const receipt = { result_id: CLARIFICATION.result_id, receipt_id: "receipt_0001" };
        store.submit("What is the status of the project?", { priorSubjectReceipts: [receipt] });
        await settled(store);
        expect(transport.calls[1]!.request.prior_subject_receipts).toEqual([receipt]);
        expect(transport.calls[0]!.request.prior_subject_receipts).toEqual([]);
    });
});

describe("a normal submit, with no as-of turn (CHAOS-12383)", () => {
    // Taken from the store before `asOfTurnId` existed. A change of the request builder or of a
    // capture changes it: then take it again, on purpose. Three turns: a first question, a plain
    // follow-up, and a follow-up with page hints and a receipt.
    const BYTES = "78a21c2910e51970c2fcf904d8c22013ae70b49e2d07aacef2a0a2e75684402b";

    it("sends the same bytes as before the as-of turn existed", async () => {
        const store = makeStore();
        transport.scripts.push(
            [resultEvent(CLARIFICATION)],
            [resultEvent(PARTIAL)],
            [resultEvent(PARTIAL)],
        );
        store.submit("What is the status of the project?");
        await settled(store);
        store.submit("Why?");
        await settled(store);
        store.submit("And the risks?", {
            pageHints: [{ kind: "team", id: "team-1", label: "Platform", source: "e2e" }],
            structureReceipts: {
                priorWindowReceipts: [{ result_id: PARTIAL.result_id, receipt_id: "receipt_w" }],
            },
        });
        await settled(store);
        const bytes = JSON.stringify(transport.calls.map((call) => call.request));
        expect(createHash("sha256").update(bytes).digest("hex")).toBe(BYTES);
    });
});

// CHAOS-12383: a batch runs in sequence, and each item must send what a parallel fan-out would.
describe("a carry's as-of turn", () => {
    /** Two answered turns of one thread, and the request a third sends as of the first. */
    async function asOfFirst() {
        const store = makeStore();
        transport.scripts.push(
            [resultEvent(CLARIFICATION)],
            [resultEvent(PARTIAL)],
            [resultEvent(PARTIAL)],
        );
        store.submit("What is the status of the project?");
        await settled(store);
        const asOfTurnId = last(store).id;
        store.submit("Why?");
        await settled(store);
        store.submit("And the risks?", { asOfTurnId });
        await settled(store);
        return { store, request: transport.calls[2]!.request, asOfTurnId };
    }

    it("the conversation holds the turns up to and including that turn, and no later one", async () => {
        const { request } = await asOfFirst();
        expect(request.conversation?.map((turn) => [turn.role, turn.content])).toEqual([
            ["user", "What is the status of the project?"],
            ["assistant", CLARIFICATION.deterministic_answer],
        ]);
        expect(JSON.stringify(request)).not.toContain("Why?");
    });

    it("the parent is that turn's result, not the newest one", async () => {
        const { request } = await asOfFirst();
        expect(request.parent_result_id).toBe(CLARIFICATION.result_id);
    });

    it("the carried hints are that turn's subjects, not the newest turn's", async () => {
        const store = makeStore();
        const later = {
            ...PARTIAL,
            subject_resolution: {
                ...PARTIAL.subject_resolution,
                committed: PARTIAL.subject_resolution.committed.map((subject) => ({
                    ...subject,
                    canonical_id: "project:later",
                })),
            },
        };
        transport.scripts.push(
            [resultEvent(PARTIAL)],
            [resultEvent(later)],
            [resultEvent(PARTIAL)],
        );
        store.submit("What is the status of the project?");
        await settled(store);
        const asOfTurnId = last(store).id;
        store.submit("Why?");
        await settled(store);
        store.submit("And the risks?", { asOfTurnId });
        await settled(store);
        const ids = transport.calls[2]!.request.requested_scope?.subject_hints?.map(
            (hint) => hint.id,
        );
        expect(ids).toEqual(
            PARTIAL.subject_resolution.committed.map((subject) => subject.canonical_id),
        );
        expect(ids).not.toContain("project:later");
    });

    it("a carry's own parent still wins", async () => {
        const store = makeStore();
        transport.scripts.push([resultEvent(CLARIFICATION)], [resultEvent(PARTIAL)]);
        store.submit("What is the status of the project?");
        await settled(store);
        store.submit("Why?", { asOfTurnId: last(store).id, parentResultId: "result_named_0001" });
        await settled(store);
        expect(transport.calls[1]!.request.parent_result_id).toBe("result_named_0001");
    });

    it("changes what is sent, never the thread: the new turn is still the newest", async () => {
        const { store, asOfTurnId } = await asOfFirst();
        expect(store.getSnapshot().turns).toHaveLength(3);
        expect(new Set(transport.calls.map((call) => call.threadId)).size).toBe(1);
        expect(last(store).id).toBeGreaterThan(asOfTurnId);
    });

    it("reads the served order: an earlier page holds newer ids and older turns", async () => {
        const store = makeStore();
        const earlier = "sub_00000000000000000000000000000002";
        const later = "sub_00000000000000000000000000000003";
        const THREAD = "thread_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        transport.results.set(PARTIAL.result_id, PARTIAL);
        transport.results.set(CLARIFICATION.result_id, CLARIFICATION);
        transport.threads.set(
            THREAD,
            threadView(
                THREAD,
                [threadTurn(later, "done", { resultId: PARTIAL.result_id, question: "Later" })],
                "older",
            ),
        );
        transport.threads.set(
            `${THREAD}|older`,
            threadView(THREAD, [
                threadTurn(earlier, "done", {
                    resultId: CLARIFICATION.result_id,
                    question: "Earlier",
                }),
            ]),
        );
        store.selectThread(THREAD, "local");
        await vi.waitFor(() =>
            expect(store.getSnapshot().thread).toEqual({ kind: "loaded", earlier: "available" }),
        );
        store.loadEarlierTurns();
        await vi.waitFor(() => expect(store.getSnapshot().turns).toHaveLength(2));
        await vi.waitFor(() =>
            expect(store.getSnapshot().turns.map((turn) => turn.outcome.kind)).toEqual([
                "answered",
                "answered",
            ]),
        );
        await vi.waitFor(() => expect(store.getSnapshot().replaying).toBe(false));
        const [older, newer] = store.getSnapshot().turns;
        // The earlier page was read last, so its turn has the larger id.
        expect(older!.id).toBeGreaterThan(newer!.id);

        transport.scripts.push([resultEvent(PARTIAL)]);
        expect(store.submit("Next", { asOfTurnId: newer!.id })).toBe(true);
        await settled(store);
        expect(transport.calls[0]!.request.conversation?.map((turn) => turn.content)).toEqual([
            "Earlier",
            CLARIFICATION.deterministic_answer,
            "Later",
            PARTIAL.deterministic_answer,
        ]);
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

/**
 * CHAOS-12306 (c5): the context clears the browser's ACR tokens through `onPartitionChanged`. The
 * web principal of c4 (user id, org id) does not change when an admin impersonates a user of the
 * same org, so the partition change is the signal.
 */
describe("onPartitionChanged (CHAOS-12306)", () => {
    const IMPERSONATING_A = "org-a\u0000user-1\u0000user-9";

    /** A store bound first to `from`; the hook records the store's state at each call. */
    function bound(from: string) {
        const seen: { generation: number; turns: number; partition: string | null }[] = [];
        const store: ConversationStore = makeStore(
            {
                onPartitionChanged: () => {
                    const snapshot = store.getSnapshot();
                    seen.push({
                        generation: snapshot.generation,
                        turns: snapshot.turns.length,
                        partition: snapshot.partition,
                    });
                },
            },
            from,
        );
        return { store, seen };
    }

    it.each([
        ["an org switch", ORG_A, ORG_B],
        ["an impersonation start", ORG_A, IMPERSONATING_A],
        ["an impersonation end", IMPERSONATING_A, ORG_A],
        ["a sign-out", ORG_A, null],
    ])("is called once, after the clear, on %s", async (_, from, to) => {
        const { store, seen } = bound(from);
        transport.scripts.push([resultEvent(PARTIAL)]);
        store.submit("Which projects are at risk?");
        await settled(store);
        const generation = store.getSnapshot().generation;
        // Not on the first bind, nor on the same key again.
        store.setPartition(from);
        expect(seen).toEqual([]);

        store.setPartition(to);
        expect(seen).toEqual([{ generation: generation + 1, turns: 0, partition: to }]);
        store.setPartition(to);
        expect(seen).toHaveLength(1);
    });

    it("is not called on the first bind, a first bind to null, or an unmount clear", () => {
        const changed = vi.fn();
        const store = new ConversationStore({ transport, onPartitionChanged: changed });
        store.setPartition(ORG_A);
        store.setPartition(ORG_A);
        store.clear("unmounted");
        expect(changed).not.toHaveBeenCalled();

        const signedOut = new ConversationStore({ transport, onPartitionChanged: changed });
        signedOut.setPartition(null);
        expect(changed).not.toHaveBeenCalled();
    });

    it("runs after the active run's transport signal is aborted", async () => {
        const aborted: boolean[] = [];
        const store = makeStore({
            onPartitionChanged: () => aborted.push(transport.calls[0]!.signal.aborted),
        });
        const gate = deferred();
        transport.scripts.push([accepted(), { wait: gate.promise }, resultEvent(PARTIAL)]);
        store.submit("Which projects are at risk?");
        await vi.waitFor(() => expect(last(store).reservedResultId).toBeDefined());
        expect(transport.calls[0]!.signal.aborted).toBe(false);

        store.setPartition(IMPERSONATING_A);
        expect(aborted).toEqual([true]);
        gate.resolve();
    });
});

describe("cancel (plan §2.7.4)", () => {
    // CHAOS-11957: Stop asks ACR's cancel endpoint first. Without the run lease ACR answers
    // `not_leased` (the fake's default), and the disconnect this tab holds is the cancel.
    it("without a lease, disconnects, says so, and drops a late answer", async () => {
        const store = makeStore();
        const gate = deferred();
        transport.scripts.push([accepted(), { wait: gate.promise }, resultEvent(PARTIAL)]);
        store.submit("Which projects are at risk?");
        await vi.waitFor(() => expect(last(store).reservedResultId).toBeDefined());

        store.cancel();
        await vi.waitFor(() => expect(transport.calls[0]!.signal.aborted).toBe(true));
        expect(transport.cancelCalls).toEqual([transport.calls[0]!.submissionId]);
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

    // codex r3 on #1639: every terminal error keeps its meaning; none falls to the generic failure.
    it.each([
        ["submission_unsaved", { kind: "unsaved" }],
        ["rate_limited", { kind: "stopped", reason: "rate_limited" }],
        ["interpretation_rejected", { kind: "stopped", reason: "interpretation_rejected" }],
        ["synthesis_rejected", { kind: "stopped", reason: "synthesis_rejected" }],
    ] as const)("ends an in-stream %s as %j, with no retry", async (code, outcome) => {
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
        expect(last(store).outcome).toEqual({
            kind: "failed",
            retry: true,
            reference: last(store).request?.request_id,
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

    // CHAOS-12201: ACR refused before anything ran. Each refusal keeps its own reason; a retry under
    // the same key is offered only where nothing was admitted and waiting can help.
    it.each([
        ["access_denied", 403, false],
        ["no_repository", 409, false],
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

    // ACR's per-call access read left too little budget before admission: main's deadline state.
    it("ends ACR's budget_exhausted (503) as the budget deadline, with no retry", async () => {
        const store = makeStore();
        transport.scripts.push([
            { fail: new TransportRefusal(503, acrError("budget_exhausted", 503, true)) },
        ]);
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(last(store).outcome).toEqual({ kind: "deadline", deadline: "budget_exhausted" });
        expect(store.retry(last(store).id)).toBe(false);
    });

    it("logs an invalid request as a defect", async () => {
        const store = makeStore();
        transport.scripts.push([
            { fail: new TransportRefusal(400, acrError("invalid_request", 400, false)) },
        ]);
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(last(store).outcome).toMatchObject({ kind: "failed", retry: false });
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

    // CHAOS-11957 (codex r3 on #1657): a stall after `accepted` now attaches to the run's events
    // and reads its status before it says so (`conversationStore.reattach.test.ts`); the other
    // reasons still end the turn at once.
    it("ends a stall after accepted as stalled once the run is gone: one attach, then the status", async () => {
        const store = makeStore();
        transport.scripts.push([accepted(), { fail: new TransportFailure("stalled") }]);
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(last(store).outcome).toEqual({ kind: "stalled" });
        expect(transport.attachCalls).toHaveLength(1);
        expect(transport.statusCalls.length).toBeGreaterThan(0);
        expect(store.retry(last(store).id)).toBe(false);
    });

    it.each([
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

    // CHAOS-12104: no ACR access in this tab, or ACR's 401: "Connect Ask Dev", never retried.
    it("ends a call that needs authorization as the connect state, without polling or retrying", async () => {
        const store = makeStore();
        transport.scripts.push([{ fail: new TransportFailure("authorization_required") }]);
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(last(store).outcome).toEqual({ kind: "connect" });
        expect(transport.calls).toHaveLength(1);
        expect(transport.statusCalls).toEqual([]);
        expect(transport.readCalls).toEqual([]);
        expect(store.retry(last(store).id)).toBe(false);
    });

    it("stops recovery at the connect state when the status read needs authorization", async () => {
        const store = makeStore();
        // The stream dropped after `accepted`: the store reads the status.
        transport.scripts.push([accepted()]);
        transport.statuses.push(new TransportFailure("authorization_required"));
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(last(store).outcome).toEqual({ kind: "connect" });
        // One read, not a poll until the deadline.
        expect(transport.statusCalls).toHaveLength(1);
    });

    it("ends at the connect state when the final replay needs authorization", async () => {
        const store = makeStore();
        transport.scripts.push([accepted()]);
        transport.statuses.push(status("done", "result_final_00000001"));
        transport.readErrors.set(
            "result_final_00000001",
            new TransportFailure("authorization_required"),
        );
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(last(store).outcome).toEqual({ kind: "connect" });
        expect(transport.readCalls).toEqual(["result_final_00000001"]);
    });

    it("ends an invalid upstream stream as another error with this turn's reference", async () => {
        const store = makeStore();
        transport.scripts.push([accepted(), { fail: new TransportFailure("invalid_upstream") }]);
        store.submit("Which projects are at risk?");
        await settled(store);
        expect(last(store).outcome).toEqual({
            kind: "failed",
            retry: false,
            reference: last(store).request?.request_id,
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
            reference: last(store).request?.request_id,
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
