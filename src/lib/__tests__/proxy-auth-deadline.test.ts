import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// CHAOS-9114: `auth()` runs in the proxy on EVERY request, before any render. A stalled auth()
// must not hold the request for ever, and must not log the user out: a 503 with Retry-After.

const { warn } = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/origin", () => ({ getBackendUrl: vi.fn(() => "http://localhost:8000") }));
vi.mock("@/lib/logger", () => ({
    logger: { warn, child: vi.fn(() => ({ info: vi.fn() })) },
}));
vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: vi.fn().mockResolvedValue({ limited: false, retryAfter: 0 }),
}));

import { auth } from "@/lib/auth";
import { overrideDeadlinesForTests } from "@/lib/serverDeadline";
import { proxy } from "@/proxy";

beforeEach(() => {
    warn.mockClear();
    overrideDeadlinesForTests({ auth: 40, outerMargin: 60 });
});
afterEach(() => overrideDeadlinesForTests(null));

const request = (path: string, headers: Record<string, string> = {}) =>
    new NextRequest(`http://localhost:3000${path}`, { headers });

describe("proxy with an auth() that never settles", () => {
    it.each([
        ["a document request", "/code", {}],
        ["an RSC / prefetch request", "/code?_rsc=abc", { RSC: "1", "Next-Router-Prefetch": "1" }],
        ["a server action POST", "/people", { "Next-Action": "abc" }],
        ["the root path", "/", {}],
    ])(
        "%s: 503 + Retry-After, no redirect, no logout, one line naming the step",
        async (_n, path, headers) => {
            vi.mocked(auth).mockImplementation(() => new Promise(() => {}) as never);
            const response = await proxy(request(path, headers));
            expect(response.status).toBe(503);
            expect(response.headers.get("Retry-After")).toBe("2");
            expect(response.headers.get("Location")).toBeNull();
            expect(response.headers.get("Cache-Control")).toContain("no-store");
            expect(await response.text()).toContain("temporarily unavailable");
            const lines = warn.mock.calls.filter(([, m]) => m === "server fetch deadline exceeded");
            expect(lines).toHaveLength(1);
            expect(lines[0][0]).toMatchObject({
                op: "proxy auth",
                layer: "outer",
                inner_fired: false,
            });
        },
    );

    it("a healthy auth() with no session still redirects to sign-in (unchanged)", async () => {
        vi.mocked(auth).mockResolvedValue(null as never);
        const response = await proxy(request("/code"));
        expect(response.status).toBe(303);
        expect(response.headers.get("Location")).toContain("/auth/signin");
        expect(warn).not.toHaveBeenCalled();
    });
});
