import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: log }));

import type { TranscriptResult } from "../../answer/AskDevTurn";
import {
    ATTACH_ATTEMPTS,
    BUDGET_GRACE_MS,
    ConversationStore,
    type ConversationStoreOptions,
    type HintStorage,
} from "../conversationStore";
import { TransportFailure, TransportRefusal } from "../transport";
import type { InvestigationEvent } from "../transport";
import {
    acrError,
    at,
    captureResult,
    cursorExpired,
    deferred,
    FakeTransport,
    heartbeat,
    stageEvent,
    status,
    threadTurn,
    threadView,
} from "./fakeTransport";

/**
 * CHAOS-11957 (I-S10b), E6 web design v5 §5: reattach after a dropped stream or a reload, the
 * deadline of an observed run, and Stop through the cancel endpoint. Test-mode seam only; the live
 * proofs are CHAOS-12233.
 */

const PARTIAL = captureResult("kiac_project_status_partial.event.json");
const ORG_A = "org-a\u0000user-1\u0000";
const THREAD_A = "thread_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SUB = "sub_00000000000000000000000000000001";
const RESERVED = "result_reserved_0001";
const START = Date.parse("2026-10-31T12:00:00Z");

function answer(n: number): TranscriptResult {
    return { ...PARTIAL, result_id: `result_${String(n).padStart(12, "0")}` };
}

/** The run's own events, numbered from 1, as ACR's log serves them. */
const accepted0 = (startedAt = "2026-10-31T12:00:00Z", budget = 110): InvestigationEvent => ({
    seq: 1,
    request_id: "request_run",
    type: "accepted",
    reserved_result_id: RESERVED,
    started_at: startedAt,
    budget_seconds: budget,
});
const stage = (seq: number, elapsed: number, state: "started" | "completed" = "started") =>
    at(seq, stageEvent("reading_facts", state, elapsed), "request_run");
const beat = (seq: number, elapsed: number) => at(seq, heartbeat(elapsed), "request_run");
const resultAt = (seq: number, result: TranscriptResult = PARTIAL): InvestigationEvent => ({
    seq,
    request_id: "request_run",
    type: "result",
    result,
});
const errorAt = (seq: number, code: string): InvestigationEvent => ({
    seq,
    request_id: "request_run",
    type: "error",
    reserved_result_id: RESERVED,
    error: acrError(code, 422, false),
});

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
const lastTurn = (store: ConversationStore) => snap(store).turns.at(-1)!;
const kind = (store: ConversationStore) => lastTurn(store).outcome.kind;
const infoEvents = (message: string) =>
    log.info.mock.calls.filter(([, text]) => text === message).map(([fields]) => fields as object);

/** Submits one question whose stream delivers `events` and then drops (no terminal). */
async function droppedRun(store: ConversationStore, events: InvestigationEvent[]) {
    transport.scripts.push(events);
    store.submit("Which projects are at risk?");
    await vi.waitFor(() => expect(transport.attachCalls.length).toBeGreaterThan(0));
}

beforeEach(() => {
    transport = new FakeTransport();
    clock = START;
    stored = null;
    vi.clearAllMocks();
});

afterEach(() => {
    vi.useRealTimers();
});

