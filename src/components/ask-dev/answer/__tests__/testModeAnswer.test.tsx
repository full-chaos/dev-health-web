import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import projectStatusPartial from "./captures/kiac_project_status_partial.event.json";

const real = projectStatusPartial.result;

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

describe("asAnswerResult", () => {
    it("accepts a real captured answer", async () => {
        const { asAnswerResult } = await load("true");
        expect(asAnswerResult(real)).toBe(real);
    });

    it.each([
        ["null", () => null],
        ["a string", () => "answer"],
        ["an unknown status", () => ({ ...real, status: "done" })],
        ["drivers not an array", () => ({ ...real, drivers: {} })],
        ["no direct judgment", () => ({ ...real, direct_judgment: undefined })],
        ["no versions", () => ({ ...real, versions: undefined })],
    ])("refuses %s", async (_label, make) => {
        const { asAnswerResult } = await load("true");
        expect(asAnswerResult(make())).toBeNull();
    });
});

describe("useTestModeAnswer", () => {
    it("returns the stored answer in test mode", async () => {
        const { TEST_MODE_ANSWER_KEY, useTestModeAnswer } = await load("true");
        window.sessionStorage.setItem(TEST_MODE_ANSWER_KEY, JSON.stringify(real));
        const { result } = renderHook(() => useTestModeAnswer());
        expect(result.current?.direct_judgment).toBe(real.direct_judgment);
    });

    it.each([undefined, "false", "1"])(
        "is the no-answer hook outside test mode (NEXT_PUBLIC_DEV_HEALTH_TEST_MODE=%s)",
        async (value) => {
            const { TEST_MODE_ANSWER_KEY, useTestModeAnswer } = await load(value);
            window.sessionStorage.setItem(TEST_MODE_ANSWER_KEY, JSON.stringify(real));
            const { result } = renderHook(() => useTestModeAnswer());
            expect(result.current).toBeNull();
            expect(useTestModeAnswer.name).toBe("useNoAnswer");
        },
    );

    it("is the no-answer hook in a production build, even with test mode set", async () => {
        vi.stubEnv("NODE_ENV", "production");
        const { TEST_MODE_ANSWER_KEY, useTestModeAnswer } = await load("true");
        window.sessionStorage.setItem(TEST_MODE_ANSWER_KEY, JSON.stringify(real));
        const { result } = renderHook(() => useTestModeAnswer());
        expect(result.current).toBeNull();
        expect(useTestModeAnswer.name).toBe("useNoAnswer");
    });

    it.each([
        ["not JSON", "{not json"],
        ["not an answer", JSON.stringify({ status: "partial" })],
    ])("returns nothing for a stored value that is %s", async (_label, raw) => {
        const { TEST_MODE_ANSWER_KEY, useTestModeAnswer } = await load("true");
        window.sessionStorage.setItem(TEST_MODE_ANSWER_KEY, raw);
        const { result } = renderHook(() => useTestModeAnswer());
        expect(result.current).toBeNull();
    });
});
