import { beforeEach, describe, expect, it, vi } from "vitest";

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: log }));

import type { TranscriptResult } from "@/lib/ask-dev/transcript";
import {
    ConversationStore,
    OBSERVATION_CAP_MS,
    REPLAY_CONCURRENCY,
    type ConversationStoreOptions,
    type HintStorage,
    type StoreTurn,
} from "../conversationStore";
import { partitionTag } from "../keys";
import { TransportFailure, TransportRefusal } from "../transport";
import {
    accepted,
    acrError,
    captureResult,
    deferred,
    FakeTransport,
    resultEvent,
    status,
    summary,
    threadTurn,
    threadView,
} from "./fakeTransport";

/**
 * CHAOS-11956 (I-31), E6 web design v5 §3 and §4: conversation history and reload recovery. Every
 * test runs on the test-mode seam; the live proofs are CHAOS-12232.
 */

const PARTIAL = captureResult("kiac_project_status_partial.event.json");
const ORG_A = "org-a\u0000user-1\u0000";
const ORG_B = "org-b\u0000user-1\u0000";
const THREAD_A = "thread_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const THREAD_B = "thread_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

/** A distinct stored answer: its own `result_id` and sentence. */
function answer(n: number): TranscriptResult {
    return {
        ...PARTIAL,
        result_id: `result_${String(n).padStart(12, "0")}`,
        deterministic_answer: `Answer ${String(n)}.`,
    };
}

const resultId = (n: number) => `result_${String(n).padStart(12, "0")}`;
const sub = (n: number) => `sub_${String(n).padStart(32, "0")}`;

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

function makeStore(options: Partial<ConversationStoreOptions> = {}): ConversationStore {
    let n = 0;
    const store = new ConversationStore({
        transport,
        hints,
        now: () => clock,
        sleep: async (ms) => {
            clock += ms;
        },
        uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
        ...options,
    });
    store.setPartition(ORG_A);
    return store;
}

const snap = (store: ConversationStore) => store.getSnapshot();
const kinds = (store: ConversationStore) => snap(store).turns.map((turn) => turn.outcome.kind);
const loaded = (store: ConversationStore) =>
    vi.waitFor(() => expect(snap(store).thread.kind).toBe("loaded"));
const investigations = () => transport.calls.length;
const infoEvents = (message: string) =>
    log.info.mock.calls.filter(([, text]) => text === message).map(([fields]) => fields as object);

/** Seeds thread A with these turns and their answers. */
function seedThread(threadId: string, turns: ReturnType<typeof threadTurn>[], cursor?: string) {
    transport.threads.set(threadId, threadView(threadId, turns, cursor ?? null));
    for (const turn of turns) {
        if (turn.resultId !== null) {
            const n = Number(turn.resultId.slice("result_".length));
            transport.results.set(turn.resultId, answer(n));
        }
    }
}

beforeEach(() => {
    transport = new FakeTransport();
    clock = Date.parse("2026-10-31T12:00:00Z");
    stored = null;
    vi.clearAllMocks();
});

