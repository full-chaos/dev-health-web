import { beforeEach, describe, expect, it, vi } from "vitest";

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: log }));

import type { TranscriptResult } from "@/lib/ask-dev/transcript";
import { ConversationStore, type HintStorage } from "../conversationStore";
import { FeedbackStore } from "../feedbackStore";
import { TransportRefusal } from "../transport";
import type { InvestigationEvent } from "../transport";
import {
    accepted,
    acrError,
    captureResult,
    FakeTransport,
    status,
    summary,
    threadTurn,
    threadView,
} from "./fakeTransport";

/**
 * CHAOS-12439: ACR's 409 `no_repository` (the viewer's grant within the live repository inventory
 * is empty) on every call after the create. Reading again cannot help, so nothing offers a retry.
 * The body is the schema-valid `error.v1` shape of `acrError`: web vendors no
 * `error_context_fabric_no_repository.v1.json` example.
 */

const PARTIAL = captureResult("kiac_project_status_partial.event.json");
const ORG_A = "org-a\u0000user-1\u0000";
const THREAD_A = "thread_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SUB = "sub_00000000000000000000000000000001";
const RESERVED = "result_reserved_0001";
const R1 = "result_000000000001";
const START = Date.parse("2026-10-31T12:00:00Z");

const noRepository = () => new TransportRefusal(409, acrError("no_repository", 409, false));
/** Another 409 on the same routes: it keeps today's path. */
const inProgress = () => new TransportRefusal(409, acrError("submission_in_progress", 409, true));

let transport: FakeTransport;
let clock: number;
let stored: string | null;
const hints: HintStorage = {
    read: () => stored,
    write: (value) => {
        stored = value;
    },
    clear: () => {
        stored = null;
    },
};

function makeStore(): ConversationStore {
    let n = 0;
    const store = new ConversationStore({
        transport,
        hints,
        now: () => clock,
        sleep: async (ms) => {
            clock += ms;
        },
        uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    });
    store.setPartition(ORG_A);
    return store;
}

const snap = (store: ConversationStore) => store.getSnapshot();
const lastTurn = (store: ConversationStore) => snap(store).turns.at(-1)!;
const kind = (store: ConversationStore) => lastTurn(store).outcome.kind;
const flush = async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

const accepted0 = (): InvestigationEvent => ({
    seq: 1,
    request_id: "request_run",
    type: "accepted",
    reserved_result_id: RESERVED,
    started_at: "2026-10-31T12:00:00Z",
    budget_seconds: 110,
});
const beat = (seq: number): InvestigationEvent => ({
    seq,
    request_id: "request_run",
    type: "heartbeat",
    elapsed_ms: 500,
});
const answer = (n: number): TranscriptResult => ({
    ...PARTIAL,
    result_id: `result_${String(n).padStart(12, "0")}`,
});

/** A live run whose stream drops after `accepted`; the default attach is ACR's 410, so it reads the status. */
async function droppedRun(store: ConversationStore) {
    transport.scripts.push([accepted0(), beat(2)]);
    store.submit("Which projects are at risk?");
    await vi.waitFor(() => expect(transport.attachCalls.length).toBeGreaterThan(0));
}

beforeEach(() => {
    transport = new FakeTransport();
    clock = START;
    stored = null;
    vi.clearAllMocks();
});

describe("listThreads", () => {
    it("first page: no_repository, no rows, no cursor, and no retry state", async () => {
        transport.listPages.push({ fail: noRepository() });
        const store = makeStore();
        store.loadHistory();
        await vi.waitFor(() => expect(snap(store).history.status).toBe("no_repository"));
        expect(snap(store).history).toMatchObject({
            threads: [],
            nextCursor: null,
            loadingMore: false,
            moreFailed: false,
        });
        expect(transport.listCalls).toEqual([undefined]);
    });

    it("a later page: the same, not moreFailed (the scope has gone)", async () => {
        transport.listPages.push(
            { threads: [summary(THREAD_A)], nextCursor: "cursor-2" },
            { fail: noRepository() },
        );
        const store = makeStore();
        store.loadHistory();
        await vi.waitFor(() => expect(snap(store).history.status).toBe("ready"));
        store.loadMoreHistory();
        await vi.waitFor(() => expect(snap(store).history.status).toBe("no_repository"));
        expect(snap(store).history).toMatchObject({
            threads: [],
            nextCursor: null,
            loadingMore: false,
            moreFailed: false,
        });
    });

    it("another 409 keeps today's path: read_failed first page, moreFailed later", async () => {
        transport.listPages.push({ fail: inProgress() });
        const store = makeStore();
        store.loadHistory();
        await vi.waitFor(() => expect(snap(store).history.status).toBe("read_failed"));

        transport.listPages.length = 0;
        transport.listPages.push(
            { threads: [summary(THREAD_A)], nextCursor: "cursor-2" },
            { fail: inProgress() },
        );
        store.loadHistory();
        await vi.waitFor(() => expect(snap(store).history.status).toBe("ready"));
        store.loadMoreHistory();
        await vi.waitFor(() => expect(snap(store).history.moreFailed).toBe(true));
        expect(snap(store).history.status).toBe("ready");
    });
});

