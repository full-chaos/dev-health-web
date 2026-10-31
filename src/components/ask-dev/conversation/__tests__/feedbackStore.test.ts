import { beforeEach, describe, expect, it, vi } from "vitest";

const log = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: log }));

import { FeedbackStore, type FeedbackEntry } from "../feedbackStore";
import { TransportFailure, TransportRefusal } from "../transport";
import { acrError, deferred, FakeTransport } from "./fakeTransport";

/**
 * CHAOS-11958 (I-32b), E6 web design v5 §6: answer feedback. Every test runs on the test-mode seam;
 * the live proofs are CHAOS-12234.
 */

const ORG_A = "org-a\u0000user-1\u0000";
const ORG_B = "org-b\u0000user-1\u0000";
const IMPERSONATING = "org-a\u0000user-1\u0000user-9";
const R1 = "result_000000000001";
const R2 = "result_000000000002";

let transport: FakeTransport;
let store: FeedbackStore;

/** Lets every settled promise run its continuation. */
const flush = async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

const entry = (resultId = R1): FeedbackEntry => {
    const value = store.entry(resultId);
    if (value === undefined) throw new Error(`no feedback entry for ${resultId}`);
    return value;
};

/** A ready entry for R1 (never rated unless `stored` says otherwise). */
async function ready(stored?: { correct: "yes" | "no" | "unset"; useful: "yes" | "no" | "unset" }) {
    if (stored !== undefined) transport.feedback.set(R1, { resultId: R1, ...stored });
    store.ensure(R1);
    await flush();
    expect(entry().state).toBe("ready");
}

const sets = () => transport.feedbackSetCalls.map((call) => `${call.correct}/${call.useful}`);

beforeEach(() => {
    log.info.mockReset();
    log.warn.mockReset();
    log.error.mockReset();
    transport = new FakeTransport();
    store = new FeedbackStore({ transport });
    store.setPartition(ORG_A);
});

describe("the read (once per result per partition)", () => {
    it("a never-rated result reads unset/unset and is ready", async () => {
        store.ensure(R1);
        expect(entry().state).toBe("loading");
        await flush();
        expect(entry()).toMatchObject({
            state: "ready",
            confirmed: { correct: "unset", useful: "unset" },
            desired: { correct: "unset", useful: "unset" },
            saving: false,
            notSaved: false,
        });
    });

    it("a stored choice reads back as both the confirmed and the shown state", async () => {
        await ready({ correct: "yes", useful: "no" });
        expect(entry().confirmed).toEqual({ correct: "yes", useful: "no" });
        expect(entry().desired).toEqual({ correct: "yes", useful: "no" });
    });

    it("reads a result once, however many turns or surfaces show it (a reused answer)", async () => {
        store.ensure(R1);
        store.ensure(R1);
        await flush();
        store.ensure(R1);
        store.ensure(R2);
        await flush();
        expect(transport.feedbackReads).toEqual([R1, R2]);
    });

    it("ACR's 404 (null) is unavailable: the controls are hidden", async () => {
        transport.feedback.set(R1, null);
        store.ensure(R1);
        await flush();
        expect(entry().state).toBe("unavailable");
    });

    it("a 404 refusal is unavailable too, and logs nothing", async () => {
        transport.feedback.set(R1, {
            fail: new TransportRefusal(404, acrError("not_found", 404, false)),
        });
        store.ensure(R1);
        await flush();
        expect(entry().state).toBe("unavailable");
        expect(log.warn).not.toHaveBeenCalled();
    });

    it("a failed read is read_failed; Try again reads again (a GET) and becomes ready", async () => {
        transport.feedback.set(R1, { fail: new TransportFailure("invalid_upstream") });
        store.ensure(R1);
        await flush();
        expect(entry().state).toBe("read_failed");
        expect(store.choose(R1, "correct", "yes")).toBe(false);
        expect(log.warn).toHaveBeenCalledWith(
            { result_id: R1, status: "invalid_upstream" },
            "ask-dev feedback not read",
        );
        transport.feedback.delete(R1);
        expect(store.retryRead(R1)).toBe(true);
        expect(entry().state).toBe("loading");
        await flush();
        expect(entry().state).toBe("ready");
        expect(transport.feedbackReads).toEqual([R1, R1]);
        expect(transport.feedbackSetCalls).toEqual([]);
    });

    it("Try again is refused unless the read failed", async () => {
        await ready();
        expect(store.retryRead(R1)).toBe(false);
        expect(transport.feedbackReads).toEqual([R1]);
    });

    it("an answer for another result id is a failed read, never shown", async () => {
        transport.feedback.set(R1, { resultId: R2, correct: "yes", useful: "yes" });
        store.ensure(R1);
        await flush();
        expect(entry().state).toBe("read_failed");
        expect(entry().desired).toEqual({ correct: "unset", useful: "unset" });
    });

    it("refuses a choice while the read is out", () => {
        store.ensure(R1);
        expect(store.choose(R1, "useful", "yes")).toBe(false);
        expect(transport.feedbackSetCalls).toEqual([]);
    });
});