describe("restoring a thread (AC-2, design §4.2)", () => {
    it("shows the turns in ACR's served order, whatever order the answers arrive in, with zero investigation calls", async () => {
        seedThread(THREAD_A, [
            threadTurn(sub(1), "done", { resultId: resultId(1) }),
            threadTurn(sub(2), "done", { resultId: resultId(2) }),
            threadTurn(sub(3), "done", { resultId: resultId(3) }),
        ]);
        const first = deferred();
        transport.readGates.set(resultId(1), first.promise);
        const store = makeStore();

        expect(store.selectThread(THREAD_A, "incoming")).toBe(true);
        await vi.waitFor(() => expect(kinds(store)).toEqual(["restoring", "answered", "answered"]));
        expect(snap(store).thread.kind).toBe("restoring");
        first.resolve();
        await loaded(store);

        expect(snap(store).turns.map((turn) => turn.submissionId)).toEqual([
            sub(1),
            sub(2),
            sub(3),
        ]);
        expect(kinds(store)).toEqual(["answered", "answered", "answered"]);
        expect(snap(store).turns.every((turn) => turn.origin === "restored")).toBe(true);
        expect(investigations()).toBe(0);
        expect(transport.readCalls.sort()).toEqual([resultId(1), resultId(2), resultId(3)]);
    });

    it("maps each served state to its own outcome", async () => {
        seedThread(THREAD_A, [
            threadTurn(sub(1), "done", { resultId: resultId(1) }),
            threadTurn(sub(2), "done", { withheld: true }),
            threadTurn(sub(3), "done_unsaved"),
            threadTurn(sub(4), "abandoned"),
            threadTurn(sub(5), "done", { resultId: resultId(5), question: null }),
        ]);
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await loaded(store);

        expect(kinds(store)).toEqual([
            "answered",
            "unavailable",
            "unsaved",
            "abandoned",
            "answered",
        ]);
        expect(snap(store).turns[4]!.question).toBeNull();
        // A withheld result is never read.
        expect(transport.readCalls.sort()).toEqual([resultId(1), resultId(5)]);
    });

    it(`reads at most ${String(REPLAY_CONCURRENCY)} answers at a time`, async () => {
        const turns = Array.from({ length: 7 }, (_, index) =>
            threadTurn(sub(index + 1), "done", { resultId: resultId(index + 1) }),
        );
        seedThread(THREAD_A, turns);
        const gates = turns.map(() => deferred());
        turns.forEach((turn, index) =>
            transport.readGates.set(turn.resultId!, gates[index]!.promise),
        );
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");

        await vi.waitFor(() => expect(transport.readCalls).toHaveLength(REPLAY_CONCURRENCY));
        gates[0]!.resolve();
        await vi.waitFor(() => expect(transport.readCalls).toHaveLength(REPLAY_CONCURRENCY + 1));
        for (const gate of gates) gate.resolve();
        await loaded(store);
        expect(transport.readCalls).toHaveLength(7);
    });

    it("an answer ACR does not serve now (404) is unavailable; a failed read offers Load again, a GET", async () => {
        seedThread(THREAD_A, [
            threadTurn(sub(1), "done", { resultId: resultId(1) }),
            threadTurn(sub(2), "done", { resultId: resultId(2) }),
        ]);
        transport.readErrors.set(
            resultId(1),
            new TransportRefusal(404, acrError("not_found", 404, false)),
        );
        transport.readErrors.set(resultId(2), new Error("network"));
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await loaded(store);
        expect(kinds(store)).toEqual(["unavailable", "restore_failed"]);

        transport.readErrors.delete(resultId(2));
        const failed = snap(store).turns[1]!;
        // Load again on the earlier (not last) turn too: no investigation, only the GET.
        expect(store.reloadTurn(failed.id)).toBe(true);
        await vi.waitFor(() => expect(kinds(store)).toEqual(["unavailable", "answered"]));
        expect(store.reloadTurn(snap(store).turns[0]!.id)).toBe(false);
        expect(investigations()).toBe(0);
        expect(transport.readCalls.filter((id) => id === resultId(2))).toHaveLength(2);
    });

    it("a restored turn is never sent again: retry refuses it", async () => {
        seedThread(THREAD_A, [threadTurn(sub(1), "done", { resultId: resultId(1) })]);
        transport.readErrors.set(resultId(1), new Error("network"));
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await loaded(store);
        expect(store.retry(snap(store).turns[0]!.id)).toBe(false);
        expect(investigations()).toBe(0);
    });

    it("an unknown, foreign, deleted or expired thread (404) gives the neutral read-only state", async () => {
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await vi.waitFor(() => expect(snap(store).thread.kind).toBe("unavailable"));
        expect(snap(store).threadId).toBeNull();
        expect(store.submit("Anything?")).toBe(false);
        expect(investigations()).toBe(0);
    });

    it("a malformed id is unavailable without a read", () => {
        const store = makeStore();
        store.selectThread("not a thread id", "incoming");
        expect(snap(store).thread.kind).toBe("unavailable");
        expect(transport.threadCalls).toHaveLength(0);
    });

    it.each([
        ["a 5xx", new TransportRefusal(503, acrError("store_unavailable", 503, true))],
        ["the network", new Error("network")],
        ["a body that broke the contract", new TransportFailure("invalid_upstream")],
    ])(
        "a read that failed on %s is read_failed; Try again reads it again (a GET)",
        async (_, fail) => {
            transport.threads.set(THREAD_A, { fail });
            const store = makeStore();
            store.selectThread(THREAD_A, "incoming");
            await vi.waitFor(() => expect(snap(store).thread.kind).toBe("read_failed"));
            expect(snap(store).turns).toEqual([]);
            expect(store.submit("Anything?")).toBe(false);

            seedThread(THREAD_A, [threadTurn(sub(1), "done", { resultId: resultId(1) })]);
            expect(store.retryThreadRead()).toBe(true);
            await loaded(store);
            expect(kinds(store)).toEqual(["answered"]);
            expect(investigations()).toBe(0);
        },
    );

    it("selecting the thread already shown reads nothing", async () => {
        seedThread(THREAD_A, [threadTurn(sub(1), "done", { resultId: resultId(1) })]);
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await loaded(store);
        expect(store.selectThread(THREAD_A, "local")).toBe(false);
        expect(transport.threadCalls).toHaveLength(1);
    });
});