describe("readThread", () => {
    it("first page: unavailable, not read_failed", async () => {
        transport.threads.set(THREAD_A, { fail: noRepository() });
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await vi.waitFor(() => expect(snap(store).thread.kind).toBe("unavailable"));
        expect(transport.threadCalls).toHaveLength(1);
        expect(snap(store).turns).toEqual([]);
    });

    it("an earlier page: unavailable, not earlier: failed", async () => {
        transport.threads.set(
            THREAD_A,
            threadView(THREAD_A, [threadTurn(SUB, "done_unsaved")], "cursor-1"),
        );
        transport.threads.set(`${THREAD_A}|cursor-1`, { fail: noRepository() });
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await vi.waitFor(() => expect(snap(store).thread.kind).toBe("loaded"));
        store.loadEarlierTurns();
        await vi.waitFor(() => expect(snap(store).thread.kind).toBe("unavailable"));
        expect(snap(store).threadId).toBeNull();
        expect(snap(store).turns).toEqual([]);
        expect(snap(store).inFlight).toBe(false);
    });

    it("an earlier page while a restored run is observed: the observation ends too", async () => {
        transport.threads.set(
            THREAD_A,
            threadView(THREAD_A, [threadTurn(SUB, "running")], "cursor-1"),
        );
        transport.threads.set(`${THREAD_A}|cursor-1`, { fail: noRepository() });
        transport.attachScripts.push([{ wait: new Promise(() => undefined) }]);
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await vi.waitFor(() => expect(snap(store).thread.kind).toBe("loaded"));
        await vi.waitFor(() => expect(transport.attachCalls).toHaveLength(1));
        expect(snap(store).inFlight).toBe(true);

        store.loadEarlierTurns();
        await vi.waitFor(() => expect(snap(store).thread.kind).toBe("unavailable"));
        expect(snap(store).threadId).toBeNull();
        expect(snap(store).turns).toEqual([]);
        expect(snap(store).inFlight).toBe(false);
        expect(transport.attachCalls[0]!.signal.aborted).toBe(true);
    });

    it("another 409 keeps today's path: read_failed, and earlier: failed", async () => {
        transport.threads.set(THREAD_A, { fail: inProgress() });
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await vi.waitFor(() => expect(snap(store).thread.kind).toBe("read_failed"));

        transport.threads.set(
            THREAD_A,
            threadView(THREAD_A, [threadTurn(SUB, "done_unsaved")], "cursor-1"),
        );
        transport.threads.set(`${THREAD_A}|cursor-1`, { fail: inProgress() });
        store.newConversation();
        store.selectThread(THREAD_A, "incoming");
        await vi.waitFor(() => expect(snap(store).thread.kind).toBe("loaded"));
        store.loadEarlierTurns();
        await vi.waitFor(() =>
            expect(snap(store).thread).toEqual({ kind: "loaded", earlier: "failed" }),
        );
    });
});

describe("readResult", () => {
    it("a restored answer: unavailable, the path a 404 takes", async () => {
        transport.threads.set(
            THREAD_A,
            threadView(THREAD_A, [threadTurn(SUB, "done", { resultId: R1 })]),
        );
        transport.readErrors.set(R1, noRepository());
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await vi.waitFor(() => expect(kind(store)).toBe("unavailable"));
        expect(transport.readCalls).toEqual([R1]);
    });

    it("a live run's replay: unavailable, not a retry", async () => {
        transport.statuses.push(status("done", R1));
        transport.readErrors.set(R1, noRepository());
        const store = makeStore();
        await droppedRun(store);
        await vi.waitFor(() => expect(kind(store)).toBe("unavailable"));
        expect(transport.readCalls).toEqual([R1]);
    });

    it("another 409 keeps today's path: restore_failed, and a retry after a live replay", async () => {
        transport.threads.set(
            THREAD_A,
            threadView(THREAD_A, [threadTurn(SUB, "done", { resultId: R1 })]),
        );
        transport.readErrors.set(R1, inProgress());
        const restored = makeStore();
        restored.selectThread(THREAD_A, "incoming");
        await vi.waitFor(() => expect(kind(restored)).toBe("restore_failed"));

        transport.statuses.length = 0;
        transport.statuses.push(status("done", R1));
        const live = makeStore();
        await droppedRun(live);
        await vi.waitFor(() => expect(kind(live)).toBe("failed"));
        expect(lastTurn(live).outcome).toMatchObject({ kind: "failed", retry: true });
    });
});