describe("attach after the store's own stream dropped (design §5.2)", () => {
    it("resumes from the last seq seen, with no new investigation", async () => {
        const store = makeStore();
        transport.attachScripts.push([stage(3, 1000, "completed"), resultAt(4)]);
        await droppedRun(store, [accepted0(), stage(2, 500)]);
        await vi.waitFor(() => expect(kind(store)).toBe("answered"));
        expect(transport.attachCalls[0]!.lastEventId).toBe(2);
        expect(transport.calls).toHaveLength(1);
        expect(transport.statusCalls).toEqual([]);
    });

    it("a gap attaches again from the same cursor", async () => {
        const store = makeStore();
        transport.attachScripts.push([stage(4, 1000)], [stage(3, 900), resultAt(4)]);
        await droppedRun(store, [accepted0(), stage(2, 500)]);
        await vi.waitFor(() => expect(kind(store)).toBe("answered"));
        expect(transport.attachCalls.map((call) => call.lastEventId)).toEqual([2, 2]);
        expect(infoEvents("ask-dev attach selected")).toHaveLength(2);
    });

    it("drops an identical repeat of an older event, with no protocol error", async () => {
        const store = makeStore();
        transport.attachScripts.push([stage(2, 500), stage(3, 1000), resultAt(4)]);
        await droppedRun(store, [accepted0(), stage(2, 500)]);
        await vi.waitFor(() => expect(kind(store)).toBe("answered"));
        expect(transport.attachCalls).toHaveLength(1);
    });

    it("an older event across a reattach is a duplicate too (r3 F7): 2@500, 3@1000, then 2 again", async () => {
        const store = makeStore();
        transport.attachScripts.push(
            [stage(3, 1000), { fail: new TransportFailure("stalled") }],
            [stage(2, 500), stage(3, 1000), stage(4, 1500), resultAt(5)],
        );
        await droppedRun(store, [accepted0(), stage(2, 500)]);
        await vi.waitFor(() => expect(kind(store)).toBe("answered"));
        expect(transport.attachCalls.map((call) => call.lastEventId)).toEqual([2, 3]);
    });

    // Each bad event is followed by events that would finish the run if it were taken: only a
    // second attach (the protocol error) tells the two apart.
    it.each([
        ["a changed payload at an older seq", [stage(2, 600), stage(3, 900), resultAt(4)]],
        [
            "another request_id",
            [at(3, stageEvent("reading_facts", "started", 900), "request_other"), resultAt(4)],
        ],
        ["an elapsed that goes back", [stage(3, 400), resultAt(4)]],
        ["an elapsed that jumps more than 11 s", [stage(3, 500 + 11_001), resultAt(4)]],
    ])("%s is a protocol error: the store attaches again", async (_, bad) => {
        const store = makeStore();
        transport.attachScripts.push(bad as InvestigationEvent[], [stage(3, 900), resultAt(4)]);
        await droppedRun(store, [accepted0(), stage(2, 500)]);
        await vi.waitFor(() => expect(kind(store)).toBe("answered"));
        expect(transport.attachCalls).toHaveLength(2);
    });

    it("410 cursor_expired reads the status, then replays the final result", async () => {
        const store = makeStore();
        transport.attachScripts.push([{ fail: cursorExpired("expired") }]);
        transport.statuses.push(status("done", "result_000000000009"));
        transport.results.set("result_000000000009", answer(9));
        await droppedRun(store, [accepted0()]);
        await vi.waitFor(() => expect(kind(store)).toBe("answered"));
        expect(transport.readCalls).toEqual(["result_000000000009"]);
        expect(infoEvents("ask-dev attach fell back")).toEqual([
            {
                submission_id: transport.calls[0]!.submissionId,
                reason: "cursor_expired",
                attempts: 1,
            },
        ]);
    });

    it(`gives up after ${String(ATTACH_ATTEMPTS)} attaches and reads the status`, async () => {
        const store = makeStore();
        transport.attachScripts.push([], [], []);
        transport.statuses.push(status("abandoned"));
        await droppedRun(store, [accepted0()]);
        await vi.waitFor(() => expect(kind(store)).toBe("interrupted"));
        expect(transport.attachCalls).toHaveLength(ATTACH_ATTEMPTS);
    });

    it("a run_lost terminal on the attach is the interrupted state", async () => {
        const store = makeStore();
        transport.attachScripts.push([errorAt(2, "run_lost")]);
        await droppedRun(store, [accepted0()]);
        await vi.waitFor(() => expect(kind(store)).toBe("interrupted"));
    });

    it("before accepted, nothing is attached: only the status can say", async () => {
        const store = makeStore();
        transport.scripts.push([]);
        transport.statuses.push(status("abandoned"));
        store.submit("Which projects are at risk?");
        await vi.waitFor(() => expect(snap(store).inFlight).toBe(false));
        expect(transport.attachCalls).toEqual([]);
    });

    it("a late event of an attachment the store let go changes nothing (ownership)", async () => {
        const store = makeStore();
        const gate = deferred();
        transport.attachScripts.push([{ wait: gate.promise }, resultAt(2)]);
        await droppedRun(store, [accepted0()]);
        const turnId = lastTurn(store).id;
        store.newConversation();
        gate.resolve();
        await vi.waitFor(() =>
            expect(infoEvents("ask-dev stale answer dropped")).toContainEqual(
                expect.objectContaining({ operation: "attach" }),
            ),
        );
        expect(snap(store).turns.find((turn) => turn.id === turnId)).toBeUndefined();
        expect(snap(store).inFlight).toBe(false);
    });
});