describe("the restore barrier and follow-ups (design §3.2, §3.3)", () => {
    it("refuses a submit until the last answer settled, then threads the follow-up on the restored turns", async () => {
        seedThread(THREAD_A, [
            threadTurn(sub(1), "done", { resultId: resultId(1) }),
            threadTurn(sub(2), "done", { resultId: resultId(2) }),
        ]);
        const late = deferred();
        transport.readGates.set(resultId(2), late.promise);
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await vi.waitFor(() => expect(kinds(store)).toEqual(["answered", "restoring"]));
        expect(store.submit("And the next?")).toBe(false);
        expect(snap(store).inFlight).toBe(false);

        late.resolve();
        await loaded(store);
        transport.scripts.push([accepted(), resultEvent(PARTIAL)]);
        expect(store.submit("And the next?")).toBe(true);
        const call = transport.calls[0]!;
        expect(call.threadId).toBe(THREAD_A);
        expect(call.request.parent_result_id).toBe(resultId(2));
        expect(call.request.conversation?.map((turn) => turn.content)).toEqual([
            `question of ${sub(1)}`,
            "Answer 1.",
            `question of ${sub(2)}`,
            "Answer 2.",
        ]);
    });

    it.each([
        ["unsaved", threadTurn(sub(2), "done_unsaved")],
        ["abandoned", threadTurn(sub(2), "abandoned")],
        ["withheld", threadTurn(sub(2), "done", { withheld: true })],
    ])(
        "after a restored %s turn a follow-up carries no parent (the immediate predecessor only)",
        async (_, second) => {
            seedThread(THREAD_A, [threadTurn(sub(1), "done", { resultId: resultId(1) }), second]);
            const store = makeStore();
            store.selectThread(THREAD_A, "incoming");
            await loaded(store);
            transport.scripts.push([accepted(), resultEvent(PARTIAL)]);
            store.submit("And the next?");
            expect(transport.calls[0]!.request.parent_result_id).toBeUndefined();
        },
    );

    it("never sends a question ACR did not record, and still takes its answer as the parent", async () => {
        seedThread(THREAD_A, [
            threadTurn(sub(1), "done", { resultId: resultId(1) }),
            threadTurn(sub(2), "done", { resultId: resultId(2), question: null }),
        ]);
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await loaded(store);
        transport.scripts.push([accepted(), resultEvent(PARTIAL)]);
        store.submit("And the next?");
        const { request } = transport.calls[0]!;
        expect(request.parent_result_id).toBe(resultId(2));
        expect(request.conversation?.map((turn) => turn.content)).toEqual([
            `question of ${sub(1)}`,
            "Answer 1.",
        ]);
        expect(JSON.stringify(request)).not.toContain("Question not recorded");
    });

    it("observes every running turn; the composer opens only when all of them settled", async () => {
        seedThread(THREAD_A, [threadTurn(sub(1), "running"), threadTurn(sub(2), "running")]);
        transport.results.set(resultId(9), answer(9));
        const statusGate = deferred();
        let reads = 0;
        transport.statusOf = async (submissionId: string) => {
            reads += 1;
            if (submissionId === sub(1)) return status("done", resultId(9));
            await statusGate.promise;
            return status("abandoned");
        };
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await vi.waitFor(() => expect(kinds(store)).toEqual(["answered", "observing"]));
        expect(snap(store).thread.kind).toBe("loaded");
        expect(snap(store).inFlight).toBe(true);
        expect(store.submit("Next?")).toBe(false);

        statusGate.resolve();
        await vi.waitFor(() => expect(kinds(store)).toEqual(["answered", "interrupted"]));
        expect(snap(store).inFlight).toBe(false);
        expect(reads).toBeGreaterThanOrEqual(2);
        expect(investigations()).toBe(0);
    });

    it("at the observation cap a running turn says its state could not be confirmed", async () => {
        seedThread(THREAD_A, [threadTurn(sub(1), "running")]);
        transport.statuses.push(status("running"));
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await vi.waitFor(() => expect(kinds(store)).toEqual(["unconfirmed"]), { timeout: 5_000 });
        expect(snap(store).inFlight).toBe(false);
        expect(clock - Date.parse("2026-10-31T12:00:00Z")).toBe(OBSERVATION_CAP_MS);
        expect(infoEvents("ask-dev observed run expired")).toEqual([
            { submission_id: sub(1), deadline_source: "observation_cap" },
        ]);
    });
});

