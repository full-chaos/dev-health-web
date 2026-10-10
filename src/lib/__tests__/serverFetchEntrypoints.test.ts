import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stallingFetch, track } from "@/test/stallFetch";

// CHAOS-9103: a server-side fetch that is accepted and never answered must settle at its
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

const SHORT = 40;
const ENV = [
    "SERVER_FETCH_DEADLINE_READ_MS",
    "SERVER_FETCH_DEADLINE_HEALTH_MS",
    "SERVER_FETCH_DEADLINE_AUTH_MS",
    "SERVER_FETCH_DEADLINE_ENTITLEMENTS_MS",
] as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const deadlineLines = () =>
    warn.mock.calls.filter(([, msg]) => msg === "server fetch deadline exceeded");

beforeEach(() => {
    warn.mockClear();
    for (const k of ENV) process.env[k] = String(SHORT);
});
afterEach(() => {
    for (const k of ENV) delete process.env[k];
    vi.unstubAllGlobals();
});

describe("reads settle at the deadline", () => {
    it("checkApiHealth returns {ok:false} (the page draws ServiceUnavailable)", async () => {
        vi.stubGlobal("fetch", stallingFetch());
        const state = track(checkApiHealth());
        await sleep(400);
        expect(state.settled).toBe(true);
        expect(state.value).toMatchObject({ ok: false });
        expect(deadlineLines()).toHaveLength(1);
        expect(deadlineLines()[0][0]).toMatchObject({ op: "GET /health", deadline_ms: SHORT });
    });

    it("apiClient.getJson rejects (fetchOrNull turns it into null)", async () => {
        vi.stubGlobal("fetch", stallingFetch());
        const state = track(apiClient.getJson("/api/v1/quadrant", { scope_id: "person-42" }));
        await sleep(400);
        expect(state.settled).toBe(true);
        expect(state.error).toBeDefined();
        expect(deadlineLines()).toHaveLength(1);
        expect(deadlineLines()[0][0]).toMatchObject({ op: "GET /api/v1/quadrant" });
        expect(JSON.stringify(warn.mock.calls)).not.toContain("person-42");
    });

    it("a POST query through the shared read helper (explain, home) is a read", async () => {
        vi.stubGlobal("fetch", stallingFetch());
        const state = track(sharedPostJson("/api/v1/explain", { filters: {} }));
        await sleep(400);
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
        await sleep(600);
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
        await sleep(600);
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