describe("a restored running turn (design §5.2, §5.3)", () => {
    function restoreRunning(store: ConversationStore) {
        transport.threads.set(THREAD_A, threadView(THREAD_A, [threadTurn(SUB, "running")]));
        store.selectThread(THREAD_A, "incoming");
    }

    it("attaches from accepted with no cursor, shows progress, and ends on the terminal", async () => {
        const store = makeStore();
        const gate = deferred();
        transport.attachScripts.push([
            accepted0(),
            stage(2, 500),
            { wait: gate.promise },
            resultAt(3),
        ]);
        restoreRunning(store);
        await vi.waitFor(() => expect(kind(store)).toBe("running"));
        expect(transport.attachCalls[0]!.lastEventId).toBeUndefined();
        expect(snap(store).stoppable).toBe(true);
        gate.resolve();
        await vi.waitFor(() => expect(kind(store)).toBe("answered"));
        expect(transport.calls).toEqual([]);
        expect(snap(store).inFlight).toBe(false);
    });

    it("takes D from accepted: started_at + budget + 30 s, and ends interrupted there", async () => {
        vi.useFakeTimers();
        const store = makeStore({ now: Date.now });
        vi.setSystemTime(START);
        transport.attachScripts.push([
            accepted0("2026-10-31T11:59:00Z", 60),
            { wait: new Promise(() => undefined) },
        ]);
        restoreRunning(store);
        await vi.advanceTimersByTimeAsync(0);
        expect(kind(store)).toBe("running");
        // D = 11:59:00 + 60 s + 30 s = 12:00:30, 30 s after now.
        await vi.advanceTimersByTimeAsync(BUDGET_GRACE_MS - 1);
        expect(kind(store)).toBe("running");
        await vi.advanceTimersByTimeAsync(1);
        expect(kind(store)).toBe("interrupted");
        expect(infoEvents("ask-dev observed run expired")).toEqual([
            { submission_id: SUB, deadline_source: "accepted" },
        ]);
    });

    it("a fallback after accepted keeps the known D: no new 10-minute window", async () => {
        const store = makeStore();
        transport.attachScripts.push(
            [accepted0("2026-10-31T11:59:00Z", 60)],
            [{ fail: cursorExpired("ended") }],
        );
        transport.statuses.push(status("running"));
        restoreRunning(store);
        await vi.waitFor(() => expect(kind(store)).toBe("interrupted"), { timeout: 5_000 });
        // The status loop stops at D (12:00:30), well before a 10-minute cap.
        expect(clock - START).toBeLessThanOrEqual(30_000);
    });

    it("at the observation cap with only failed reads: unconfirmed, no last-seen time, the composer opens", async () => {
        const store = makeStore();
        transport.statuses.push(new Error("network"));
        restoreRunning(store);
        await vi.waitFor(() => expect(kind(store)).toBe("unconfirmed"), { timeout: 5_000 });
        expect(lastTurn(store).outcome).toEqual({
            kind: "unconfirmed",
            lastSeenRunningAt: undefined,
        });
        expect(snap(store).inFlight).toBe(false);
        expect(infoEvents("ask-dev observed run expired")).toEqual([
            { submission_id: SUB, deadline_source: "observation_cap" },
        ]);
    });

    it("names only the last status read that succeeded and said running", async () => {
        const store = makeStore();
        transport.statuses.push(status("running"), new Error("network"));
        restoreRunning(store);
        await vi.waitFor(() => expect(kind(store)).toBe("unconfirmed"), { timeout: 5_000 });
        // The one successful read came first, at the start (the attach fell back at once).
        expect(lastTurn(store).outcome).toEqual({ kind: "unconfirmed", lastSeenRunningAt: START });
    });

    it("410 on the first attach falls back to the status (an ACR without the lease)", async () => {
        const store = makeStore();
        transport.statuses.push(status("done", "result_000000000009"));
        transport.results.set("result_000000000009", answer(9));
        restoreRunning(store);
        await vi.waitFor(() => expect(kind(store)).toBe("answered"));
        expect(transport.attachCalls).toHaveLength(1);
    });
});