describe("selection ownership (design §3.1, §4.1)", () => {
    it("a slow read of A that lands after B was selected changes nothing", async () => {
        seedThread(THREAD_A, [threadTurn(sub(1), "done", { resultId: resultId(1) })]);
        seedThread(THREAD_B, [threadTurn(sub(2), "done", { resultId: resultId(2) })]);
        const slow = deferred();
        transport.threadGate = slow.promise;
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        transport.threadGate = undefined;
        store.selectThread(THREAD_B, "incoming");
        await loaded(store);
        slow.resolve();
        await vi.waitFor(() =>
            expect(infoEvents("ask-dev stale answer dropped")).toContainEqual({
                operation: "thread_read",
                scope: "transcript",
                selection: 1,
            }),
        );
        expect(snap(store).threadId).toBe(THREAD_B);
        expect(snap(store).turns.map((turn) => turn.submissionId)).toEqual([sub(2)]);
    });

    it("an org switch during the replays drops them", async () => {
        seedThread(THREAD_A, [threadTurn(sub(1), "done", { resultId: resultId(1) })]);
        const gate = deferred();
        transport.readGates.set(resultId(1), gate.promise);
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await vi.waitFor(() => expect(transport.readCalls).toHaveLength(1));
        store.setPartition(ORG_B);
        gate.resolve();
        await vi.waitFor(() =>
            expect(infoEvents("ask-dev stale answer dropped")).toContainEqual(
                expect.objectContaining({ operation: "replay", scope: "transcript" }),
            ),
        );
        expect(snap(store).turns).toEqual([]);
        expect(snap(store).threadId).toBeNull();
    });

    it("aborts the old selection's reads when another is selected", async () => {
        seedThread(THREAD_B, [threadTurn(sub(2), "done", { resultId: resultId(2) })]);
        transport.threadGate = new Promise(() => undefined);
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        transport.threadGate = undefined;
        store.selectThread(THREAD_B, "local");
        const [old, current] = transport.threadCalls;
        expect(old!.signal!.aborted).toBe(true);
        expect(current!.signal!.aborted).toBe(false);
    });
});

describe("earlier turns (design §4.2.6)", () => {
    it("prepends the page before the oldest turn, each submission once, keeping every turn's key", async () => {
        seedThread(THREAD_A, [threadTurn(sub(3), "done", { resultId: resultId(3) })], "cursor_1");
        transport.threads.set(
            `${THREAD_A}|cursor_1`,
            threadView(THREAD_A, [
                threadTurn(sub(1), "done", { resultId: resultId(1) }),
                threadTurn(sub(2), "done_unsaved"),
                threadTurn(sub(3), "done", { resultId: resultId(3) }),
            ]),
        );
        transport.results.set(resultId(1), answer(1));
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await loaded(store);
        expect(snap(store).thread).toEqual({ kind: "loaded", earlier: "available" });
        const latestId = snap(store).turns[0]!.id;

        expect(store.loadEarlierTurns()).toBe(true);
        await vi.waitFor(() => expect(kinds(store)).toEqual(["answered", "unsaved", "answered"]));
        expect(snap(store).turns.map((turn) => turn.submissionId)).toEqual([
            sub(1),
            sub(2),
            sub(3),
        ]);
        expect(snap(store).turns[2]!.id).toBe(latestId);
        expect(snap(store).thread).toEqual({ kind: "loaded", earlier: "none" });
        expect(investigations()).toBe(0);
    });

    it("a stale cursor (400) reads the thread again from its latest page", async () => {
        seedThread(THREAD_A, [threadTurn(sub(3), "done", { resultId: resultId(3) })], "cursor_1");
        transport.threads.set(`${THREAD_A}|cursor_1`, {
            fail: new TransportRefusal(400, acrError("invalid_request", 400, false)),
        });
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await loaded(store);
        store.loadEarlierTurns();
        await vi.waitFor(() => expect(transport.threadCalls).toHaveLength(3));
        expect(transport.threadCalls.map((call) => call.before)).toEqual([
            undefined,
            "cursor_1",
            undefined,
        ]);
        await loaded(store);
    });
});

