// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const track = vi.hoisted(() => vi.fn());
vi.mock("@/lib/telemetry", () => ({ trackTelemetryEvent: track }));

import { emitAskDevInteraction } from "../emitters";
import { applyTelemetrySchema, ASK_DEV_ACTIONS, ASK_DEV_TERMINALS } from "../schema";

// CHAOS-11961, plan E7 AC-5: "open/submit/expand/cancel/retry/terminal kind; route id and counts
// only; no identity, free text, URL or request id." The privacy test: the schema keeps exactly
// those four fields, whatever else a caller puts on the payload.
describe("the ask_dev_interacted schema", () => {
    const VALID = { action: "terminal", surface: "panel", terminal: "limited", turnCount: 3 };

    it("keeps a valid payload unchanged", () => {
        expect(applyTelemetrySchema("ask_dev_interacted", VALID)).toEqual({
            ok: true,
            payload: VALID,
        });
    });

    it("drops every field it does not name: text, ids, a URL, identity", () => {
        const result = applyTelemetrySchema("ask_dev_interacted", {
            ...VALID,
            question: "Which teams own the ops repository?",
            answer: "The platform team",
            threadId: "thread_5f969a77f1a94724813986820f8f44eb",
            submissionId: "sub_3e3c6c4e043a435e910ca7163ab8f69b",
            requestId: "req_1dee178327877d87ea89df0a3ad1b2c2",
            url: "https://example.test/dev?thread=thread_1",
            email: "ada@example.com",
            userId: "user_1",
        });
        expect(result).toEqual({ ok: true, payload: VALID });
    });

    it.each([
        ["an action outside the set", { ...VALID, action: "typed_question" }],
        ["a surface outside the set", { ...VALID, surface: "https://example.test/dev" }],
        ["no action", { surface: "panel", terminal: null, turnCount: null }],
    ])("refuses %s", (_label, payload) => {
        expect(applyTelemetrySchema("ask_dev_interacted", payload).ok).toBe(false);
    });

    it("drops a terminal outside the set and a turn count that is not a count, and keeps the event", () => {
        const result = applyTelemetrySchema("ask_dev_interacted", {
            ...VALID,
            terminal: "the answer was: 42",
            turnCount: "3 turns",
        });
        expect(result).toEqual({ ok: true, payload: { action: "terminal", surface: "panel" } });
    });

    it("names six actions", () => {
        expect([...ASK_DEV_ACTIONS]).toEqual([
            "open",
            "submit",
            "expand",
            "cancel",
            "retry",
            "terminal",
        ]);
    });
});

describe("emitAskDevInteraction", () => {
    beforeEach(() => {
        track.mockClear();
    });
    afterEach(() => {
        window.history.replaceState(null, "", "/");
    });

    it("sends the action, the panel surface off /dev, a null terminal and the count", () => {
        window.history.replaceState(null, "", "/dashboard?thread=thread_1");
        emitAskDevInteraction({ action: "submit", turnCount: 2 });
        expect(track).toHaveBeenCalledExactlyOnceWith("ask_dev_interacted", {
            action: "submit",
            surface: "panel",
            terminal: null,
            turnCount: 2,
        });
    });

    it("sends the page surface on /dev", () => {
        window.history.replaceState(null, "", "/dev?thread=thread_1");
        emitAskDevInteraction({ action: "open" });
        expect(track.mock.calls[0]?.[1]).toMatchObject({ surface: "page", turnCount: null });
    });

    it.each(ASK_DEV_TERMINALS)("keeps the end kind %s", (terminal) => {
        emitAskDevInteraction({ action: "terminal", terminal, turnCount: 1 });
        expect(track.mock.calls[0]?.[1]).toMatchObject({ terminal });
    });

    it("sends other for an end kind it does not know, never the kind's text", () => {
        emitAskDevInteraction({ action: "terminal", terminal: "a_new_kind", turnCount: 1 });
        expect(track.mock.calls[0]?.[1]).toMatchObject({ terminal: "other" });
    });

    it("never throws into the page", () => {
        track.mockImplementationOnce(() => {
            throw new Error("boom");
        });
        expect(() => emitAskDevInteraction({ action: "open" })).not.toThrow();
    });
});
