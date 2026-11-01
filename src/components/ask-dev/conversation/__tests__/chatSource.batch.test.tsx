import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import type { InvestigationEvent } from "../transport";
import type {
    BatchItem,
    ChatAssistantTurn,
    ChatProgress,
    ChatSource,
} from "@full-chaos/ask-dev/render";

import { chatSourceOf, createChatSource } from "../chatSource";
import { ConversationStore } from "../conversationStore";
import { FeedbackStore } from "../feedbackStore";
import { TransportFailure, TransportRefusal } from "../transport";
import {
    accepted,
    acrError,
    captureResult,
    deferred,
    errorEvent,
    FakeTransport,
    resultEvent,
    threadTurn,
    threadView,
    type Step,
} from "./fakeTransport";

/**
 * CHAOS-12383: `askBatch` in sequence. ACR allows 2 running per principal, and web's store runs one
 * at a time, so the items go out one after the other under the seam's one call. The real store over
 * `FakeTransport`, with real captured results.
 */

const CLARIFICATION = captureResult("kiac_project_status_clarification.event.json");
const PARTIAL = captureResult("kiac_project_status_partial.event.json");
const PARENT = CLARIFICATION.result_id;
const ORG_A = "org-a\u0000user-1\u0000";
const ORG_B = "org-b\u0000user-1\u0000";
const THREAD_A = "thread_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SUB = "sub_00000000000000000000000000000001";
const QUESTION = "What is the status of the project?";

let transport: FakeTransport;

function makeSource() {
    let n = 0;
    const store = new ConversationStore({
        transport,
        hints: { read: () => null, write: () => undefined, clear: () => undefined },
        sleep: async () => undefined,
        uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    });
    store.setPartition(ORG_A);
    const feedback = new FeedbackStore({ transport });
    feedback.setPartition(ORG_A);
    return { store, feedback, source: createChatSource({ store, feedback }) };
}

const subjectItem = (receiptId: string): BatchItem => ({
    priorSubjectReceipts: [{ result_id: PARENT, receipt_id: receiptId }],
    structureBatch: {},
    chosenSubject: undefined,
    selectionEvents: [],
});
const structureItem = (receiptId: string): BatchItem => ({
    priorSubjectReceipts: [],
    structureBatch: { subject_candidate: { result_id: PARENT, receipt_id: receiptId } },
    chosenSubject: undefined,
    selectionEvents: [],
});

const assistants = (source: ChatSource) =>
    source
        .getSnapshot()
        .turns.filter((turn): turn is ChatAssistantTurn => turn.role === "assistant");
const progressOf = (turn: ChatAssistantTurn | undefined): ChatProgress | undefined =>
    turn?.outcome.kind === "pending" ? turn.outcome.progress : undefined;
const queued = (source: ChatSource) =>
    assistants(source).filter((turn) => progressOf(turn)?.phase === "queued");
/** Whether the render would hold the composer: any assistant turn pending. */
const held = (source: ChatSource) =>
    assistants(source).some((turn) => turn.outcome.kind === "pending");

/** A stream held open until `resolve`, then answered. */
function gated(result = PARTIAL) {
    const gate = deferred();
    const script: Step[] = [accepted(), { wait: gate.promise }, resultEvent(result)];
    return { gate, script };
}

/** A conversation whose latest turn is the clarification the batch answers. */
async function clarified(made: ReturnType<typeof makeSource>) {
    transport.scripts.push([accepted(), resultEvent(CLARIFICATION)]);
    await made.source.ask(QUESTION);
    return assistants(made.source).at(-1)!;
}

const investigations = () => transport.calls.length;

beforeEach(() => {
    transport = new FakeTransport();
    vi.clearAllMocks();
});

const BUDGET_REFUSAL = JSON.parse(
    readFileSync(
        join(
            process.cwd(),
            "tests/fixtures/ask-dev/captures/acr_encoder_budget_refusal_evidence_window.event.json",
        ),
        "utf8",
    ),
) as InvestigationEvent;