describe("history and delete (AC-12, design §4.3)", () => {
    it("lists, pages and filters deleted rows out of a late page", async () => {
        transport.listPages.push(
            { threads: [summary(THREAD_A), summary(THREAD_B)], nextCursor: "next_1" },
            {
                threads: [summary(THREAD_A), summary("thread_cccccccccccccccccccccccccccccccc")],
                nextCursor: null,
            },
        );
        const store = makeStore();
        store.loadHistory();
        await vi.waitFor(() => expect(snap(store).history.status).toBe("ready"));
        expect(snap(store).history.nextCursor).toBe("next_1");

        store.deleteThread(THREAD_A);
        await vi.waitFor(() => expect(snap(store).history.deleting).toEqual([]));
        store.loadMoreHistory();
        await vi.waitFor(() => expect(snap(store).history.loadingMore).toBe(false));
        expect(snap(store).history.threads.map((row) => row.threadId)).toEqual([
            THREAD_B,
            "thread_cccccccccccccccccccccccccccccccc",
        ]);
    });

    // CHAOS-12336 (T14b, the lead's ruling 2 = A): no ACR token, or ACR's 401, on the list or the
    // thread read is the Connect state, not a failed read.
    it("a list read with no ACR token is connect, not read_failed; a later page keeps moreFailed", async () => {
        transport.listPages.push({ fail: new TransportFailure("authorization_required") });
        const store = makeStore();
        store.loadHistory();
        await vi.waitFor(() => expect(snap(store).history.status).toBe("connect"));
        transport.listPages.splice(0, 1, {
            threads: [summary(THREAD_A)],
            nextCursor: "next",
        });
        store.loadHistory();
        await vi.waitFor(() => expect(snap(store).history.status).toBe("ready"));
        transport.listPages.splice(0, transport.listPages.length, {
            fail: new TransportFailure("authorization_required"),
        });
        store.loadMoreHistory();
        await vi.waitFor(() => expect(snap(store).history.moreFailed).toBe(true));
        expect(snap(store).history.status).toBe("ready");
    });

    it("a thread read with no ACR token is connect, read-only, and offers no Try again", async () => {
        transport.threads.set(THREAD_A, { fail: new TransportFailure("authorization_required") });
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await vi.waitFor(() => expect(snap(store).thread.kind).toBe("connect"));
        expect(store.retryThreadRead()).toBe(false);
        expect(store.submit("Anything?")).toBe(false);
        expect(investigations()).toBe(0);
    });

    it("a list read that failed keeps the rows and offers Try again", async () => {
        transport.listPages.push({ threads: [summary(THREAD_A)], nextCursor: null });
        const store = makeStore();
        store.loadHistory();
        await vi.waitFor(() => expect(snap(store).history.status).toBe("ready"));
        transport.listPages.splice(0, 1, { fail: new Error("network") });
        store.loadHistory();
        await vi.waitFor(() => expect(snap(store).history.status).toBe("read_failed"));
        expect(snap(store).history.threads.map((row) => row.threadId)).toEqual([THREAD_A]);
        transport.listPages.splice(0, 1, { threads: [summary(THREAD_B)], nextCursor: null });
        store.loadHistory();
        await vi.waitFor(() => expect(snap(store).history.status).toBe("ready"));
        expect(snap(store).history.threads.map((row) => row.threadId)).toEqual([THREAD_B]);
    });

    it("a stale list cursor (400) reads the list again from its first page", async () => {
        transport.listPages.push(
            { threads: [summary(THREAD_A)], nextCursor: "next_1" },
            { fail: new TransportRefusal(400, acrError("invalid_request", 400, false)) },
            { threads: [summary(THREAD_B)], nextCursor: null },
        );
        const store = makeStore();
        store.loadHistory();
        await vi.waitFor(() => expect(snap(store).history.status).toBe("ready"));
        store.loadMoreHistory();
        await vi.waitFor(() =>
            expect(transport.listCalls).toEqual([undefined, "next_1", undefined]),
        );
        await vi.waitFor(() =>
            expect(snap(store).history.threads.map((row) => row.threadId)).toEqual([THREAD_B]),
        );
    });

    it("deleting the conversation shown clears it, its hint and names no thread (a local selection)", async () => {
        seedThread(THREAD_A, [threadTurn(sub(1), "done", { resultId: resultId(1) })]);
        transport.listPages.push({ threads: [summary(THREAD_A)], nextCursor: null });
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await loaded(store);
        expect(stored).not.toBeNull();
        store.loadHistory();
        await vi.waitFor(() => expect(snap(store).history.status).toBe("ready"));

        store.deleteThread(THREAD_A);
        await vi.waitFor(() => expect(snap(store).threadId).toBeNull());
        expect(transport.deleteCalls).toEqual([THREAD_A]);
        expect(snap(store).turns).toEqual([]);
        expect(snap(store).selectionSource).toBe("local");
        expect(snap(store).history.threads).toEqual([]);
        expect(stored).toBeNull();
        expect(investigations()).toBe(0);
    });

    it("a delete that lands after a thread switch still hides its row (N1)", async () => {
        seedThread(THREAD_B, [threadTurn(sub(2), "done", { resultId: resultId(2) })]);
        transport.listPages.push({
            threads: [summary(THREAD_A), summary(THREAD_B)],
            nextCursor: null,
        });
        const gate = deferred();
        transport.deleteGate = gate.promise;
        const store = makeStore();
        store.loadHistory();
        await vi.waitFor(() => expect(snap(store).history.status).toBe("ready"));
        store.deleteThread(THREAD_A);
        store.selectThread(THREAD_B, "local");
        await loaded(store);
        gate.resolve();
        await vi.waitFor(() =>
            expect(snap(store).history.threads.map((row) => row.threadId)).toEqual([THREAD_B]),
        );
        expect(snap(store).threadId).toBe(THREAD_B);
    });

    it("a read of a thread that completes after its delete does not bring its content back", async () => {
        seedThread(THREAD_A, [threadTurn(sub(1), "done", { resultId: resultId(1) })]);
        transport.listPages.push({ threads: [summary(THREAD_A)], nextCursor: null });
        const store = makeStore();
        store.loadHistory();
        await vi.waitFor(() => expect(snap(store).history.status).toBe("ready"));
        store.deleteThread(THREAD_A);
        await vi.waitFor(() => expect(snap(store).history.threads).toEqual([]));
        // The id stays readable on the fake: the store's own tombstone keeps it out.
        store.selectThread(THREAD_A, "incoming");
        await vi.waitFor(() => expect(snap(store).thread.kind).toBe("unavailable"));
        expect(snap(store).turns).toEqual([]);
    });

    it("a foreign id's delete answers 204: the store hides the row and changes nothing else", async () => {
        seedThread(THREAD_B, [threadTurn(sub(2), "done", { resultId: resultId(2) })]);
        const store = makeStore();
        store.selectThread(THREAD_B, "incoming");
        await loaded(store);
        store.deleteThread(THREAD_A);
        await vi.waitFor(() => expect(transport.deleteCalls).toEqual([THREAD_A]));
        expect(snap(store).threadId).toBe(THREAD_B);
        expect(kinds(store)).toEqual(["answered"]);
    });

    it("a failed delete keeps the row and says so", async () => {
        transport.listPages.push({ threads: [summary(THREAD_A)], nextCursor: null });
        transport.deleteFails = new Error("network");
        const store = makeStore();
        store.loadHistory();
        await vi.waitFor(() => expect(snap(store).history.status).toBe("ready"));
        store.deleteThread(THREAD_A);
        await vi.waitFor(() => expect(snap(store).history.deleteFailed).toBe(THREAD_A));
        expect(snap(store).history.threads.map((row) => row.threadId)).toEqual([THREAD_A]);
    });

    it("history survives a thread switch and is dropped on a partition change", async () => {
        seedThread(THREAD_A, [threadTurn(sub(1), "done", { resultId: resultId(1) })]);
        transport.listPages.push({ threads: [summary(THREAD_A)], nextCursor: null });
        const store = makeStore();
        store.loadHistory();
        await vi.waitFor(() => expect(snap(store).history.status).toBe("ready"));
        store.selectThread(THREAD_A, "local");
        await loaded(store);
        expect(snap(store).history.threads).toHaveLength(1);
        store.setPartition(ORG_B);
        expect(snap(store).history.threads).toEqual([]);
    });
});

