import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stallingFetch, track } from "@/test/stallFetch";

// CHAOS-9114: a write may have been applied by the server, so it is NEVER bounded by a deadline
// (it is only logged when slow). A read of the same file is.

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("@/lib/logger", () => {
    const l = { warn, info: vi.fn(), debug: vi.fn(), error: vi.fn(), child: vi.fn() };
    l.child.mockReturnValue(l);
    return { logger: l };
});
vi.mock("@/lib/origin", () => ({ getBackendUrl: () => "http://backend.test" }));
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
    overrideDeadlinesForTests({ read: 40, auth: 40, entitlements: 40, outerMargin: 60 });
});
afterEach(() => {
    overrideDeadlinesForTests(null);
    vi.unstubAllGlobals();
});

describe("writes are not bounded, reads are", () => {
    it("admin request: POST stays pending; GET settles at the deadline", async () => {
        vi.stubGlobal("fetch", stallingFetch());
        const write = track(request("/settings", { method: "POST", body: "{}" }, "t", "o"));
        const read = track(request("/settings", {}, "t", "o"));
        await sleep(400);
        expect(write.settled).toBe(false);
        expect(read.settled).toBe(true);
        expect(deadlineLines()).toHaveLength(1);
    });

    it("billing apiRequest: POST stays pending; GET settles at the deadline", async () => {
        vi.stubGlobal("fetch", stallingFetch());
        const write = track(apiRequest("/api/v1/billing/x", { method: "POST" }));
        const read = track(apiRequest("/api/v1/billing/x"));
        await sleep(400);
        expect(write.settled).toBe(false);
        expect(read.settled).toBe(true);
        expect(deadlineLines()).toHaveLength(1);
    });
});