describe("Stop through the cancel endpoint (design §5.4)", () => {
    async function running(
        store: ConversationStore,
        rest: ({ wait: Promise<void> } | InvestigationEvent)[],
    ) {
        transport.scripts.push([accepted0(), ...rest]);
        store.submit("Which projects are at risk?");
        await vi.waitFor(() => expect(lastTurn(store).reservedResultId).toBe(RESERVED));
    }

    it("202: Canceling…, the stream stays open, and its canceled terminal ends the turn", async () => {
        const store = makeStore();
        const gate = deferred();
        transport.cancelAnswers.push({ kind: "running" });
        await running(store, [{ wait: gate.promise }, errorAt(2, "canceled")]);
        store.cancel();
        await vi.waitFor(() => expect(kind(store)).toBe("canceling"));
        expect(transport.calls[0]!.signal.aborted).toBe(false);
        expect(snap(store).inFlight).toBe(true);
        expect(snap(store).stoppable).toBe(false);
        gate.resolve();
        await vi.waitFor(() => expect(kind(store)).toBe("canceled"));
    });

    it("202, then a result that finished first wins and is kept", async () => {
        const store = makeStore();
        const gate = deferred();
        transport.cancelAnswers.push({ kind: "running" });
        await running(store, [{ wait: gate.promise }, resultAt(2)]);
        store.cancel();
        await vi.waitFor(() => expect(kind(store)).toBe("canceling"));
        gate.resolve();
        await vi.waitFor(() => expect(kind(store)).toBe("answered"));
    });

    it("202, then the stream drops: the store attaches and ends on the canceled terminal", async () => {
        const store = makeStore();
        const gate = deferred();
        transport.cancelAnswers.push({ kind: "running" });
        transport.attachScripts.push([errorAt(2, "canceled")]);
        await running(store, [{ wait: gate.promise }]);
        store.cancel();
        await vi.waitFor(() => expect(kind(store)).toBe("canceling"));
        gate.resolve();
        await vi.waitFor(() => expect(kind(store)).toBe("canceled"));
        expect(transport.attachCalls[0]!.lastEventId).toBe(1);
    });

    it("a delayed 202: one cancel call for a double Stop, and Stopping… meanwhile", async () => {
        const store = makeStore();
        const gate = deferred();
        transport.cancelGate = gate.promise;
        transport.cancelAnswers.push({ kind: "running" });
        await running(store, [{ wait: new Promise(() => undefined) }]);
        store.cancel();
        store.cancel();
        expect(lastTurn(store).stop).toBe("requested");
        expect(snap(store).stoppable).toBe(false);
        gate.resolve();
        await vi.waitFor(() => expect(kind(store)).toBe("canceling"));
        expect(transport.cancelCalls).toHaveLength(1);
    });

    it.each([
        ["done", status("done", "result_000000000009"), "answered"],
        ["done_unsaved", status("done_unsaved"), "unsaved"],
        ["abandoned", status("abandoned"), "halted"],
    ])("204, then the status says %s → %s", async (_, answered, expected) => {
        const store = makeStore();
        transport.cancelAnswers.push({ kind: "final" });
        transport.statuses.push(answered);
        transport.results.set("result_000000000009", answer(9));
        await running(store, [{ wait: new Promise(() => undefined) }]);
        store.cancel();
        await vi.waitFor(() => expect(kind(store)).toBe(expected));
    });

    it("404 (not the caller's open submission any more) reads the status like a 204", async () => {
        const store = makeStore();
        transport.cancelAnswers.push({
            fail: new TransportRefusal(404, acrError("not_found", 404, false)),
        });
        transport.statuses.push(status("done", "result_000000000009"));
        transport.results.set("result_000000000009", answer(9));
        await running(store, [{ wait: new Promise(() => undefined) }]);
        store.cancel();
        await vi.waitFor(() => expect(kind(store)).toBe("answered"));
        expect(transport.statusCalls.length).toBeGreaterThan(0);
    });

    it("409 not_leased on a restored run: it cannot be stopped, the store keeps observing, no second cancel", async () => {
        const store = makeStore();
        transport.threads.set(THREAD_A, threadView(THREAD_A, [threadTurn(SUB, "running")]));
        transport.attachScripts.push([accepted0(), { wait: new Promise(() => undefined) }]);
        transport.cancelAnswers.push({ kind: "not_leased" });
        store.selectThread(THREAD_A, "incoming");
        await vi.waitFor(() => expect(kind(store)).toBe("running"));
        store.cancel();
        await vi.waitFor(() => expect(lastTurn(store).stop).toBe("not_leased"));
        expect(kind(store)).toBe("running");
        expect(snap(store).stoppable).toBe(false);
        store.cancel();
        expect(transport.cancelCalls).toEqual([SUB]);
    });

    it("Stop before accepted disconnects (nothing is admitted to cancel)", async () => {
        const store = makeStore();
        transport.scripts.push([{ wait: new Promise(() => undefined) }]);
        store.submit("Which projects are at risk?");
        store.cancel();
        expect(transport.calls[0]!.signal.aborted).toBe(true);
        expect(kind(store)).toBe("canceled");
        expect(transport.cancelCalls).toEqual([]);
    });

    it("a cancel that did not reach ACR leaves the run running and Stop available", async () => {
        const store = makeStore();
        transport.cancelAnswers.push({ fail: new Error("network") });
        await running(store, [{ wait: new Promise(() => undefined) }]);
        store.cancel();
        await vi.waitFor(() =>
            expect(log.warn).toHaveBeenCalledWith(expect.anything(), "ask-dev cancel not sent"),
        );
        expect(lastTurn(store).stop).toBeUndefined();
        expect(kind(store)).toBe("running");
        expect(snap(store).stoppable).toBe(true);
    });

    it("logs the browser's own request time, never as t_req, and no content", async () => {
        const store = makeStore();
        transport.cancelAnswers.push({ kind: "running" });
        await running(store, [{ wait: new Promise(() => undefined) }]);
        store.cancel();
        await vi.waitFor(() => expect(kind(store)).toBe("canceling"));
        const [requested] = infoEvents("ask-dev cancel requested");
        expect(Object.keys(requested!).sort()).toEqual(["browser_requested_at", "submission_id"]);
        expect(infoEvents("ask-dev cancel answered")).toEqual([
            { submission_id: transport.calls[0]!.submissionId, answer: "running" },
        ]);
        expect(JSON.stringify(log.info.mock.calls)).not.toContain("t_req");
        expect(JSON.stringify(log.info.mock.calls)).not.toContain("Which projects are at risk?");
    });
});

