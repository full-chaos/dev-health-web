import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { info } = vi.hoisted(() => ({ info: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: vi.fn(async () => null) }));
vi.mock("@/lib/origin", () => ({ getBackendUrl: vi.fn(() => "http://localhost:8000") }));
vi.mock("@/lib/logger", () => ({ logger: { child: vi.fn(() => ({ info })) } }));
vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: vi.fn(async () => ({ limited: false, retryAfter: 0 })),
}));

import { proxy } from "@/proxy";

describe("proxy request log fields", () => {
    beforeEach(() => info.mockClear());

    it("logs the route pattern, never the raw path", async () => {
        await proxy(new NextRequest(new URL("/org/admin/users/id-84217-xyz", "http://localhost")));
        expect(info).toHaveBeenCalledTimes(1);
        const fields = info.mock.calls[0][0] as Record<string, unknown>;
        expect(fields.route).toBe("/org/admin/users/[id]");
        expect(Object.keys(fields).sort()).toEqual(["duration_ms", "method", "route", "status"]);
        expect(JSON.stringify(fields)).not.toContain("84217");
    });
});
