import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stallingFetch, track } from "@/test/stallFetch";

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("@/lib/logger", () => ({
    logger: { warn, info: vi.fn(), debug: vi.fn(), error: vi.fn(), child: vi.fn() },
}));

import { SERVER_FETCH_DEADLINES, fetchWithDeadline } from "@/lib/serverDeadline";

const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
    vi.useFakeTimers();
    warn.mockReset();
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe("fetchWithDeadline", () => {
    it("aborts a read that is never answered at the read deadline and logs once", async () => {
        vi.stubGlobal("fetch", stallingFetch());
        const state = track(
            fetchWithDeadline("http://api.test/api/v1/quadrant?scope_id=secret-id", undefined, {
                kind: "read",
            }),
        );
        await vi.advanceTimersByTimeAsync(SERVER_FETCH_DEADLINES.read - 1);
        expect(state.settled).toBe(false);
        await vi.advanceTimersByTimeAsync(2);
        expect(state.settled).toBe(true);
        expect((state.error as Error).name).toBe("TimeoutError");

        const lines = warn.mock.calls.filter(([, msg]) => msg === "server fetch deadline exceeded");
        expect(lines).toHaveLength(1);
        expect(lines[0][0]).toEqual({
            op: "GET /api/v1/quadrant",
            elapsed_ms: SERVER_FETCH_DEADLINES.read,
            deadline_ms: SERVER_FETCH_DEADLINES.read,
            outcome: "deadline",
        });
        expect(JSON.stringify(warn.mock.calls)).not.toContain("secret-id");
    });

    it("uses the shorter health, auth and entitlements deadlines", async () => {
        expect(SERVER_FETCH_DEADLINES.health).toBe(5_000);
        expect(SERVER_FETCH_DEADLINES.auth).toBe(10_000);
        expect(SERVER_FETCH_DEADLINES.entitlements).toBe(10_000);
        expect(SERVER_FETCH_DEADLINES.read).toBe(20_000);
        vi.stubGlobal("fetch", stallingFetch());
        const state = track(
            fetchWithDeadline("http://api.test/health", undefined, { kind: "health" }),
        );
        await vi.advanceTimersByTimeAsync(5_001);
        expect(state.settled).toBe(true);
    });

    it("leaves a healthy call unchanged: same response, no log", async () => {
        const response = new Response("{}", { status: 200 });
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
        const result = await fetchWithDeadline("http://api.test/x", undefined, { kind: "read" });
        expect(result).toBe(response);
        expect(warn).not.toHaveBeenCalled();
    });

    it("does not abort a write at the read deadline, and logs it slow", async () => {
        let resolveFetch: (r: Response) => void = () => {};
        vi.stubGlobal(
            "fetch",
            vi.fn(
                (_i: RequestInfo | URL, init?: RequestInit) =>
                    new Promise<Response>((resolve) => {
                        expect(init?.signal).toBeUndefined();
                        resolveFetch = resolve;
                    }),
            ),
        );
        const state = track(
            fetchWithDeadline(
                "http://api.test/api/v1/billing/x",
                { method: "POST" },
                { kind: "write" },
            ),
        );
        await vi.advanceTimersByTimeAsync(SERVER_FETCH_DEADLINES.read + 5_000);
        expect(state.settled).toBe(false);
        resolveFetch(new Response("{}", { status: 200 }));
        await flush();
        expect(state.settled).toBe(true);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][1]).toBe("server fetch slow");
        expect(warn.mock.calls[0][0]).toMatchObject({
            op: "POST /api/v1/billing/x",
            outcome: "ok",
        });
        expect(warn.mock.calls[0][0].elapsed_ms).toBeGreaterThan(SERVER_FETCH_DEADLINES.read);
    });

    it("logs a read that succeeds after the slow threshold, with the status class", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(
                () =>
                    new Promise<Response>((resolve) =>
                        setTimeout(() => resolve(new Response("{}", { status: 503 })), 6_000),
                    ),
            ),
        );
        const state = track(
            fetchWithDeadline("http://api.test/api/v1/home", undefined, { kind: "read" }),
        );
        await vi.advanceTimersByTimeAsync(6_001);
        expect(state.settled).toBe(true);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][1]).toBe("server fetch slow");
        expect(warn.mock.calls[0][0]).toMatchObject({ op: "GET /api/v1/home", outcome: "5xx" });
    });

    it("a caller abort wins, is not logged as a deadline", async () => {
        vi.stubGlobal("fetch", stallingFetch());
        const caller = new AbortController();
        const state = track(
            fetchWithDeadline("http://api.test/x", { signal: caller.signal }, { kind: "read" }),
        );
        await vi.advanceTimersByTimeAsync(1_000);
        caller.abort();
        await flush();
        expect(state.settled).toBe(true);
        expect(
            warn.mock.calls.filter(([, m]) => m === "server fetch deadline exceeded"),
        ).toHaveLength(0);
    });
});