describe("order", () => {
    it("runs the items in order, one at a time, each under the same parent", async () => {
        const made = makeSource();
        const { source, store } = made;
        await clarified(made);
        const [one, two, three] = [gated(), gated(), gated()];
        transport.scripts.push(one.script, two.script, three.script);

        source.askBatch(
            [subjectItem("subject-a"), subjectItem("subject-b"), structureItem("candidate-c")],
            QUESTION,
        );
        expect(investigations()).toBe(2);
        await vi.waitFor(() =>
            expect(store.getSnapshot().turns.at(-1)!.reservedResultId).toBeDefined(),
        );
        expect(investigations()).toBe(2);

        one.gate.resolve();
        await vi.waitFor(() => expect(investigations()).toBe(3));
        two.gate.resolve();
        await vi.waitFor(() => expect(investigations()).toBe(4));
        three.gate.resolve();
        await vi.waitFor(() => expect(store.getSnapshot().inFlight).toBe(false));

        const requests = transport.calls.slice(1).map((call) => call.request);
        expect(requests.map((request) => request.parent_result_id)).toEqual([
            PARENT,
            PARENT,
            PARENT,
        ]);
        expect(requests.map((request) => request.question)).toEqual([QUESTION, QUESTION, QUESTION]);
        expect(requests[0]!.prior_subject_receipts).toEqual([
            { result_id: PARENT, receipt_id: "subject-a" },
        ]);
        expect(requests[1]!.prior_subject_receipts).toEqual([
            { result_id: PARENT, receipt_id: "subject-b" },
        ]);
        expect(requests[2]!.prior_candidate_receipts).toEqual([
            { result_id: PARENT, receipt_id: "candidate-c" },
        ]);
        // Every item is its own submission on the one thread.
        expect(new Set(transport.calls.map((call) => call.submissionId)).size).toBe(4);
        expect(new Set(transport.calls.map((call) => call.threadId)).size).toBe(1);
    });

    it("the pending items go in the order they were given, each with its chosen subject", async () => {
        const made = makeSource();
        const { source, store } = made;
        await clarified(made);
        const subject = { kind: "project", canonical_id: "project:b", label: "B" } as never;
        const first = gated();
        transport.scripts.push(first.script, [accepted(), resultEvent(PARTIAL)]);
        source.askBatch(
            [subjectItem("subject-a"), { ...subjectItem("subject-b"), chosenSubject: subject }],
            QUESTION,
        );
        first.gate.resolve();
        await vi.waitFor(() => expect(investigations()).toBe(3));
        await vi.waitFor(() => expect(store.getSnapshot().inFlight).toBe(false));
        expect(assistants(source).at(-1)!.chosenSubject).toBe(subject);
        expect(assistants(source).at(-2)!.chosenSubject).toBeUndefined();
    });

    it("an empty batch does nothing", async () => {
        const { source } = makeSource();
        const before = source.getSnapshot();
        source.askBatch([], QUESTION);
        expect(investigations()).toBe(0);
        expect(source.getSnapshot()).toBe(before);
    });
});

