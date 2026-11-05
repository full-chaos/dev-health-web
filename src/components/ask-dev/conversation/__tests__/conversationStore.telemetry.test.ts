import { beforeEach, describe, expect, it, vi } from "vitest";

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: log }));
const emit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/telemetry/emitters", () => ({ emitAskDevInteraction: emit }));

import { ConversationStore } from "../conversationStore";
import {
    accepted,
    captureResult,
    deferred,
    errorEvent,
    FakeTransport,
    resultEvent,
} from "./fakeTransport";

// CHAOS-11961: the store's own interactions reach telemetry as closed ids and counts. The text of a
// question, a thread, submission or request id never enters the call.
const PARTIAL = captureResult("kiac_project_status_partial.event.json");
const QUESTION = "Which projects are at risk? This text must never reach telemetry.";

let transport: FakeTransport;
let n: number;

function makeStore(): ConversationStore {
    const store = new ConversationStore({
        transport,
        now: () => Date.parse("2026-11-04T12:00:00Z"),
        sleep: async () => undefined,
        uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
    });
    store.setPartition("org-a\u0000user-1\u0000");
    return store;
}

const settled = (store: ConversationStore) =>
    vi.waitFor(() => expect(store.getSnapshot().inFlight).toBe(false));
const calls = () => emit.mock.calls.map(([input]) => input as Record<string, unknown>);

beforeEach(() => {
    transport = new FakeTransport();
    n = 0;
    vi.clearAllMocks();
});

describe("Ask Dev telemetry from the conversation store", () => {
    it("a submit and its answer: submit, then terminal answered, with the turn count", async () => {
        const store = makeStore();
        transport.scripts.push([resultEvent(PARTIAL)]);
        store.submit(QUESTION);
        await settled(store);
        expect(calls()).toEqual([
            { action: "submit", turnCount: 1 },
            { action: "terminal", terminal: "answered", turnCount: 1 },
        ]);
        expect(JSON.stringify(calls())).not.toContain("telemetry");
    });

    it("a refused submit sends nothing (blank)", () => {
        const store = makeStore();
        expect(store.submit("   ")).toBe(false);
        expect(calls()).toEqual([]);
    });

    it("a retry: submit, terminal failed, retry, terminal answered", async () => {
        const store = makeStore();
        transport.scripts.push([{ fail: new TypeError("network") }], [resultEvent(PARTIAL)]);
        transport.statuses.push(null);
        store.submit(QUESTION);
        await settled(store);
        const turn = store.getSnapshot().turns.at(-1)!;
        expect(store.retry(turn.id)).toBe(true);
        await settled(store);
        expect(calls()).toEqual([
            { action: "submit", turnCount: 1 },
            { action: "terminal", terminal: "failed", turnCount: 1 },
            { action: "retry", turnCount: 1 },
            { action: "terminal", terminal: "answered", turnCount: 1 },
        ]);
    });

    it("a terminal error ends as failed, with no retry sent", async () => {
        const store = makeStore();
        transport.scripts.push([accepted(), errorEvent("timeout")]);
        store.submit(QUESTION);
        await settled(store);
        const turn = store.getSnapshot().turns.at(-1)!;
        expect(store.retry(turn.id)).toBe(false);
        expect(calls().map((call) => call.action)).toEqual(["submit", "terminal"]);
        expect(calls()[1]).toMatchObject({ terminal: "failed" });
    });

    it("a cancel: submit, cancel, terminal canceled", async () => {
        const store = makeStore();
        const gate = deferred();
        transport.scripts.push([accepted(), { wait: gate.promise }, resultEvent(PARTIAL)]);
        store.submit(QUESTION);
        await vi.waitFor(() =>
            expect(store.getSnapshot().turns.at(-1)!.reservedResultId).toBeDefined(),
        );
        store.cancel();
        await settled(store);
        expect(calls()).toEqual([
            { action: "submit", turnCount: 1 },
            { action: "cancel", turnCount: 1 },
            { action: "terminal", terminal: "canceled", turnCount: 1 },
        ]);
        gate.resolve();
    });

    it("a cancel with nothing to stop sends nothing", async () => {
        const store = makeStore();
        transport.scripts.push([resultEvent(PARTIAL)]);
        store.submit(QUESTION);
        await settled(store);
        emit.mockClear();
        store.cancel();
        expect(calls()).toEqual([]);
    });
});
