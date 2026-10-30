import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import projectStatusPartial from "./captures/kiac_project_status_partial.event.json";
import windowClarification from "./captures/kiac_blocked_now_window_clarification.event.json";
import budgetRefusal from "./captures/acr_encoder_budget_refusal_result_count.event.json";

const answer = projectStatusPartial.result;
const clarification = windowClarification.result;
const refusal = { question: "Which repositories have the most open work?", refusal: budgetRefusal };

/** The module reads test mode once, at load (as the bundler does at build): load it per case. */
async function load(testMode: string | undefined) {
    vi.resetModules();
    if (testMode !== undefined) vi.stubEnv("NEXT_PUBLIC_DEV_HEALTH_TEST_MODE", testMode);
    return import("../testModeAnswer");
}

afterEach(() => {
    vi.unstubAllEnvs();
    window.sessionStorage.clear();
});

describe("asTranscriptResult, asRefusalTurn, asTranscriptTurns", () => {
    it("accepts real captured answers, clarifications and refusals, alone or as turns", async () => {
        const { asTranscriptResult, asRefusalTurn, asTranscriptTurns } = await load("true");
        expect(asTranscriptResult(answer)).toBe(answer);
        expect(asTranscriptResult(clarification)).toBe(clarification);
        expect(asRefusalTurn(refusal)).toBe(refusal);
        expect(asTranscriptResult(refusal)).toBeNull();
        expect(asRefusalTurn(answer)).toBeNull();
        expect(asTranscriptTurns([clarification, refusal, answer])).toEqual([
            clarification,
            refusal,
            answer,
        ]);
        expect(asTranscriptTurns(answer)).toEqual([answer]);
    });

    it.each([
        ["no question", () => ({ refusal: budgetRefusal })],
        ["a result event", () => ({ question: "q", refusal: projectStatusPartial })],
        [
            "no reserved result id",
            () => ({ question: "q", refusal: { ...budgetRefusal, reserved_result_id: undefined } }),
        ],
        [
            "not an error.v1 envelope",
            () => ({
                question: "q",
                refusal: { ...budgetRefusal, error: { error: budgetRefusal.error.error } },
            }),
        ],
        [
            "retryable not a boolean",
            () => ({
                question: "q",
                refusal: {
                    ...budgetRefusal,
                    error: {
                        ...budgetRefusal.error,
                        error: { ...budgetRefusal.error.error, retryable: "no" },
                    },
                },
            }),
        ],
        [
            // A copy of a real refusal with another terminal error's code and status.
            "another terminal error (a 504)",
            () => ({
                question: "q",
                refusal: {
                    ...budgetRefusal,
                    error: {
                        ...budgetRefusal.error,
                        error: {
                            ...budgetRefusal.error.error,
                            code: "upstream_unavailable",
                            http_status: 504,
                            retryable: true,
                        },
                    },
                },
            }),
        ],
    ])("refuses a refusal turn with %s", async (_label, make) => {
        const { asRefusalTurn } = await load("true");
        expect(asRefusalTurn(make())).toBeNull();
    });

    it.each([
        ["null", () => null],
        ["a string", () => "answer"],
        ["an unknown status", () => ({ ...answer, status: "done" })],
        ["drivers not an array", () => ({ ...answer, drivers: {} })],
        ["no direct judgment", () => ({ ...answer, direct_judgment: undefined })],
        ["no result id", () => ({ ...answer, result_id: undefined })],
        ["no subject resolution", () => ({ ...clarification, subject_resolution: undefined })],
        ["no versions", () => ({ ...answer, versions: undefined })],
    ])("refuses %s", async (_label, make) => {
        const { asTranscriptResult } = await load("true");
        expect(asTranscriptResult(make())).toBeNull();
    });

    it("refuses a list with one bad turn", async () => {
        const { asTranscriptTurns } = await load("true");
        expect(asTranscriptTurns([clarification, { status: "partial" }])).toBeNull();
    });
});

describe("useTestModeTurns", () => {
    it("returns the stored turns and the choice and re-ask sinks in test mode", async () => {
        const {
            TEST_MODE_ANSWER_KEY,
            TEST_MODE_CHOICE_KEY,
            TEST_MODE_REASK_KEY,
            useTestModeTurns,
        } = await load("true");
        window.sessionStorage.setItem(
            TEST_MODE_ANSWER_KEY,
            JSON.stringify([clarification, refusal, answer]),
        );
        const { result } = renderHook(() => useTestModeTurns());
        expect(result.current.turns).toEqual([clarification, refusal, answer]);
        const choice = { parentResultId: "result_x", receipts: {} };
        result.current.onConfirm?.(choice);
        expect(JSON.parse(window.sessionStorage.getItem(TEST_MODE_CHOICE_KEY) ?? "null")).toEqual(
            choice,
        );
        const reask = { question: refusal.question, axis: "result_count" as const };
        result.current.onReask?.(reask);
        expect(JSON.parse(window.sessionStorage.getItem(TEST_MODE_REASK_KEY) ?? "null")).toEqual(
            reask,
        );
    });

    it.each([undefined, "false", "1"])(
        "is the no-turns hook outside test mode (NEXT_PUBLIC_DEV_HEALTH_TEST_MODE=%s)",
        async (value) => {
            const { TEST_MODE_ANSWER_KEY, useTestModeTurns } = await load(value);
            window.sessionStorage.setItem(TEST_MODE_ANSWER_KEY, JSON.stringify(answer));
            const { result } = renderHook(() => useTestModeTurns());
            expect(result.current.turns).toEqual([]);
            expect(result.current.onConfirm).toBeUndefined();
            expect(result.current.onReask).toBeUndefined();
            expect(useTestModeTurns.name).toBe("useNoTurns");
        },
    );

    it("is the no-turns hook in a production build, even with test mode set", async () => {
        vi.stubEnv("NODE_ENV", "production");
        const { TEST_MODE_ANSWER_KEY, useTestModeTurns } = await load("true");
        window.sessionStorage.setItem(TEST_MODE_ANSWER_KEY, JSON.stringify(answer));
        const { result } = renderHook(() => useTestModeTurns());
        expect(result.current.turns).toEqual([]);
        expect(useTestModeTurns.name).toBe("useNoTurns");
    });

    it.each([
        ["not JSON", "{not json"],
        ["not a result", JSON.stringify({ status: "partial" })],
    ])("returns no turns for a stored value that is %s", async (_label, raw) => {
        const { TEST_MODE_ANSWER_KEY, useTestModeTurns } = await load("true");
        window.sessionStorage.setItem(TEST_MODE_ANSWER_KEY, raw);
        const { result } = renderHook(() => useTestModeTurns());
        expect(result.current.turns).toEqual([]);
    });
});