describe("a choice and its write", () => {
    it("shows the choice at once and sends the whole feedback; ACR's answer confirms it", async () => {
        await ready();
        expect(store.choose(R1, "correct", "yes")).toBe(true);
        expect(entry().desired).toEqual({ correct: "yes", useful: "unset" });
        expect(entry().saving).toBe(true);
        await flush();
        expect(sets()).toEqual(["yes/unset"]);
        expect(entry()).toMatchObject({
            confirmed: { correct: "yes", useful: "unset" },
            desired: { correct: "yes", useful: "unset" },
            saving: false,
        });
        expect(log.info).toHaveBeenCalledWith(
            { result_id: R1, revision: 1, status: 200 },
            "ask-dev feedback saved",
        );
    });

    it("pressing the chosen value again clears it (unset)", async () => {
        await ready({ correct: "no", useful: "yes" });
        store.choose(R1, "useful", "yes");
        expect(entry().desired.useful).toBe("unset");
        await flush();
        expect(sets()).toEqual(["no/unset"]);
        expect(entry().confirmed).toEqual({ correct: "no", useful: "unset" });
    });

    it("one write at a time: rapid changes to both flags while one is out go in ONE next write, the latest", async () => {
        await ready();
        const first = deferred();
        transport.feedbackSets.push({ gate: first.promise });
        store.choose(R1, "correct", "yes");
        await flush();
        store.choose(R1, "useful", "no");
        store.choose(R1, "correct", "no");
        store.choose(R1, "useful", "yes");
        await flush();
        // Answers can never arrive out of order: the next write waits for this one.
        expect(sets()).toEqual(["yes/unset"]);
        expect(entry().desired).toEqual({ correct: "no", useful: "yes" });
        first.resolve();
        await flush();
        expect(sets()).toEqual(["yes/unset", "no/yes"]);
        expect(entry()).toMatchObject({
            confirmed: { correct: "no", useful: "yes" },
            desired: { correct: "no", useful: "yes" },
            saving: false,
        });
    });

    it("a choice that comes back to what ACR stores sends nothing more", async () => {
        await ready();
        const first = deferred();
        transport.feedbackSets.push({ gate: first.promise });
        store.choose(R1, "correct", "yes");
        await flush();
        store.choose(R1, "useful", "no");
        store.choose(R1, "useful", "no");
        first.resolve();
        await flush();
        expect(sets()).toEqual(["yes/unset"]);
        expect(entry().saving).toBe(false);
    });

    it("N2: a failed write rolls back only its own change; a later choice is kept and sent next", async () => {
        await ready();
        const first = deferred();
        transport.feedbackSets.push({ gate: first.promise, fail: new Error("network") });
        store.choose(R1, "correct", "yes");
        await flush();
        store.choose(R1, "useful", "yes");
        first.resolve();
        await flush();
        expect(sets()).toEqual(["yes/unset", "unset/yes"]);
        expect(entry()).toMatchObject({
            confirmed: { correct: "unset", useful: "yes" },
            desired: { correct: "unset", useful: "yes" },
            notSaved: true,
            saving: false,
        });
        expect(log.info).toHaveBeenCalledWith(
            { result_id: R1, revision: 1, status: "network" },
            "ask-dev feedback not saved",
        );
    });

    it("a flag the failed write changed, and the user changed again since, keeps the new choice", async () => {
        await ready();
        const first = deferred();
        transport.feedbackSets.push({ gate: first.promise, fail: new Error("network") });
        store.choose(R1, "correct", "yes");
        await flush();
        store.choose(R1, "correct", "no");
        first.resolve();
        await flush();
        expect(sets()).toEqual(["yes/unset", "no/unset"]);
        expect(entry().confirmed).toEqual({ correct: "no", useful: "unset" });
        expect(entry().desired).toEqual({ correct: "no", useful: "unset" });
    });

    it("a failure after a newer success rolls back to what ACR confirmed last", async () => {
        await ready();
        store.choose(R1, "correct", "yes");
        await flush();
        transport.feedbackSets.push({
            fail: new TransportRefusal(503, acrError("unavailable", 503, true)),
        });
        store.choose(R1, "useful", "no");
        await flush();
        expect(sets()).toEqual(["yes/unset", "yes/no"]);
        expect(entry()).toMatchObject({
            confirmed: { correct: "yes", useful: "unset" },
            desired: { correct: "yes", useful: "unset" },
            notSaved: true,
            saving: false,
        });
    });

    it("the next choice clears 'not saved'", async () => {
        await ready();
        transport.feedbackSets.push({ fail: new Error("network") });
        store.choose(R1, "correct", "yes");
        await flush();
        expect(entry().notSaved).toBe(true);
        store.choose(R1, "useful", "yes");
        expect(entry().notSaved).toBe(false);
        await flush();
        expect(entry().confirmed).toEqual({ correct: "unset", useful: "yes" });
    });

    it("ACR's 404 on a write hides the controls", async () => {
        await ready();
        transport.feedbackSets.push({
            fail: new TransportRefusal(404, acrError("not_found", 404, false)),
        });
        store.choose(R1, "correct", "yes");
        await flush();
        expect(entry().state).toBe("unavailable");
        expect(store.choose(R1, "correct", "no")).toBe(false);
        expect(sets()).toEqual(["yes/unset"]);
    });

    it("shows what ACR stored when its answer differs, and does not send again", async () => {
        await ready();
        const original = transport.setFeedback;
        const spy = vi.spyOn(transport, "setFeedback").mockImplementationOnce(async (call) => {
            await original(call);
            return { resultId: R1, correct: "unset", useful: "unset" };
        });
        store.choose(R1, "correct", "yes");
        await flush();
        expect(spy).toHaveBeenCalledTimes(1);
        expect(entry().confirmed).toEqual({ correct: "unset", useful: "unset" });
        expect(entry().desired).toEqual({ correct: "unset", useful: "unset" });
        expect(entry().saving).toBe(false);
    });

    it("a write answer for another result id is a failed write", async () => {
        await ready();
        vi.spyOn(transport, "setFeedback").mockResolvedValueOnce({
            resultId: R2,
            correct: "yes",
            useful: "unset",
        });
        store.choose(R1, "correct", "yes");
        await flush();
        expect(entry()).toMatchObject({
            confirmed: { correct: "unset", useful: "unset" },
            desired: { correct: "unset", useful: "unset" },
            notSaved: true,
        });
    });

    it("two results write independently", async () => {
        await ready();
        store.ensure(R2);
        await flush();
        const gate = deferred();
        transport.feedbackSets.push({ gate: gate.promise });
        store.choose(R1, "correct", "yes");
        store.choose(R2, "useful", "no");
        await flush();
        expect(transport.feedbackSetCalls.map((call) => call.resultId)).toEqual([R1, R2]);
        gate.resolve();
        await flush();
        expect(entry(R1).confirmed).toEqual({ correct: "yes", useful: "unset" });
        expect(entry(R2).confirmed).toEqual({ correct: "unset", useful: "no" });
    });
});

