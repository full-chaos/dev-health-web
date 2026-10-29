import { describe, expect, it } from "vitest";

import {
    ACR_MIN_WAIT_BUDGET_SECONDS,
    RUN_TIMEOUT_DEFAULT_MS,
    RUN_TIMEOUT_MAX_MS,
    RunDeadline,
    resolveRunTimeout,
} from "../deadline";

describe("resolveRunTimeout (ASK_DEV_RUN_TIMEOUT_MS)", () => {
    it.each([
        [undefined, RUN_TIMEOUT_DEFAULT_MS, "default"],
        ["", RUN_TIMEOUT_DEFAULT_MS, "default"],
        ["90000", 90_000, "configured"],
        ["600000", RUN_TIMEOUT_MAX_MS, "configured"],
        ["600001", RUN_TIMEOUT_MAX_MS, "clamped"],
        ["99999999", RUN_TIMEOUT_MAX_MS, "clamped"],
        ["0", RUN_TIMEOUT_DEFAULT_MS, "invalid"],
        ["-5", RUN_TIMEOUT_DEFAULT_MS, "invalid"],
        ["soon", RUN_TIMEOUT_DEFAULT_MS, "invalid"],
        ["1.5", RUN_TIMEOUT_DEFAULT_MS, "invalid"],
    ])("%s -> %s ms (%s)", (raw, ms, source) => {
        expect(resolveRunTimeout(raw)).toEqual({ ms, source });
    });
});

describe("RunDeadline", () => {
    function clock(start = 1_000_000) {
        let now = start;
        return {
            now: () => now,
            advance: (ms: number) => {
                now += ms;
            },
        };
    }

    it("fixes D at t0 + W and counts down", () => {
        const c = clock();
        const deadline = new RunDeadline(120_000, c.now);
        expect(deadline.deadlineAt).toBe(1_120_000);
        c.advance(8_000);
        expect(deadline.elapsedMs()).toBe(8_000);
        expect(deadline.remainingMs()).toBe(112_000);
    });

    it("never reports negative time", () => {
        const c = clock();
        const deadline = new RunDeadline(1_000, c.now);
        c.advance(5_000);
        expect(deadline.remainingMs()).toBe(0);
        expect(deadline.boundedMs(5_000)).toBe(0);
    });

    it("bounds a step by min(cap, D - now)", () => {
        const c = clock();
        const deadline = new RunDeadline(20_000, c.now);
        expect(deadline.boundedMs(5_000)).toBe(5_000);
        c.advance(17_000);
        expect(deadline.boundedMs(5_000)).toBe(3_000);
    });

    it("computes the wait budget as floor(D - now - 5 s) in seconds, after setup", () => {
        const c = clock();
        const deadline = new RunDeadline(120_000, c.now);
        expect(deadline.waitBudget()).toEqual({ ok: true, seconds: 115 });
        c.advance(8_000);
        expect(deadline.waitBudget()).toEqual({ ok: true, seconds: 107 });
        c.advance(500);
        // 111.5 s left - 5 s = 106.5 s: floored, never rounded up past what is left.
        expect(deadline.waitBudget()).toEqual({ ok: true, seconds: 106 });
    });

    it("refuses at exactly one millisecond below ACR's minimum", () => {
        const minMs = (ACR_MIN_WAIT_BUDGET_SECONDS + 5) * 1_000;
        const c = clock();
        expect(new RunDeadline(minMs, c.now).waitBudget()).toEqual({
            ok: true,
            seconds: ACR_MIN_WAIT_BUDGET_SECONDS,
        });
        expect(new RunDeadline(minMs - 1, c.now).waitBudget()).toEqual({
            ok: false,
            seconds: ACR_MIN_WAIT_BUDGET_SECONDS - 1,
        });
    });
});