describe("the restore hint (design §4.4)", () => {
    it("is written once ACR admitted a turn, and a new store restores from it", async () => {
        const first = makeStore();
        transport.scripts.push([accepted(), resultEvent(answer(1))]);
        first.submit("Which projects are at risk?");
        await vi.waitFor(() => expect(first.getSnapshot().inFlight).toBe(false));
        const threadId = first.getSnapshot().threadId!;
        expect(JSON.parse(stored!)).toEqual({
            thread_id: threadId,
            partition: partitionTag(ORG_A),
            expires_at: null,
        });

        // The reload: a new store, the same tab storage.
        seedThread(threadId, [
            threadTurn(transport.calls[0]!.submissionId, "done", { resultId: resultId(1) }),
        ]);
        const reloaded = makeStore();
        expect(reloaded.restoreFromHint()).toBe(true);
        await loaded(reloaded);
        expect(reloaded.getSnapshot().threadId).toBe(threadId);
        expect(kinds(reloaded)).toEqual(["answered"]);
        expect(investigations()).toBe(1);
    });

    it("is not written for a first question ACR refused before admission", async () => {
        const store = makeStore();
        transport.scripts.push([
            { fail: new TransportRefusal(403, acrError("access_denied", 403, false)) },
        ]);
        store.submit("Anything?");
        await vi.waitFor(() => expect(snap(store).inFlight).toBe(false));
        expect(stored).toBeNull();
    });

    it("of another partition, or past its expiry, restores nothing and is cleared", () => {
        stored = JSON.stringify({
            thread_id: THREAD_A,
            partition: partitionTag(ORG_B),
            expires_at: null,
        });
        expect(makeStore().restoreFromHint()).toBe(false);
        expect(stored).toBeNull();
        stored = JSON.stringify({
            thread_id: THREAD_A,
            partition: partitionTag(ORG_A),
            expires_at: "2026-10-31T11:59:59Z",
        });
        expect(makeStore().restoreFromHint()).toBe(false);
        expect(stored).toBeNull();
        expect(transport.threadCalls).toHaveLength(0);
    });

    it("is cleared on unavailable, on a new conversation and on a partition change", async () => {
        const write = () =>
            (stored = JSON.stringify({
                thread_id: THREAD_A,
                partition: partitionTag(ORG_A),
                expires_at: null,
            }));
        write();
        const store = makeStore();
        store.restoreFromHint();
        await vi.waitFor(() => expect(snap(store).thread.kind).toBe("unavailable"));
        expect(stored).toBeNull();

        write();
        store.newConversation();
        expect(stored).toBeNull();

        write();
        store.setPartition(ORG_B);
        expect(stored).toBeNull();
    });

    it("does nothing while a conversation is shown", async () => {
        seedThread(THREAD_B, [threadTurn(sub(2), "done", { resultId: resultId(2) })]);
        const store = makeStore();
        store.selectThread(THREAD_B, "incoming");
        await loaded(store);
        stored = JSON.stringify({
            thread_id: THREAD_A,
            partition: partitionTag(ORG_A),
            expires_at: null,
        });
        expect(store.restoreFromHint()).toBe(false);
        expect(snap(store).threadId).toBe(THREAD_B);
    });
});

