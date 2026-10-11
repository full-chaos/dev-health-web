import { beforeEach, describe, expect, it, vi } from "vitest";

// CHAOS-9218: the start and stop actions drop the kept impersonation status of the acting user,
// so the next session read of that user asks the backend again.

const { forget, start, stop, order } = vi.hoisted(() => {
    const order: string[] = [];
    return {
        order,
        forget: vi.fn(async () => {
            order.push("forget");
        }),
        start: vi.fn(),
        stop: vi.fn(),
    };
});

vi.mock("@/lib/auth", () => ({ auth: vi.fn(), forgetOwnImpersonationStatus: forget }));
vi.mock("../api", async (importOriginal) => {
    const original = await importOriginal<typeof import("../api")>();
    return {
        ...original,
        adminApi: {
            ...original.adminApi,
            impersonation: {
                start,
                stop,
                status: vi.fn(async () => ({ is_impersonating: false })),
            },
        },
    };
});

import { mockAuth } from "@/test/mocks/auth";
import { AdminApiError } from "../api";
import { getImpersonationStatus, startImpersonation, stopImpersonation } from "../server";

const backendCall = (result: "ok" | "fail") => async () => {
    order.push("backend");
    if (result === "fail") throw new AdminApiError(500, "Internal Server Error", "boom");
    return { status: "ok" };
};

beforeEach(() => {
    order.length = 0;
    forget.mockClear();
    start.mockReset();
    stop.mockReset();
    mockAuth({ user: { id: "admin-1", is_superuser: true } });
});

describe("impersonation actions drop the kept status of the acting user", () => {
    it("start: after the backend call", async () => {
        start.mockImplementation(backendCall("ok"));
        const result = await startImpersonation("target-1");
        expect(result.error).toBeUndefined();
        expect(start).toHaveBeenCalledWith("target-1", expect.any(String));
        expect(order).toEqual(["backend", "forget"]);
    });

    it("start: also when the backend call fails (the change may have been applied)", async () => {
        start.mockImplementation(backendCall("fail"));
        const result = await startImpersonation("target-1");
        expect(result.error).toBeDefined();
        expect(order).toEqual(["backend", "forget"]);
    });

    it("stop: after the backend call", async () => {
        stop.mockImplementation(backendCall("ok"));
        const result = await stopImpersonation();
        expect(result.error).toBeUndefined();
        expect(order).toEqual(["backend", "forget"]);
    });

    it("stop: also when the backend call fails", async () => {
        stop.mockImplementation(backendCall("fail"));
        const result = await stopImpersonation();
        expect(result.error).toBeDefined();
        expect(order).toEqual(["backend", "forget"]);
    });

    it("a caller that is not a superuser does not reach the backend", async () => {
        mockAuth({ user: { id: "member-1", is_superuser: false } });
        const result = await startImpersonation("target-1");
        expect(result.error).toBeDefined();
        expect(order).not.toContain("backend");
    });

    it("an action that changes no impersonation leaves the kept status", async () => {
        const result = await getImpersonationStatus();
        expect(result.error).toBeUndefined();
        expect(order).toEqual([]);
    });
});