describe("codex r1 on #1657", () => {
    it("a late accepted on the attach keeps a confirmed Canceling… (P2-1)", async () => {
        const store = makeStore();
        transport.threads.set(THREAD_A, threadView(THREAD_A, [threadTurn(SUB, "running")]));
        const late = deferred();
        transport.attachScripts.push([
            { wait: late.promise },
            accepted0(),
            { wait: new Promise(() => undefined) },
        ]);
        transport.cancelAnswers.push({ kind: "running" });
        store.selectThread(THREAD_A, "incoming");
        await vi.waitFor(() => expect(transport.attachCalls).toHaveLength(1));
        store.cancel();
        await vi.waitFor(() => expect(kind(store)).toBe("canceling"));
        late.resolve();
        await vi.waitFor(() =>
            expect(infoEvents("ask-dev attach selected").length).toBeGreaterThan(0),
        );
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(kind(store)).toBe("canceling");
        expect(snap(store).stoppable).toBe(false);
        expect(transport.cancelCalls).toEqual([SUB]);
    });

    it("a restored run's answer read that never answers ends at D, and the composer opens (P2-2)", async () => {
        vi.useFakeTimers();
        const store = makeStore({
            now: Date.now,
            sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        });
        vi.setSystemTime(START);
        transport.threads.set(THREAD_A, threadView(THREAD_A, [threadTurn(SUB, "running")]));
        transport.attachScripts.push([
            accepted0("2026-10-31T11:59:00Z", 60),
            { fail: cursorExpired("ended") },
        ]);
        transport.statuses.push(status("done", "result_000000000009"));
        transport.readHangs = true;
        store.selectThread(THREAD_A, "incoming");
        await vi.advanceTimersByTimeAsync(0);
        expect(kind(store)).toBe("restoring");
        expect(snap(store).inFlight).toBe(true);
        // D = 11:59:00 + 60 s + 30 s = 12:00:30.
        await vi.advanceTimersByTimeAsync(BUDGET_GRACE_MS);
        expect(kind(store)).toBe("interrupted");
        expect(snap(store).inFlight).toBe(false);
        expect(snap(store).replaying).toBe(false);
    });

    it("an answer that arrives after D changes nothing: the turn stays interrupted", async () => {
        vi.useFakeTimers();
        const store = makeStore({
            now: Date.now,
            sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        });
        vi.setSystemTime(START);
        transport.threads.set(THREAD_A, threadView(THREAD_A, [threadTurn(SUB, "running")]));
        transport.attachScripts.push([
            accepted0("2026-10-31T11:59:00Z", 60),
            { fail: cursorExpired("ended") },
        ]);
        transport.statuses.push(status("done", "result_000000000009"));
        transport.results.set("result_000000000009", answer(9));
        const late = deferred();
        transport.readGates.set("result_000000000009", late.promise);
        store.selectThread(THREAD_A, "incoming");
        await vi.advanceTimersByTimeAsync(BUDGET_GRACE_MS);
        expect(kind(store)).toBe("interrupted");
        late.resolve();
        await vi.advanceTimersByTimeAsync(0);
        expect(kind(store)).toBe("interrupted");
        expect(snap(store).inFlight).toBe(false);
    });
});