describe("Info events (design §3.4): content-free, from an allow-list", () => {
    const QUESTION = "Which projects are at risk for the Atlas launch?";

    it("logs the restore with counts only", async () => {
        seedThread(THREAD_A, [
            threadTurn(sub(1), "done", { resultId: resultId(1), question: QUESTION }),
            threadTurn(sub(2), "done", { withheld: true, question: QUESTION }),
        ]);
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await loaded(store);
        const [restored] = infoEvents("ask-dev thread restored");
        expect(Object.keys(restored!).sort()).toEqual(
            [
                "duration_ms",
                "failed",
                "replays",
                "selection",
                "thread_id",
                "turns",
                "unavailable",
            ].sort(),
        );
        expect(restored).toMatchObject({
            thread_id: THREAD_A,
            turns: 2,
            replays: 1,
            unavailable: 1,
            failed: 0,
        });
        const everything = JSON.stringify([
            log.info.mock.calls,
            log.warn.mock.calls,
            log.error.mock.calls,
        ]);
        expect(everything).not.toContain(QUESTION);
        expect(everything).not.toContain("Answer 1.");
    });

    it("logs a failed restore with its stage and status only", async () => {
        transport.threads.set(THREAD_A, {
            fail: new TransportRefusal(503, acrError("store_unavailable", 503, true)),
        });
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await vi.waitFor(() => expect(snap(store).thread.kind).toBe("read_failed"));
        expect(infoEvents("ask-dev thread restore failed")).toEqual([
            { thread_id: THREAD_A, stage: "read", status: 503, selection: 1 },
        ]);
    });
});

describe("restored turns keep their thread (design §3.2)", () => {
    it("a follow-up after a thread_closed carries nothing from the closed thread", async () => {
        seedThread(THREAD_A, [threadTurn(sub(1), "done", { resultId: resultId(1) })]);
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await loaded(store);
        transport.scripts.push(
            [{ fail: new TransportRefusal(409, acrError("thread_closed", 409, false)) }],
            [accepted(), resultEvent(PARTIAL)],
        );
        store.submit("Next?");
        await vi.waitFor(() => expect(snap(store).thread.kind).toBe("new"));
        store.submit("A new one?");
        const fresh = transport.calls[1]!;
        expect(fresh.threadId).not.toBe(THREAD_A);
        expect(fresh.request).not.toHaveProperty("parent_result_id");
        expect(fresh.request).not.toHaveProperty("conversation");
        const threads = new Set(snap(store).turns.map((turn: StoreTurn) => turn.threadId));
        expect(threads).toEqual(new Set([THREAD_A, fresh.threadId]));
    });
});