describe("the progress it publishes", () => {
    it("shows every item at once: the running one and the queued ones, each with its place", async () => {
        const made = makeSource();
        const { source } = made;
        const clarification = await clarified(made);
        transport.scripts.push(gated().script);

        source.askBatch(
            [subjectItem("subject-a"), subjectItem("subject-b"), subjectItem("subject-c")],
            QUESTION,
        );
        const after = assistants(source).filter((turn) => turn.id !== clarification.id);
        expect(after.map((turn) => progressOf(turn))).toEqual([
            expect.objectContaining({ phase: "running", batch: { position: 1, total: 3 } }),
            { phase: "queued", batch: { position: 2, total: 3 } },
            { phase: "queued", batch: { position: 3, total: 3 } },
        ]);
    });

    it("a queued turn already holds its chosen subject", async () => {
        const made = makeSource();
        const { source } = made;
        await clarified(made);
        transport.scripts.push(gated().script);
        const subject = { kind: "project", canonical_id: "project:b", label: "B" } as never;
        source.askBatch(
            [subjectItem("subject-a"), { ...subjectItem("subject-b"), chosenSubject: subject }],
            QUESTION,
        );
        expect(queued(source)[0]!.chosenSubject).toBe(subject);
    });

    it("a queued turn asks silently, with no retry, under the hidden question", async () => {
        const made = makeSource();
        const { source } = made;
        await clarified(made);
        transport.scripts.push(gated().script);
        source.askBatch([subjectItem("subject-a"), subjectItem("subject-b")], QUESTION);
        const turns = source.getSnapshot().turns;
        const assistant = turns.at(-1) as ChatAssistantTurn;
        expect(turns.at(-2)).toMatchObject({ role: "user", question: QUESTION, showBubble: false });
        expect(assistant.retryQuestion).toBeUndefined();
        expect(assistant.rootQuestion).toBeUndefined();
    });

    it("queued ids never meet a store id, and hold until the item starts", async () => {
        const made = makeSource();
        const { source, store } = made;
        await clarified(made);
        const [one, two] = [gated(), gated()];
        transport.scripts.push(one.script, two.script, gated().script);
        source.askBatch(
            [subjectItem("subject-a"), subjectItem("subject-b"), subjectItem("subject-c")],
            QUESTION,
        );
        const storeIds = () =>
            store.getSnapshot().turns.flatMap((turn) => [turn.id * 2, turn.id * 2 + 1]);
        const ids = source.getSnapshot().turns.map((turn) => turn.id);
        expect(new Set(ids).size).toBe(ids.length);
        const queuedIds = queued(source).map((turn) => turn.id);
        for (const id of queuedIds) expect(storeIds()).not.toContain(id);
        // Negative from the first item on: a store id never is, however many turns come later.
        expect(ids.filter((id) => !storeIds().includes(id)).every((id) => id < 0)).toBe(true);

        // A stage of the running item changes the snapshot, and no queued id.
        await vi.waitFor(() =>
            expect(store.getSnapshot().turns.at(-1)!.reservedResultId).toBeDefined(),
        );
        expect(queued(source).map((turn) => turn.id)).toEqual(queuedIds);

        one.gate.resolve();
        await vi.waitFor(() => expect(investigations()).toBe(3));
        // The third item keeps its id while the second runs.
        expect(queued(source).map((turn) => turn.id)).toEqual(queuedIds.slice(1));
        expect(progressOf(queued(source)[0])?.batch).toEqual({ position: 3, total: 3 });
    });

    it("the place stays on the running item as it moves on, and is gone once it ends", async () => {
        const made = makeSource();
        const { source, store } = made;
        await clarified(made);
        const one = gated();
        transport.scripts.push(one.script, [accepted(), resultEvent(PARTIAL)]);
        source.askBatch([subjectItem("subject-a"), subjectItem("subject-b")], QUESTION);
        one.gate.resolve();
        await vi.waitFor(() => expect(store.getSnapshot().inFlight).toBe(false));
        expect(assistants(source).at(-1)!.outcome.kind).toBe("answered");
        expect(assistants(source).at(-2)!.outcome.kind).toBe("answered");
        expect(queued(source)).toEqual([]);
    });

    it("records what the superseded turn submitted, once, in the update that adds the items", async () => {
        const made = makeSource();
        const { source } = made;
        const clarification = await clarified(made);
        transport.scripts.push(gated().script);
        const seen: boolean[] = [];
        source.subscribe(() => {
            const old = assistants(source).find((turn) => turn.id === clarification.id);
            seen.push(old?.submittedCandidateReceiptIds !== undefined);
        });
        source.askBatch([subjectItem("subject-a"), subjectItem("subject-b")], QUESTION, {
            turnId: clarification.id,
            submittedStructureBatch: {},
            submittedCandidateReceiptIds: new Set(["subject-a", "subject-b"]),
            submittedStructureCandidateReceiptIds: new Set(),
        });
        expect(seen[0]).toBe(true);
        expect(assistants(source)[0]!.submittedCandidateReceiptIds).toEqual(
            new Set(["subject-a", "subject-b"]),
        );
    });
});

