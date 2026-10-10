import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { headersThenStalledBody, stallingFetch, track } from "@/test/stallFetch";

// CHAOS-9114: a server-side fetch that is accepted and never answered must settle at its
// deadline. Real timers, deadlines shrunk through the env override, so every test asserts
// the MECHANISM (the deadline log line with its deadline_ms), not only that a promise ended.

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("@/lib/logger", () => {
    const l = { warn, info: vi.fn(), debug: vi.fn(), error: vi.fn(), child: vi.fn() };
    l.child.mockReturnValue(l);
    return { logger: l };
});
vi.mock("@/lib/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }));

import { checkApiHealth } from "@/lib/api/system";
import { apiClient } from "@/lib/apiClient";
import { postJson as sharedPostJson } from "@/lib/api/_shared";
import { graphqlFetch } from "@/lib/graphql/server";
import { fetchOrNull } from "@/lib/fetchOrNull";
import { auth } from "@/lib/auth";
import { overrideDeadlinesForTests } from "@/lib/serverDeadline";

const SHORT = 40;
const MARGIN = 500;
const shrink = (read = SHORT) =>
    overrideDeadlinesForTests({
        read,
        health: SHORT,
        // the auth step of the first call loads a module: a longer wait than the fetches
        auth: 500,
        entitlements: SHORT,
        outerMargin: MARGIN,
        slow: 5_000,
    });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Poll until every tracked promise settled (up to 15 s): robust on a loaded host. */
const allSettled = async (...states: Array<{ settled: boolean }>) => {
    for (let i = 0; i < 1_500 && !states.every((s) => s.settled); i += 1) await sleep(10);
};
const deadlineLines = () =>
    warn.mock.calls.filter(([, msg]) => msg === "server fetch deadline exceeded");

beforeEach(() => {
    warn.mockClear();
    shrink();
});
afterEach(() => {
    overrideDeadlinesForTests(null);
    vi.unstubAllGlobals();
});

describe("reads settle at the deadline", () => {
    it("checkApiHealth returns {ok:false} (the page draws ServiceUnavailable)", async () => {
        vi.stubGlobal("fetch", stallingFetch());
        const state = track(checkApiHealth());
        await allSettled(state);
        expect(state.settled).toBe(true);
        expect(state.value).toMatchObject({ ok: false });
        expect(deadlineLines()).toHaveLength(1);
        expect(deadlineLines()[0][0]).toMatchObject({
            op: "GET /health",
            deadline_ms: SHORT,
            layer: "inner",
        });
    });

    it("apiClient.getJson rejects (fetchOrNull turns it into null)", async () => {
        vi.stubGlobal("fetch", stallingFetch());
        const state = track(apiClient.getJson("/api/v1/quadrant", { scope_id: "person-42" }));
        await allSettled(state);
        expect(state.settled).toBe(true);
        expect(state.error).toBeDefined();
        expect(deadlineLines()).toHaveLength(1);
        expect(deadlineLines()[0][0]).toMatchObject({ op: "GET /api/v1/quadrant" });
        expect(JSON.stringify(warn.mock.calls)).not.toContain("person-42");
    });

    it("a POST query through the shared read helper (explain, home) is a read", async () => {
        vi.stubGlobal("fetch", stallingFetch());
        const state = track(sharedPostJson("/api/v1/explain", { filters: {} }));
        await allSettled(state);
        expect(state.settled).toBe(true);
        expect(deadlineLines()[0][0]).toMatchObject({ op: "POST /api/v1/explain" });
    });

    it("a GraphQL query rejects at the deadline and names the operation", async () => {
        vi.stubGlobal("fetch", stallingFetch());
        const state = track(
            graphqlFetch(`query HomeData($id: String) { home(id: $id) { a } }`, {
                id: "person-42",
            }),
        );
        await allSettled(state);
        expect(state.settled).toBe(true);
        expect(state.error).toBeDefined();
        expect(deadlineLines()).toHaveLength(1);
        expect(deadlineLines()[0][0]).toMatchObject({
            op: "graphql query HomeData",
            deadline_ms: SHORT,
        });
        expect(JSON.stringify(warn.mock.calls)).not.toContain("person-42");
    });

    it("a healthy call is not changed and writes no line", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(JSON.stringify({ status: "ok" }), { status: 200 })),
        );
        expect(await checkApiHealth()).toMatchObject({ ok: true });
        expect(warn).not.toHaveBeenCalled();
    });
});

describe("writes are not aborted", () => {
    it("apiClient.postJson (unmarked POST) passes no signal and stays pending past the deadline", async () => {
        const fetchMock = stallingFetch();
        vi.stubGlobal("fetch", fetchMock);
        const state = track(apiClient.postJson("/api/v1/something/create", { a: 1 }));
        await sleep(300);
        expect(state.settled).toBe(false);
        expect(deadlineLines()).toHaveLength(0);
        expect(vi.mocked(fetchMock).mock.calls[0][1]?.signal).toBeUndefined();
    });

    it("a long GraphQL query sent as a POST is still a read (aborted)", async () => {
        vi.stubGlobal("fetch", stallingFetch());
        const longFilter = "x".repeat(4_000);
        const state = track(
            graphqlFetch(`query BigRead($f: String) { big(f: $f) { a } }`, { f: longFilter }),
        );
        await allSettled(state);
        expect(state.settled).toBe(true);
        expect(deadlineLines()[0][0]).toMatchObject({ op: "graphql query BigRead" });
    });

    it("a GraphQL mutation is not aborted", async () => {
        const fetchMock = stallingFetch();
        vi.stubGlobal("fetch", fetchMock);
        const state = track(graphqlFetch(`mutation SaveThing { saveThing { id } }`, {}));
        await sleep(600);
        expect(state.settled).toBe(false);
        expect(deadlineLines()).toHaveLength(0);
    });
});

