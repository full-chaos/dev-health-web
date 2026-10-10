import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { headersThenStalledBody, stallingFetch, track } from "@/test/stallFetch";

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("@/lib/logger", () => ({
    logger: { warn, info: vi.fn(), debug: vi.fn(), error: vi.fn(), child: vi.fn() },
}));

import {
    SERVER_FETCH_DEADLINES,
    boundedRead,
    fetchWithDeadline,
    isServerDeadlineError,
    overrideDeadlinesForTests,
    sanitizePath,
    withDeadline,
} from "@/lib/serverDeadline";

const flush = () => vi.advanceTimersByTimeAsync(0);
const deadlineLines = () =>
    warn.mock.calls.filter(([, msg]) => msg === "server fetch deadline exceeded");

beforeEach(() => {
    vi.useFakeTimers();
    warn.mockReset();
    overrideDeadlinesForTests(null);
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    overrideDeadlinesForTests(null);
});

describe("fetchWithDeadline (inner layer)", () => {
    it("settles a read that is never answered at the read deadline and logs once", async () => {
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
        expect(isServerDeadlineError(state.error)).toBe(true);

        expect(deadlineLines()).toHaveLength(1);
        expect(deadlineLines()[0][0]).toEqual({
            op: "GET /api/v1/quadrant",
            elapsed_ms: SERVER_FETCH_DEADLINES.read,
            deadline_ms: SERVER_FETCH_DEADLINES.read,
            outcome: "deadline",
            layer: "inner",
        });
        expect(JSON.stringify(warn.mock.calls)).not.toContain("secret-id");
    });

    it("adds NO signal to the fetch and passes the caller's signal through untouched", async () => {
        const fetchMock = vi.fn(async (..._args: unknown[]) => new Response("{}", { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);
        await fetchWithDeadline("http://api.test/x", undefined, { kind: "read" });
        expect(fetchMock.mock.calls[0][1]).toBeUndefined();

        const caller = new AbortController();
        await fetchWithDeadline("http://api.test/x", { signal: caller.signal }, { kind: "read" });
        expect((fetchMock.mock.calls[1][1] as RequestInit).signal).toBe(caller.signal);
    });

    it("settles when the stall is INSIDE a fetch that ignores every signal (framework fetch)", async () => {
        // Next's patched fetch can wait on a cache lock before the origin call and never looks at
        // a signal: a plain never-settling promise stands for it.
        vi.stubGlobal(
            "fetch",
            vi.fn(() => new Promise<Response>(() => {})),
        );
        const state = track(
            fetchWithDeadline(
                "http://api.test/api/v1/explain",
                { method: "POST" },
                { kind: "read" },
            ),
        );
        await vi.advanceTimersByTimeAsync(SERVER_FETCH_DEADLINES.read + 1);
        expect(state.settled).toBe(true);
        expect(deadlineLines()[0][0]).toMatchObject({ op: "POST /api/v1/explain", layer: "inner" });
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

    it("leaves a healthy call unchanged: same content, no log", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
        const result = await fetchWithDeadline("http://api.test/x", undefined, { kind: "read" });
        expect(result.status).toBe(200);
        expect(await result.text()).toBe("{}");
        expect(warn).not.toHaveBeenCalled();
    });

    it("does not bound a write, and logs it slow", async () => {
        let resolveFetch: (r: Response) => void = () => {};
        vi.stubGlobal(
            "fetch",
            vi.fn(
                () =>
                    new Promise<Response>((resolve) => {
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
        await vi.advanceTimersByTimeAsync(SERVER_FETCH_DEADLINES.read * 3);
        expect(state.settled).toBe(false);
        resolveFetch(new Response("{}", { status: 200 }));
        await flush();
        expect(state.settled).toBe(true);
        expect(deadlineLines()).toHaveLength(0);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0][1]).toBe("server fetch slow");
        expect(warn.mock.calls[0][0]).toMatchObject({
            op: "POST /api/v1/billing/x",
            outcome: "ok",
        });
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

    it("headers arrive and the body never ends: settles at the deadline and logs (whole exchange)", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (_i: RequestInfo | URL, init?: RequestInit) =>
                headersThenStalledBody(init),
            ),
        );
        const state = track(
            fetchWithDeadline("http://api.test/api/v1/home", undefined, { kind: "read" }),
        );
        await vi.advanceTimersByTimeAsync(SERVER_FETCH_DEADLINES.read - 1);
        expect(state.settled).toBe(false);
        await vi.advanceTimersByTimeAsync(2);
        expect(state.settled).toBe(true);
        expect(deadlineLines()).toHaveLength(1);
        expect(deadlineLines()[0][0]).toMatchObject({
            op: "GET /api/v1/home",
            outcome: "deadline",
        });
    });

    it("a healthy response comes back fully read: status, headers, any number of reads or clones", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async () =>
                    new Response('{"a":1}', {
                        status: 201,
                        statusText: "Created",
                        headers: { "x-k": "v" },
                    }),
            ),
        );
        const response = await fetchWithDeadline("http://api.test/x", undefined, { kind: "read" });
        expect(response.status).toBe(201);
        expect(response.statusText).toBe("Created");
        expect(response.headers.get("x-k")).toBe("v");
        const copy = response.clone();
        expect(await response.json()).toEqual({ a: 1 });
        expect(await copy.text()).toBe('{"a":1}');
    });

    it("a null-body status (204) is returned without a body", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(null, { status: 204 })),
        );
        const response = await fetchWithDeadline("http://api.test/x", undefined, { kind: "read" });
        expect(response.status).toBe(204);
        expect(await response.text()).toBe("");
    });

    it("op carries no id: uuid, numeric, long and provider:key segments become :id", () => {
        expect(sanitizePath("/api/v1/people/7f3c9a2e-1b2c-4d5e-8f90-123456789abc/summary")).toBe(
            "/api/v1/people/:id/summary",
        );
        expect(sanitizePath("/api/v1/teams/12345")).toBe("/api/v1/teams/:id");
        expect(sanitizePath("/api/v1/work-units/github:org/repo")).toBe(
            "/api/v1/work-units/:id/repo",
        );
        expect(sanitizePath("/api/v1/x/abcdefghijklmnopqrstuvwxyz")).toBe("/api/v1/x/:id");
        expect(sanitizePath("/api/v1/quadrant")).toBe("/api/v1/quadrant");
    });

    it("an env value outside 1 s..10 min is ignored (no 1 ms deadline from an overflow)", async () => {
        vi.stubEnv("SERVER_FETCH_DEADLINE_READ_MS", "3000000000");
        vi.stubGlobal("fetch", stallingFetch());
        const state = track(fetchWithDeadline("http://api.test/x", undefined, { kind: "read" }));
        await vi.advanceTimersByTimeAsync(100);
        expect(state.settled).toBe(false);
        await vi.advanceTimersByTimeAsync(SERVER_FETCH_DEADLINES.read);
        expect(state.settled).toBe(true);
        expect(deadlineLines()[0][0]).toMatchObject({ deadline_ms: SERVER_FETCH_DEADLINES.read });
    });
});