// The lead's rule on CHAOS-12383: a batch must not bias item 2 with item 1. In sequence, every item
// still sends what a parallel fan-out would.
describe("every item is asked as of the turn being answered", () => {
    /** Three items, each answered with a result of its own. */
    async function ran() {
        const made = makeSource();
        await clarified(made);
        const answers = ["a", "b"].map((name) => ({
            ...PARTIAL,
            result_id: `result_item_${name}_000001`,
            deterministic_answer: `The answer of item ${name}.`,
            subject_resolution: {
                ...PARTIAL.subject_resolution,
                committed: PARTIAL.subject_resolution.committed.map((subject) => ({
                    ...subject,
                    canonical_id: `project:item-${name}`,
                })),
            },
        }));
        transport.scripts.push(
            [accepted(), resultEvent(answers[0]!)],
            [accepted(), resultEvent(answers[1]!)],
            [accepted(), resultEvent(PARTIAL)],
        );
        made.source.askBatch(
            [subjectItem("subject-a"), subjectItem("subject-b"), subjectItem("subject-c")],
            QUESTION,
        );
        await vi.waitFor(() => expect(investigations()).toBe(4));
        await vi.waitFor(() => expect(made.store.getSnapshot().inFlight).toBe(false));
        return transport.calls.slice(1).map((call) => call.request);
    }

    it("item 2's request holds no trace of item 1: not its subjects, hints, turn or answer", async () => {
        const [, second, third] = await ran();
        for (const request of [second!, third!]) {
            const bytes = JSON.stringify(request);
            expect(bytes).not.toContain("result_item_a_000001");
            expect(bytes).not.toContain("project:item-a");
            expect(bytes).not.toContain("The answer of item a.");
        }
        expect(JSON.stringify(third!)).not.toContain("project:item-b");
        expect(JSON.stringify(third!)).not.toContain("The answer of item b.");
    });

    it("every item equals item 1 in the conversation, the parent and the hints", async () => {
        const [first, second, third] = await ran();
        for (const request of [second!, third!]) {
            expect(request.conversation).toEqual(first!.conversation);
            expect(request.parent_result_id).toBe(first!.parent_result_id);
            expect(request.requested_scope).toEqual(first!.requested_scope);
        }
        expect(first!.parent_result_id).toBe(PARENT);
        expect(first!.conversation?.map((turn) => turn.role)).toEqual(["user", "assistant"]);
    });

    it("the turn is the one being answered: the newest, with all that came before it", async () => {
        const made = makeSource();
        const { source } = made;
        transport.scripts.push([accepted(), resultEvent(PARTIAL)]);
        await source.ask("A first question");
        await clarified(made);
        transport.scripts.push(
            [accepted(), resultEvent(PARTIAL)],
            [accepted(), resultEvent(PARTIAL)],
        );
        source.askBatch([subjectItem("subject-a"), subjectItem("subject-b")], QUESTION);
        await vi.waitFor(() => expect(investigations()).toBe(4));
        await vi.waitFor(() => expect(made.store.getSnapshot().inFlight).toBe(false));
        for (const call of transport.calls.slice(2)) {
            expect(call.request.conversation?.map((turn) => turn.role)).toEqual([
                "user",
                "assistant",
                "user",
                "assistant",
            ]);
        }
    });

    it("the page hints are the ones of the moment the batch was asked", async () => {
        const made = makeSource();
        const { source } = made;
        const hint = (id: string) => ({ kind: "team", id, label: id }) as const;
        const base = { notSaved: false, partition: ORG_A, removePageRef: () => undefined };
        source.setHostInputs({ ...base, pageRefs: [hint("team-1")] });
        await clarified(made);
        const first = gated();
        transport.scripts.push(first.script, [accepted(), resultEvent(PARTIAL)]);
        source.askBatch([subjectItem("subject-a"), subjectItem("subject-b")], QUESTION);
        source.setHostInputs({ ...base, pageRefs: [hint("team-2")] });
        first.gate.resolve();
        await vi.waitFor(() => expect(investigations()).toBe(3));
        for (const call of transport.calls.slice(1)) {
            expect(call.request.requested_scope?.subject_hints?.map((sent) => sent.id)).toEqual([
                "team-1",
            ]);
        }
    });
});