describe("shared in-flight GET map (apiClient): a stalled owner releases every waiter", () => {
    // A longer deadline than the other tests: the waiters must join the owner before it ends,
    // also on a loaded host.
    beforeEach(() => {
        shrink(1_000);
    });

    it("two parallel identical unauthenticated GETs both settle at the deadline; a third call starts a NEW fetch", async () => {
        const fetchMock = stallingFetch();
        vi.stubGlobal("fetch", fetchMock);
        const a = track(apiClient.getJson("/api/v1/shared-read"));
        const b = track(apiClient.getJson("/api/v1/shared-read"));
        await sleep(10);
        expect(vi.mocked(fetchMock)).toHaveBeenCalledTimes(1); // joined the owner
        await allSettled(a, b);
        expect(a.settled).toBe(true);
        expect(b.settled).toBe(true);
        expect(deadlineLines()).toHaveLength(1); // once per stalled owner, not per waiter

        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response('{"ok":true}', { status: 200 })),
        );
        expect(await apiClient.getJson("/api/v1/shared-read")).toEqual({ ok: true });
        expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(1); // entry gone: a NEW fetch
    });

    it("headers arrive, body never ends: both waiters settle (no tee stall), entry evicted", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (_i: RequestInfo | URL, init?: RequestInit) =>
                headersThenStalledBody(init),
            ),
        );
        const a = track(apiClient.getJson("/api/v1/shared-body"));
        const b = track(apiClient.getJson("/api/v1/shared-body"));
        await allSettled(a, b);
        expect(a.settled).toBe(true);
        expect(b.settled).toBe(true);
        expect(deadlineLines()).toHaveLength(1);
    });

    it("fresh-process shape: the FIRST call stalls, requests keep arriving, all settle within the deadline, the next call succeeds", async () => {
        let calls = 0;
        vi.stubGlobal(
            "fetch",
            vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
                calls += 1;
                if (calls === 1) return stallingFetch()(input, init);
                return Promise.resolve(new Response('{"ok":true}', { status: 200 }));
            }),
        );
        const waiters = [];
        const started = Date.now();
        for (let i = 0; i < 8; i += 1) {
            waiters.push(track(apiClient.getJson("/api/v1/first-call")));
            await sleep(3);
        }
        await allSettled(...waiters);
        expect(waiters.every((w) => w.settled)).toBe(true);
        expect(Date.now() - started).toBeLessThan(2_000);
        expect(calls).toBe(1);
        expect(await apiClient.getJson("/api/v1/first-call")).toEqual({ ok: true });
        expect(calls).toBe(2);
    });
});

describe("outer layer: steps that are not a fetch", () => {
    it("a stalled auth() before any fetch: the call goes on without a token at the auth deadline, the line names the step", async () => {
        vi.mocked(auth).mockImplementationOnce(() => new Promise(() => {}));
        const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);
        const state = track(apiClient.getJson("/api/v1/needs-auth"));
        await allSettled(state);
        expect(state.settled).toBe(true);
        expect(state.value).toEqual({ ok: true });
        const lines = deadlineLines();
        expect(lines).toHaveLength(1);
        expect(lines[0][0]).toMatchObject({
            op: "step auth headers",
            layer: "outer",
            inner_fired: false,
        });
        expect(
            (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers,
        ).not.toHaveProperty("Authorization");
    });

    it("fetchOrNull bounds ANY step: null at inner+margin, the line names the step, inner_fired false", async () => {
        const state = track(fetchOrNull(new Promise(() => {}), "code/anything"));
        await allSettled(state);
        expect(state.settled).toBe(true);
        expect(state.value).toBeNull();
        expect(deadlineLines()).toHaveLength(1);
        expect(deadlineLines()[0][0]).toMatchObject({
            op: "step code/anything",
            layer: "outer",
            inner_fired: false,
            deadline_ms: SHORT + MARGIN,
        });
    });
});

describe("GraphQL classification", () => {
    it("a POST document that starts with a fragment is still a read (bounded)", async () => {
        vi.stubGlobal("fetch", stallingFetch());
        const state = track(
            graphqlFetch(
                `fragment F on Home { a } query WithFrag { home { ...F } }` + " ".repeat(3_000),
                {
                    f: "x".repeat(3_000),
                },
            ),
        );
        await allSettled(state);
        expect(state.settled).toBe(true);
        expect(deadlineLines()[0][0]).toMatchObject({ op: "graphql query WithFrag" });
    });

    it("a subscription document is a write; a field named mutation is not an operation", async () => {
        const { hasWriteOperation } = await import("@/lib/graphql/server");
        expect(hasWriteOperation("subscription S { a }")).toBe(true);
        expect(hasWriteOperation("# c\nmutation M($a: Int) { m(a: $a) { id } }")).toBe(true);
        expect(hasWriteOperation("query Q { mutation { id } }")).toBe(false);
        expect(hasWriteOperation('query Q { a(s: "mutation x") { id } }')).toBe(false);
        expect(hasWriteOperation("fragment F on T { a } query Q { ...F }")).toBe(false);
    });
});
