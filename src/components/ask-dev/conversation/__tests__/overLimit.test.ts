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
 * CHAOS-12469: ACR's 503 for an organization whose inventory is above its limit. It is the only 503
 * `upstream_unavailable` marked `retryable: false` (acr `docs/authentication.md`), on every protected
 * route, so that field alone tells it from an outage. No retry can clear it, so nothing offers one.
 */

const PARTIAL = captureResult("kiac_project_status_partial.event.json");
const ORG_A = "org-a\u0000user-1\u0000";
const THREAD_A = "thread_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const THREAD_B = "thread_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SUB = "sub_00000000000000000000000000000001";
const RESERVED = "result_reserved_0001";
const R1 = "result_000000000001";
const START = Date.parse("2026-10-31T12:00:00Z");

const overLimit = () => new TransportRefusal(503, acrError("upstream_unavailable", 503, false));
/** A true outage: the same status and code, and ACR says a retry can work. */
const outage = () => new TransportRefusal(503, acrError("upstream_unavailable", 503, true));

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

describe("the create", () => {
    it("says Ask Dev is not available here, and offers no retry", async () => {
        transport.scripts.push([{ fail: overLimit() }]);
        const store = makeStore();
        store.submit("Which projects are at risk?");
        await vi.waitFor(() => expect(kind(store)).toBe("not_run"));
        expect(lastTurn(store).outcome).toMatchObject({ reason: "not_entitled", retry: false });
    });

    it("an outage keeps today's path: failed, with a retry", async () => {
        transport.scripts.push([{ fail: outage() }]);
        const store = makeStore();
        store.submit("Which projects are at risk?");
        await vi.waitFor(() => expect(kind(store)).toBe("failed"));
        expect(lastTurn(store).outcome).toMatchObject({ retry: true });
    });
});

describe("listThreads", () => {
    it("first page: unavailable, no rows, no cursor", async () => {
        transport.listPages.push({ fail: overLimit() });
        const store = makeStore();
        store.loadHistory();
        await vi.waitFor(() => expect(snap(store).history.status).toBe("unavailable"));
        expect(snap(store).history).toMatchObject({
            threads: [],
            nextCursor: null,
            loadingMore: false,
            moreFailed: false,
        });
        expect(transport.listCalls).toEqual([undefined]);
    });

    it("a later page: the same, not moreFailed", async () => {
        transport.listPages.push({ threads: [summary(THREAD_A)], nextCursor: "c2" });
        transport.listPages.push({ fail: overLimit() });
        const store = makeStore();
        store.loadHistory();
        await vi.waitFor(() => expect(snap(store).history.status).toBe("ready"));
        store.loadMoreHistory();
        await vi.waitFor(() => expect(snap(store).history.status).toBe("unavailable"));
        expect(snap(store).history).toMatchObject({ threads: [], moreFailed: false });
    });

    it("an outage keeps today's path: read_failed first page, moreFailed later", async () => {
        transport.listPages.push(
            { fail: outage() },
            { threads: [summary(THREAD_A)], nextCursor: "c2" },
            { fail: outage() },
        );
        const store = makeStore();
        store.loadHistory();
        await vi.waitFor(() => expect(snap(store).history.status).toBe("read_failed"));

        store.loadHistory();
        await vi.waitFor(() => expect(snap(store).history.status).toBe("ready"));
        store.loadMoreHistory();
        await vi.waitFor(() => expect(snap(store).history.moreFailed).toBe(true));
    });

    it.each([
        [
            "a 504 with the same code",
            () => new TransportRefusal(504, acrError("upstream_unavailable", 504, false)),
        ],
        [
            "a 503 with another code",
            () => new TransportRefusal(503, acrError("run_lost", 503, false)),
        ],
    ])("%s, not retryable, keeps today's path", async (_name, refusal) => {
        transport.listPages.push({ fail: refusal() });
        const store = makeStore();
        store.loadHistory();
        await vi.waitFor(() => expect(snap(store).history.status).toBe("read_failed"));
    });

    it("a reload is a new read: the state clears when the organization is back in limit", async () => {
        transport.listPages.push(
            { fail: overLimit() },
            { threads: [summary(THREAD_A)], nextCursor: null },
        );
        const store = makeStore();
        store.loadHistory();
        await vi.waitFor(() => expect(snap(store).history.status).toBe("unavailable"));

        store.loadHistory();
        await vi.waitFor(() => expect(snap(store).history.status).toBe("ready"));
    });
});