describe("withDeadline (outer layer)", () => {
    it("a step that waits on no fetch: fires at inner + 5 s with inner_fired false and names the step", async () => {
        const state = track(
            withDeadline(new Promise<string>(() => {}), { kind: "auth", op: "step auth headers" }),
        );
        await vi.advanceTimersByTimeAsync(SERVER_FETCH_DEADLINES.auth + 4_999);
        expect(state.settled).toBe(false);
        await vi.advanceTimersByTimeAsync(2);
        expect(state.settled).toBe(true);
        expect(deadlineLines()).toHaveLength(1);
        expect(deadlineLines()[0][0]).toMatchObject({
            op: "step auth headers",
            layer: "outer",
            inner_fired: false,
            deadline_ms: SERVER_FETCH_DEADLINES.auth + SERVER_FETCH_DEADLINES.outerMargin,
        });
    });

    it("says inner_fired true when an inner deadline fired while the step waited", async () => {
        vi.stubGlobal("fetch", stallingFetch());
        overrideDeadlinesForTests({ read: 1_000, outerMargin: 5_000 });
        const step = withDeadline(
            fetchWithDeadline("http://api.test/x", undefined, { kind: "read" }).then(
                () => new Promise<void>(() => {}), // the step goes on to wait on something else
                () => new Promise<void>(() => {}),
            ),
            { kind: "read", op: "step two" },
        );
        const state = track(step);
        await vi.advanceTimersByTimeAsync(6_100);
        expect(state.settled).toBe(true);
        const outer = deadlineLines().find(([f]) => (f as { layer: string }).layer === "outer");
        expect(outer?.[0]).toMatchObject({ op: "step two", inner_fired: true });
    });

    it("never bounds a write: no timer, the same promise comes back", async () => {
        const pending = new Promise<string>(() => {});
        expect(withDeadline(pending, { kind: "write", op: "s" })).toBe(pending);
        await vi.advanceTimersByTimeAsync(10 * SERVER_FETCH_DEADLINES.read);
        expect(warn).not.toHaveBeenCalled();
    });

    it("passes a healthy value and a plain rejection through, with no line", async () => {
        await expect(withDeadline(Promise.resolve(7), { kind: "read", op: "s" })).resolves.toBe(7);
        await expect(
            withDeadline(Promise.reject(new Error("boom")), { kind: "read", op: "s" }),
        ).rejects.toThrow("boom");
        expect(warn).not.toHaveBeenCalled();
    });

    it("boundedRead turns a deadline into the plain read-failed result, never a throw", async () => {
        const state = track(boundedRead(new Promise<{ error?: string }>(() => {}), "step x"));
        await vi.advanceTimersByTimeAsync(
            SERVER_FETCH_DEADLINES.read + SERVER_FETCH_DEADLINES.outerMargin + 1,
        );
        expect(state.value).toEqual({ error: "Could not be read" });
    });
});
