import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stallingFetch, track } from "@/test/stallFetch";

// CHAOS-9112: a write is bounded too, but is never retried, and its failure shows the approved
// text (the server may have applied it). CHAOS-9114 bounded the reads.

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("@/lib/logger", () => {
    const l = { warn, info: vi.fn(), debug: vi.fn(), error: vi.fn(), child: vi.fn() };
    l.child.mockReturnValue(l);
    return { logger: l };
});
vi.mock("@/lib/origin", () => ({
    getBackendUrl: () => "http://backend.test",
    resolveOrigin: () => "http://backend.test",
}));
vi.mock("@/lib/auth", () => ({
    auth: vi.fn().mockResolvedValue({ access_token: "t", user: { org_id: "o" } }),
}));

import { request } from "@/lib/admin/api/_request";
import { apiRequest } from "@/lib/billing/actions/_shared";
import { overrideDeadlinesForTests } from "@/lib/serverDeadline";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const deadlineLines = () =>
    warn.mock.calls.filter(([, msg]) => msg === "server fetch deadline exceeded");

beforeEach(() => {
    warn.mockClear();
    overrideDeadlinesForTests({ write: 40, read: 40, auth: 40, entitlements: 40, outerMargin: 60 });
});
afterEach(() => {
    overrideDeadlinesForTests(null);
    vi.unstubAllGlobals();
});

describe("writes and reads are both bounded", () => {
    it("admin request: POST and GET both settle at the deadline", async () => {
        vi.stubGlobal("fetch", stallingFetch());
        const write = track(request("/settings", { method: "POST", body: "{}" }, "t", "o"));
        const read = track(request("/settings", {}, "t", "o"));
        await sleep(400);
        expect(write.settled).toBe(true);
        expect(read.settled).toBe(true);
        expect(deadlineLines()).toHaveLength(2);
    });

    it("billing apiRequest: POST and GET both settle at the deadline", async () => {
        vi.stubGlobal("fetch", stallingFetch());
        const write = track(apiRequest("/api/v1/billing/x", { method: "POST" }));
        const read = track(apiRequest("/api/v1/billing/x"));
        await sleep(400);
        expect(write.settled).toBe(true);
        expect(read.settled).toBe(true);
        expect(deadlineLines()).toHaveLength(2);
    });
});

describe("a write that hit the deadline shows the approved text", () => {
    it("failureFromError maps it; a read deadline keeps the read text", async () => {
        const { failureFromError } = await import("@/lib/actionFailure");
        const { WRITE_TIMED_OUT_MESSAGE } = await import("@/lib/serverDeadline");
        vi.stubGlobal("fetch", stallingFetch());
        const write = await apiRequest("/api/v1/billing/x", { method: "POST" }).catch((e) => e);
        expect(failureFromError("billing", write)).toEqual({
            error: "Timed out; the change may have been applied.",
        });
        expect(WRITE_TIMED_OUT_MESSAGE).toBe("Timed out; the change may have been applied.");
        const read = await apiRequest("/api/v1/billing/x").catch((e) => e);
        expect(failureFromError("billing", read).error).not.toBe(WRITE_TIMED_OUT_MESSAGE);
    });
});

describe("a GraphQL mutation that never answers", () => {
    it("settles at the write deadline with the deadline error, logs once, is sent once", async () => {
        const { graphqlFetch } = await import("@/lib/graphql/server");
        const { failureFromError } = await import("@/lib/actionFailure");
        const fetchMock = stallingFetch();
        vi.stubGlobal("fetch", fetchMock);
        const state = track(graphqlFetch("mutation SaveThing { saveThing { id } }", {}));
        await sleep(400);
        expect(state.settled).toBe(true);
        expect(failureFromError("saveThing", state.error).error).toBe(
            "Timed out; the change may have been applied.",
        );
        const lines = deadlineLines().filter(([f]) =>
            String((f as { op: string }).op).startsWith("graphql SaveThing"),
        );
        expect(lines).toHaveLength(1);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