describe("the composer between items", () => {
    it("never opens: every update until the last holds a pending turn, and the store is in flight", async () => {
        const made = makeSource();
        const { source, store } = made;
        await clarified(made);
        transport.scripts.push(
            [accepted(), resultEvent(PARTIAL)],
            [accepted(), resultEvent(PARTIAL)],
            [accepted(), resultEvent(PARTIAL)],
        );
        const open: boolean[] = [];
        source.subscribe(() => {
            if (!held(source)) open.push(store.getSnapshot().turns.length === 4);
        });
        source.askBatch(
            [subjectItem("subject-a"), subjectItem("subject-b"), subjectItem("subject-c")],
            QUESTION,
        );
        await vi.waitFor(() => expect(store.getSnapshot().turns).toHaveLength(4));
        await vi.waitFor(() => expect(store.getSnapshot().inFlight).toBe(false));
        // The composer opened only once: after the last item.
        expect(open.every(Boolean)).toBe(true);
    });

    it("the next item is submitted in the tick the previous one ended", async () => {
        const made = makeSource();
        const { source, store } = made;
        await clarified(made);
        const one = gated();
        transport.scripts.push(one.script, gated().script);
        source.askBatch([subjectItem("subject-a"), subjectItem("subject-b")], QUESTION);
        await vi.waitFor(() =>
            expect(store.getSnapshot().turns.at(-1)!.reservedResultId).toBeDefined(),
        );

        // A store listener added now runs after the source's: by then the next item is out.
        const inFlightAfterTheEnd: boolean[] = [];
        store.subscribe(() => {
            const first = store.getSnapshot().turns[1];
            if (first?.outcome.kind === "answered") {
                inFlightAfterTheEnd.push(store.getSnapshot().inFlight);
            }
        });
        one.gate.resolve();
        await vi.waitFor(() => expect(investigations()).toBe(3));
        expect(inFlightAfterTheEnd.length).toBeGreaterThan(0);
        expect(inFlightAfterTheEnd.every(Boolean)).toBe(true);
    });

    it("ask refuses while a batch holds the conversation", async () => {
        const made = makeSource();
        const { source } = made;
        await clarified(made);
        transport.scripts.push(gated().script);
        source.askBatch([subjectItem("subject-a"), subjectItem("subject-b")], QUESTION);
        await expect(source.ask("Something else")).resolves.toBe(false);
        expect(investigations()).toBe(2);
    });
});

describe("a plain failed item does not stop the batch", () => {
    it.each<[string, Step[]]>([
        ["a generic failure", [accepted(), errorEvent("internal_error")]],
        // Too large for one item says nothing of the next: a parallel fan-out would run it too.
        ["a budget refusal", [accepted(), BUDGET_REFUSAL]],
        [
            "a concurrency limit",
            [{ fail: new TransportRefusal(429, acrError("concurrency_limited", 429, true), 3) }],
        ],
    ])("%s", async (_, failing) => {
        const made = makeSource();
        const { source, store } = made;
        await clarified(made);
        transport.scripts.push(failing, [accepted(), resultEvent(PARTIAL)]);
        source.askBatch([subjectItem("subject-a"), subjectItem("subject-b")], QUESTION);
        await vi.waitFor(() => expect(investigations()).toBe(3));
        await vi.waitFor(() => expect(store.getSnapshot().inFlight).toBe(false));
        expect(assistants(source).at(-2)!.outcome.kind).not.toBe("pending");
        expect(assistants(source).at(-1)!.outcome.kind).toBe("answered");
    });
});