describe("codex r1 on #1648", () => {
    it("an earlier page that names another thread commits nothing (P2-1)", async () => {
        seedThread(THREAD_A, [threadTurn(sub(3), "done", { resultId: resultId(3) })], "cursor_1");
        transport.threads.set(
            `${THREAD_A}|cursor_1`,
            threadView(THREAD_B, [
                threadTurn(sub(1), "done_unsaved", { question: "Other thread" }),
            ]),
        );
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await loaded(store);
        store.loadEarlierTurns();
        await vi.waitFor(() =>
            expect(snap(store).thread).toEqual({ kind: "loaded", earlier: "failed" }),
        );
        expect(snap(store).turns.map((turn) => turn.submissionId)).toEqual([sub(3)]);
        expect(JSON.stringify(snap(store).turns)).not.toContain("Other thread");
    });

    it("a restored run that turns done keeps the composer closed until its answer is read (P2-2)", async () => {
        seedThread(THREAD_A, [threadTurn(sub(1), "running")]);
        transport.results.set(resultId(9), answer(9));
        const replay = deferred();
        transport.readGates.set(resultId(9), replay.promise);
        transport.statuses.push(status("done", resultId(9)));
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await vi.waitFor(() => expect(transport.readCalls).toEqual([resultId(9)]));
        expect(kinds(store)).toEqual(["restoring"]);
        expect(snap(store).inFlight).toBe(true);
        expect(store.submit("And the next?")).toBe(false);

        replay.resolve();
        await vi.waitFor(() => expect(kinds(store)).toEqual(["answered"]));
        expect(snap(store).inFlight).toBe(false);
        transport.scripts.push([accepted(), resultEvent(PARTIAL)]);
        expect(store.submit("And the next?")).toBe(true);
        const { request } = transport.calls[0]!;
        expect(request.parent_result_id).toBe(resultId(9));
        expect(request.conversation?.map((turn) => turn.content)).toContain("Answer 9.");
    });

    it.each([
        [
            "deleting the conversation shown",
            (store: ConversationStore, id: string) => store.deleteThread(id),
        ],
        ["starting a new conversation", (store: ConversationStore) => store.newConversation()],
        [
            "selecting another conversation",
            (store: ConversationStore) => store.selectThread(THREAD_B, "local"),
        ],
    ])(
        "%s detaches a running question: no abort, no late commit, abort only at its deadline (P2-3)",
        async (_, leave) => {
            seedThread(THREAD_B, [threadTurn(sub(2), "done", { resultId: resultId(2) })]);
            const gate = deferred();
            transport.scripts.push([accepted(), { wait: gate.promise }, resultEvent(answer(7))]);
            const store = makeStore({ runTimeoutMs: 120_000 });
            store.submit("Which projects are at risk?");
            await vi.waitFor(() => expect(snap(store).turns[0]?.reservedResultId).toBeDefined());
            const { signal, threadId } = transport.calls[0]!;

            leave(store, threadId);
            await vi.waitFor(() => expect(snap(store).threadId).not.toBe(threadId));
            expect(signal.aborted).toBe(false);

            gate.resolve();
            // The stream is read to its terminal (closing it early would be a disconnect).
            await vi.waitFor(() => expect(transport.finishedStreams).toBe(1));
            expect(
                snap(store).turns.some(
                    (turn) => turn.outcome.kind === "answered" && turn.threadId === threadId,
                ),
            ).toBe(false);
            expect(signal.aborted).toBe(false);
        },
    );

    it("a detached run that never ends is aborted at its deadline", async () => {
        vi.useFakeTimers();
        try {
            transport.scripts.push([accepted(), { wait: new Promise(() => undefined) }]);
            const store = makeStore({ runTimeoutMs: 120_000, now: Date.now });
            store.submit("Which projects are at risk?");
            await vi.advanceTimersByTimeAsync(0);
            const { signal } = transport.calls[0]!;
            store.newConversation();
            expect(signal.aborted).toBe(false);
            await vi.advanceTimersByTimeAsync(120_000);
            expect(signal.aborted).toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });

    it("a partition change still aborts the running question", async () => {
        transport.scripts.push([accepted(), { wait: new Promise(() => undefined) }]);
        const store = makeStore();
        store.submit("Which projects are at risk?");
        await vi.waitFor(() => expect(snap(store).turns[0]?.reservedResultId).toBeDefined());
        const { signal } = transport.calls[0]!;
        store.setPartition(ORG_B);
        expect(signal.aborted).toBe(true);
    });
});

describe("codex r3 on #1648: every answer read blocks a follow-up", () => {
    it("a failed answer read releases the barrier: a new question can go, with no parent", async () => {
        seedThread(THREAD_A, [threadTurn(sub(1), "done", { resultId: resultId(1) })]);
        transport.readErrors.set(resultId(1), new Error("network"));
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await loaded(store);
        expect(kinds(store)).toEqual(["restore_failed"]);
        expect(snap(store).replaying).toBe(false);
        transport.scripts.push([accepted(), resultEvent(PARTIAL)]);
        expect(store.submit("Something new?")).toBe(true);
        expect(transport.calls[0]!.request.parent_result_id).toBeUndefined();
    });

    it("Load again on the last turn refuses a submit until its answer is read", async () => {
        seedThread(THREAD_A, [threadTurn(sub(1), "done", { resultId: resultId(1) })]);
        transport.readErrors.set(resultId(1), new Error("network"));
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await loaded(store);
        transport.readErrors.delete(resultId(1));
        const gate = deferred();
        transport.readGates.set(resultId(1), gate.promise);
        expect(store.reloadTurn(snap(store).turns[0]!.id)).toBe(true);
        expect(store.submit("And the next?")).toBe(false);
        expect(snap(store).replaying).toBe(true);

        gate.resolve();
        await vi.waitFor(() => expect(kinds(store)).toEqual(["answered"]));
        expect(snap(store).replaying).toBe(false);
        transport.scripts.push([accepted(), resultEvent(PARTIAL)]);
        expect(store.submit("And the next?")).toBe(true);
        expect(transport.calls[0]!.request.parent_result_id).toBe(resultId(1));
    });

    it("an earlier page's answer reads refuse a submit until they settle", async () => {
        seedThread(THREAD_A, [threadTurn(sub(3), "done", { resultId: resultId(3) })], "cursor_1");
        transport.threads.set(
            `${THREAD_A}|cursor_1`,
            threadView(THREAD_A, [threadTurn(sub(2), "done", { resultId: resultId(2) })]),
        );
        transport.results.set(resultId(2), answer(2));
        const gate = deferred();
        transport.readGates.set(resultId(2), gate.promise);
        const store = makeStore();
        store.selectThread(THREAD_A, "incoming");
        await loaded(store);
        store.loadEarlierTurns();
        await vi.waitFor(() => expect(kinds(store)).toEqual(["restoring", "answered"]));
        expect(store.submit("And the next?")).toBe(false);

        gate.resolve();
        await vi.waitFor(() => expect(kinds(store)).toEqual(["answered", "answered"]));
        transport.scripts.push([accepted(), resultEvent(PARTIAL)]);
        expect(store.submit("And the next?")).toBe(true);
        expect(transport.calls[0]!.request.conversation?.map((turn) => turn.content)).toContain(
            "Answer 2.",
        );
    });
});