describe("readThread", () => {
    it("first page: unavailable, not read_failed", async () => {
        transport.threads.set(THREAD_A, { fail: overLimit() });
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await vi.waitFor(() => expect(snap(store).thread.kind).toBe("unavailable"));
        expect(transport.threadCalls).toHaveLength(1);
    });

    it("an earlier page: unavailable, not earlier: failed", async () => {
        transport.threads.set(
            THREAD_A,
            threadView(THREAD_A, [threadTurn(SUB, "done_unsaved")], "cursor-1"),
        );
        transport.threads.set(`${THREAD_A}|cursor-1`, { fail: overLimit() });
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await vi.waitFor(() => expect(snap(store).thread.kind).toBe("loaded"));
        store.loadEarlierTurns();
        await vi.waitFor(() => expect(snap(store).thread.kind).toBe("unavailable"));
        expect(snap(store).inFlight).toBe(false);
    });

    it("an outage keeps today's path: read_failed", async () => {
        transport.threads.set(THREAD_A, { fail: outage() });
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await vi.waitFor(() => expect(snap(store).thread.kind).toBe("read_failed"));
    });
});

describe("readResult", () => {
    const restored = () =>
        transport.threads.set(
            THREAD_A,
            threadView(THREAD_A, [threadTurn(SUB, "done", { resultId: R1 })]),
        );

    it("a restored answer: unavailable", async () => {
        restored();
        transport.readErrors.set(R1, overLimit());
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await vi.waitFor(() => expect(kind(store)).toBe("unavailable"));
    });

    it("a live run's replay: unavailable, not a retry", async () => {
        transport.statuses.push(status("done", R1));
        transport.readErrors.set(R1, overLimit());
        const store = makeStore();
        await droppedRun(store);
        await vi.waitFor(() => expect(kind(store)).toBe("unavailable"));
    });

    it("an outage keeps today's path: restore_failed, and a retry after a live replay", async () => {
        restored();
        transport.readErrors.set(R1, outage());
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await vi.waitFor(() => expect(kind(store)).toBe("restore_failed"));

        transport.statuses.push(status("done", R1));
        const live = makeStore();
        await droppedRun(live);
        await vi.waitFor(() => expect(kind(live)).toBe("failed"));
        expect(lastTurn(live).outcome).toMatchObject({ retry: true });
    });
});

describe("submissionStatus", () => {
    it("recover loop: one poll, then unavailable", async () => {
        transport.statuses.push(overLimit());
        const store = makeStore();
        await droppedRun(store);
        await vi.waitFor(() => expect(kind(store)).toBe("unavailable"));
        expect(transport.statusCalls).toHaveLength(1);
        expect(snap(store).inFlight).toBe(false);
    });

    it("observe loop: one poll, then unavailable", async () => {
        transport.threads.set(THREAD_A, threadView(THREAD_A, [threadTurn(SUB, "running")]));
        transport.statuses.push(overLimit());
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await vi.waitFor(() => expect(kind(store)).toBe("unavailable"));
        expect(transport.statusCalls).toEqual([SUB]);
    });

    it("an outage keeps polling", async () => {
        transport.statuses.push(outage(), outage(), status("done", R1));
        const store = makeStore();
        await droppedRun(store);
        await vi.waitFor(() => expect(transport.statusCalls.length).toBeGreaterThan(1));
    });
});

describe("feedback", () => {
    let feedback: FeedbackStore;
    const entry = () => feedback.entry(R1)!;

    beforeEach(() => {
        feedback = new FeedbackStore({ transport });
        feedback.setPartition(ORG_A);
    });

    it("readFeedback: unavailable, so the controls hide", async () => {
        transport.feedback.set(R1, { fail: overLimit() });
        feedback.ensure(R1);
        await flush();
        expect(entry().state).toBe("unavailable");
    });

    it("readFeedback: an outage stays read_failed", async () => {
        transport.feedback.set(R1, { fail: outage() });
        feedback.ensure(R1);
        await flush();
        expect(entry().state).toBe("read_failed");
    });
});