describe("what drops the queue", () => {
    async function running() {
        const made = makeSource();
        await clarified(made);
        const first = gated();
        transport.scripts.push(first.script, gated().script);
        made.source.askBatch(
            [subjectItem("subject-a"), subjectItem("subject-b"), subjectItem("subject-c")],
            QUESTION,
        );
        await vi.waitFor(() =>
            expect(made.store.getSnapshot().turns.at(-1)!.reservedResultId).toBeDefined(),
        );
        expect(queued(made.source)).toHaveLength(2);
        return { ...made, first };
    }

    /** Lets the store finish what the drop left running; nothing further may go out. */
    async function nothingMoreGoesOut(sent: number, end?: () => void) {
        end?.();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(investigations()).toBe(sent);
    }

    it("Stop, here", async () => {
        const { source, first } = await running();
        transport.cancelAnswers.push({ kind: "running" });
        source.stop?.();
        expect(queued(source)).toEqual([]);
        expect(progressOf(assistants(source).at(-1))?.batch).toBeUndefined();
        await nothingMoreGoesOut(2, () => first.gate.resolve());
    });

    it("Stop from the panel: the store's cancel, with this page gone", async () => {
        const { source, store, first } = await running();
        transport.cancelAnswers.push({ kind: "running" });
        store.cancel();
        await vi.waitFor(() => expect(queued(source)).toEqual([]));
        await nothingMoreGoesOut(2, () => first.gate.resolve());
    });

    it("a run that ends canceled", async () => {
        const made = makeSource();
        const { source, store } = made;
        await clarified(made);
        transport.scripts.push([accepted(), errorEvent("canceled")], gated().script);
        source.askBatch([subjectItem("subject-a"), subjectItem("subject-b")], QUESTION);
        await vi.waitFor(() => expect(store.getSnapshot().inFlight).toBe(false));
        expect(queued(source)).toEqual([]);
        await nothingMoreGoesOut(2);
    });

    it("a new conversation", async () => {
        const { source, first } = await running();
        source.newConversation();
        expect(source.getSnapshot().turns).toEqual([]);
        await nothingMoreGoesOut(2, () => first.gate.resolve());
    });

    it("a selection change", async () => {
        const { source, store, first } = await running();
        transport.threads.set(THREAD_A, threadView(THREAD_A, []));
        store.selectThread(THREAD_A, "local");
        expect(source.getSnapshot().turns).toEqual([]);
        await nothingMoreGoesOut(2, () => first.gate.resolve());
    });

    it("a clear", async () => {
        const { source, store, first } = await running();
        store.clear("unmounted");
        expect(source.getSnapshot().turns).toEqual([]);
        await nothingMoreGoesOut(2, () => first.gate.resolve());
    });

    it("a partition change", async () => {
        const { source, store, first } = await running();
        store.setPartition(ORG_B);
        expect(source.getSnapshot().turns).toEqual([]);
        await nothingMoreGoesOut(2, () => first.gate.resolve());
    });

    const hostAt = (partition: string | null | undefined) => ({
        notSaved: false,
        partition,
        pageRefs: [],
        removePageRef: () => undefined,
    });

    it("the session moving, before the store rebinds: no next item under the old partition", async () => {
        const { source, first } = await running();

        source.setHostInputs(hostAt(ORG_B));

        expect(queued(source)).toEqual([]);
        await nothingMoreGoesOut(2, () => first.gate.resolve());
    });

    it("a session that reports its own partition, or is loading, keeps the queue", async () => {
        const { source } = await running();

        source.setHostInputs(hostAt(ORG_A));
        source.setHostInputs(hostAt(undefined));

        expect(queued(source)).toHaveLength(2);
    });

    it("an item that ends in connect", async () => {
        const made = makeSource();
        const { source, store } = made;
        await clarified(made);
        transport.scripts.push(
            [{ fail: new TransportFailure("authorization_required") }],
            gated().script,
        );
        source.askBatch([subjectItem("subject-a"), subjectItem("subject-b")], QUESTION);
        await vi.waitFor(() => expect(store.getSnapshot().inFlight).toBe(false));
        expect(assistants(source).at(-1)!.outcome).toMatchObject({ status: { kind: "connect" } });
        expect(queued(source)).toEqual([]);
        await nothingMoreGoesOut(2);
    });

    it("an item that ends in thread_closed", async () => {
        const made = makeSource();
        const { source, store } = made;
        await clarified(made);
        transport.scripts.push([accepted(), errorEvent("thread_closed")], gated().script);
        source.askBatch([subjectItem("subject-a"), subjectItem("subject-b")], QUESTION);
        await vi.waitFor(() => expect(store.getSnapshot().inFlight).toBe(false));
        expect(assistants(source).at(-1)!.outcome).toMatchObject({
            status: { kind: "thread_closed" },
        });
        expect(queued(source)).toEqual([]);
        await nothingMoreGoesOut(2);
    });

    it.each([
        ["an organization above its limit", 503, "upstream_unavailable"],
        ["no repository in scope", 409, "no_repository"],
        ["not entitled", 403, "feature_not_enabled"],
        ["access denied", 403, "access_denied"],
    ] as const)("an item refused for the whole viewer: %s", async (_name, status, code) => {
        const made = makeSource();
        const { source, store } = made;
        await clarified(made);
        transport.scripts.push(
            [{ fail: new TransportRefusal(status, acrError(code, status, false)) }],
            gated().script,
        );
        source.askBatch([subjectItem("subject-a"), subjectItem("subject-b")], QUESTION);
        await vi.waitFor(() => expect(store.getSnapshot().inFlight).toBe(false));
        expect(queued(source)).toEqual([]);
        await nothingMoreGoesOut(2);
    });

    it("an item refused for itself: a forbidden repository does not stop the next", async () => {
        const made = makeSource();
        const { source, store } = made;
        await clarified(made);
        transport.scripts.push(
            [{ fail: new TransportRefusal(403, acrError("repo_forbidden", 403, false)) }],
            [accepted(), resultEvent(PARTIAL)],
        );
        source.askBatch([subjectItem("subject-a"), subjectItem("subject-b")], QUESTION);
        await vi.waitFor(() => expect(transport.calls).toHaveLength(3));
        await vi.waitFor(() => expect(store.getSnapshot().inFlight).toBe(false));
    });

    it("the first item refused: nothing is published, and nothing recorded", async () => {
        const made = makeSource();
        const { source, store } = made;
        const clarification = await clarified(made);
        store.setPartition(null);
        const before = source.getSnapshot();
        source.askBatch([subjectItem("subject-a"), subjectItem("subject-b")], QUESTION, {
            turnId: clarification.id,
            submittedStructureBatch: {},
            submittedCandidateReceiptIds: new Set(["subject-a"]),
            submittedStructureCandidateReceiptIds: new Set(),
        });
        expect(source.getSnapshot()).toBe(before);
        expect(investigations()).toBe(1);
    });

    it("a later item refused: the rest go, and the composer opens", async () => {
        const made = makeSource();
        const { source, store, first } = {
            ...made,
            first: gated(),
        };
        // The thread closes under the batch: a refused submit, with no outcome of its own.
        await clarified(made);
        transport.scripts.push(first.script, gated().script);
        source.askBatch(
            [subjectItem("subject-a"), subjectItem("subject-b"), subjectItem("subject-c")],
            QUESTION,
        );
        await vi.waitFor(() =>
            expect(store.getSnapshot().turns.at(-1)!.reservedResultId).toBeDefined(),
        );
        const submit = vi.spyOn(store, "submit").mockReturnValue(false);
        first.gate.resolve();
        await vi.waitFor(() => expect(store.getSnapshot().inFlight).toBe(false));
        expect(submit).toHaveBeenCalledTimes(1);
        expect(queued(source)).toEqual([]);
        expect(held(source)).toBe(false);
    });
});