describe("the partition (ownership)", () => {
    it("the first bind and the same key drop nothing", async () => {
        const fresh = new FeedbackStore({ transport });
        fresh.ensure(R1);
        fresh.setPartition(ORG_A);
        await flush();
        expect(fresh.entry(R1)?.state).toBe("ready");
        fresh.setPartition(ORG_A);
        expect(fresh.entry(R1)?.state).toBe("ready");
    });

    it("another key drops every entry, and the controls read again for the new partition", async () => {
        await ready({ correct: "yes", useful: "yes" });
        store.setPartition(ORG_B);
        expect(store.entry(R1)).toBeUndefined();
        transport.feedback.delete(R1);
        store.ensure(R1);
        await flush();
        expect(entry().desired).toEqual({ correct: "unset", useful: "unset" });
        expect(transport.feedbackReads).toEqual([R1, R1]);
    });

    it("signing out drops everything", async () => {
        await ready({ correct: "yes", useful: "yes" });
        store.setPartition(null);
        expect(store.entry(R1)).toBeUndefined();
    });

    it("a read answering after a partition change is dropped and leaves no entry loading", async () => {
        const gate = deferred();
        transport.feedbackReadGate = gate.promise;
        transport.feedback.set(R1, { resultId: R1, correct: "yes", useful: "yes" });
        store.ensure(R1);
        store.setPartition(ORG_B);
        gate.resolve();
        await flush();
        expect(store.entry(R1)).toBeUndefined();
        expect(log.info).toHaveBeenCalledWith(
            { operation: "feedback_read", scope: "feedback", revision: 0 },
            "ask-dev stale answer dropped",
        );
    });

    it("a write answering after an impersonation change is dropped: nothing of the old partition shows", async () => {
        await ready();
        const gate = deferred();
        transport.feedbackSets.push({ gate: gate.promise });
        store.choose(R1, "correct", "yes");
        await flush();
        store.setPartition(IMPERSONATING);
        gate.resolve();
        await flush();
        expect(store.entry(R1)).toBeUndefined();
        expect(log.info).toHaveBeenCalledWith(
            { operation: "feedback_write", scope: "feedback", revision: 1 },
            "ask-dev stale answer dropped",
        );
        expect(log.info).not.toHaveBeenCalledWith(expect.anything(), "ask-dev feedback saved");
        // The new partition's first choice is its own revision 1, not a follow-on of the old write.
        store.ensure(R1);
        await flush();
        expect(entry().confirmed).toEqual({ correct: "yes", useful: "unset" });
        store.choose(R1, "useful", "no");
        await flush();
        expect(log.info).toHaveBeenCalledWith(
            { result_id: R1, revision: 1, status: 200 },
            "ask-dev feedback saved",
        );
    });

    it("a partition change aborts the read and the write in flight", async () => {
        await ready();
        const signals: AbortSignal[] = [];
        vi.spyOn(transport, "setFeedback").mockImplementationOnce(
            (call) =>
                new Promise((_, reject) => {
                    signals.push(call.signal);
                    call.signal.addEventListener("abort", () => reject(call.signal.reason));
                }),
        );
        store.choose(R1, "correct", "yes");
        await flush();
        store.reset();
        expect(signals[0]?.aborted).toBe(true);
    });
});

describe("no free text, no telemetry, no flag value in the logs", () => {
    it("every log of the feedback store carries only ids, a revision, a status and an operation", async () => {
        await ready();
        transport.feedbackSets.push({ fail: new Error("network") });
        store.choose(R1, "correct", "yes");
        await flush();
        store.choose(R1, "useful", "no");
        await flush();
        transport.feedback.set(R2, { fail: new Error("network") });
        store.ensure(R2);
        await flush();
        const gate = deferred();
        transport.feedbackSets.push({ gate: gate.promise });
        store.choose(R1, "correct", "no");
        await flush();
        store.setPartition(ORG_B);
        gate.resolve();
        await flush();
        const calls = [...log.info.mock.calls, ...log.warn.mock.calls, ...log.error.mock.calls];
        // not saved, saved, not read, stale answer dropped
        expect(calls).toHaveLength(4);
        const allowed = new Set(["result_id", "revision", "status", "operation", "scope"]);
        for (const [fields] of calls) {
            for (const [key, value] of Object.entries(fields as Record<string, unknown>)) {
                expect(allowed.has(key), key).toBe(true);
                expect(["yes", "no", "unset"]).not.toContain(value);
            }
        }
    });
});