describe("submissionStatus", () => {
    it("recover loop (after attach is refused): one poll, then unavailable", async () => {
        transport.statuses.push(noRepository());
        const store = makeStore();
        await droppedRun(store);
        await vi.waitFor(() => expect(kind(store)).toBe("unavailable"));
        expect(transport.statusCalls).toHaveLength(1);
        expect(snap(store).inFlight).toBe(false);
    });

    it("observe loop (a restored running turn): one poll, then unavailable", async () => {
        transport.threads.set(THREAD_A, threadView(THREAD_A, [threadTurn(SUB, "running")]));
        transport.statuses.push(noRepository());
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await vi.waitFor(() => expect(kind(store)).toBe("unavailable"));
        expect(transport.attachCalls.length).toBeGreaterThan(0);
        expect(transport.statusCalls).toEqual([SUB]);
    });

    it("another 409 keeps polling in both loops", async () => {
        transport.statuses.push(inProgress(), status("abandoned"));
        const live = makeStore();
        await droppedRun(live);
        await vi.waitFor(() => expect(kind(live)).toBe("interrupted"));
        expect(transport.statusCalls).toHaveLength(2);

        transport.statusCalls.length = 0;
        transport.statuses.length = 0;
        transport.statuses.push(inProgress(), status("abandoned"));
        transport.threads.set(THREAD_A, threadView(THREAD_A, [threadTurn(SUB, "running")]));
        const observed = makeStore();
        observed.selectThread(THREAD_A, "incoming");
        await vi.waitFor(() => expect(kind(observed)).toBe("interrupted"));
        expect(transport.statusCalls).toHaveLength(2);
    });
});

describe("deleteThread, cancel", () => {
    it("deleteThread: the row stays and the delete failure shows (unchanged)", async () => {
        transport.listPages.push({ threads: [summary(THREAD_A)], nextCursor: null });
        transport.deleteFails = noRepository();
        const store = makeStore();
        store.loadHistory();
        await vi.waitFor(() => expect(snap(store).history.status).toBe("ready"));
        store.deleteThread(THREAD_A);
        await vi.waitFor(() => expect(snap(store).history.deleteFailed).toBe(THREAD_A));
        expect(snap(store).history.threads.map((row) => row.threadId)).toEqual([THREAD_A]);
        expect(snap(store).history.deleting).toEqual([]);
    });

    it("cancel: Stop stays, the run goes on (unchanged)", async () => {
        transport.cancelAnswers.push({ fail: noRepository() });
        transport.scripts.push([accepted(RESERVED), { wait: new Promise(() => undefined) }]);
        const store = makeStore();
        store.submit("Which projects are at risk?");
        await vi.waitFor(() => expect(lastTurn(store).reservedResultId).toBe(RESERVED));
        store.cancel();
        await vi.waitFor(() =>
            expect(log.warn).toHaveBeenCalledWith(expect.anything(), "ask-dev cancel not sent"),
        );
        expect(transport.cancelCalls).toHaveLength(1);
        expect(kind(store)).toBe("running");
        expect(snap(store).stoppable).toBe(true);
        expect(lastTurn(store).stop).toBeUndefined();
    });
});

describe("feedback", () => {
    let feedback: FeedbackStore;
    const entry = () => feedback.entry(R1)!;

    beforeEach(() => {
        feedback = new FeedbackStore({ transport });
        feedback.setPartition(ORG_A);
    });

    it("readFeedback: unavailable, so the controls hide (not read_failed)", async () => {
        transport.feedback.set(R1, { fail: noRepository() });
        feedback.ensure(R1);
        await flush();
        expect(entry().state).toBe("unavailable");
        expect(transport.feedbackReads).toEqual([R1]);
    });

    it("readFeedback: another 409 stays read_failed", async () => {
        transport.feedback.set(R1, { fail: inProgress() });
        feedback.ensure(R1);
        await flush();
        expect(entry().state).toBe("read_failed");
    });

    it("setFeedback: rolls back and says not saved (unchanged)", async () => {
        feedback.ensure(R1);
        await flush();
        expect(entry().state).toBe("ready");
        transport.feedbackSets.push({ fail: noRepository() });
        feedback.choose(R1, "correct", "yes");
        await flush();
        expect(entry()).toMatchObject({
            state: "ready",
            confirmed: { correct: "unset", useful: "unset" },
            desired: { correct: "unset", useful: "unset" },
            saving: false,
            notSaved: true,
        });
        expect(transport.feedbackSetCalls).toHaveLength(1);
    });
});