describe("it belongs to the store, not the page", () => {
    it("one source per store", () => {
        const { store, feedback } = makeSource();
        expect(chatSourceOf(store, feedback)).toBe(chatSourceOf(store, feedback));
    });

    it("keeps running when the viewer leaves for the panel: nothing is mounted", async () => {
        const made = makeSource();
        const { store, feedback } = made;
        const source = chatSourceOf(store, feedback);
        await clarified({ ...made, source });
        const one = gated();
        transport.scripts.push(one.script, [accepted(), resultEvent(PARTIAL)]);
        const { unmount } = renderHook(() => source.getSnapshot());
        const off = source.subscribe(() => undefined);
        source.askBatch([subjectItem("subject-a"), subjectItem("subject-b")], QUESTION);
        // The page goes: no listener of the source is left.
        off();
        unmount();
        one.gate.resolve();
        await vi.waitFor(() => expect(investigations()).toBe(3));
        await vi.waitFor(() => expect(store.getSnapshot().inFlight).toBe(false));
    });
});

describe("a restored conversation", () => {
    it("runs its batch on the same thread, from the turn the receipts came from", async () => {
        const { store, source } = makeSource();
        transport.results.set(CLARIFICATION.result_id, CLARIFICATION);
        transport.threads.set(
            THREAD_A,
            threadView(THREAD_A, [threadTurn(SUB, "done", { resultId: CLARIFICATION.result_id })]),
        );
        store.selectThread(THREAD_A, "local");
        await vi.waitFor(() => expect(store.getSnapshot().thread.kind).toBe("loaded"));
        transport.scripts.push(
            [accepted(), resultEvent(PARTIAL)],
            [accepted(), resultEvent(PARTIAL)],
        );
        source.askBatch([subjectItem("subject-a"), subjectItem("subject-b")], QUESTION);
        await vi.waitFor(() => expect(transport.calls).toHaveLength(2));
        await vi.waitFor(() => expect(store.getSnapshot().inFlight).toBe(false));
        expect(transport.calls.map((call) => call.threadId)).toEqual([THREAD_A, THREAD_A]);
    });
});
