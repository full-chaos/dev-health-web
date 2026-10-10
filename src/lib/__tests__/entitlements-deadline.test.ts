import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stallingFetch, track } from "@/test/stallFetch";

// CHAOS-9103: the app layout awaits getOrgEntitlements before any page streams. A stalled
// entitlements call must settle at its deadline into the existing error result.

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("@/lib/logger", () => {
    const l = { warn, info: vi.fn(), debug: vi.fn(), error: vi.fn(), child: vi.fn() };
    l.child.mockReturnValue(l);
    return { logger: l };
});
vi.mock("@/lib/admin/server/_shared", () => ({
    getSessionContext: vi.fn().mockResolvedValue({ token: "t", orgId: "org-1" }),
    requireSuperuserToken: vi.fn(),
    withErrorHandling: async (fn: () => Promise<unknown>) => {
        try {
            return { data: await fn() };
        } catch (e) {
            return { error: e instanceof Error ? e.message : "error" };
        }
    },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/origin", () => ({ getBackendUrl: () => "http://backend.test" }));

import { getOrgEntitlements } from "@/lib/admin/server/billing";
import { overrideDeadlinesForTests } from "@/lib/serverDeadline";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
    warn.mockClear();
    overrideDeadlinesForTests({ entitlements: 40, outerMargin: 60 });
});
afterEach(() => {
    overrideDeadlinesForTests(null);
    vi.unstubAllGlobals();
});

describe("layout entitlements with a backend that never answers", () => {
    it("settles at the deadline into the error result", async () => {
        vi.stubGlobal("fetch", stallingFetch());
        const state = track(getOrgEntitlements("org-1"));
        await sleep(400);
        expect(state.settled).toBe(true);
        expect(state.value).toHaveProperty("error");
        const lines = warn.mock.calls.filter(([, m]) => m === "server fetch deadline exceeded");
        expect(lines).toHaveLength(1);
        expect(lines[0][0]).toMatchObject({
            op: "GET /api/v1/licensing/entitlements/:org",
            deadline_ms: 40,
        });
    });
});
