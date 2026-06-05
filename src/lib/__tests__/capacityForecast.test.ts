import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "next-auth";

// Mock dependencies BEFORE importing the module under test
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/graphql/capacityFetchers", () => ({
    getCapacityForecastViaGraphQL: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { getCapacityForecastViaGraphQL } from "@/lib/graphql/capacityFetchers";
import { getCapacityForecast } from "../api/capacity";

// Helper to mock auth session
function mockSession(orgId: string) {
    vi.mocked(auth).mockResolvedValue({
        access_token: "test-token",
        user: { id: "u-1", org_id: orgId },
        expires: "",
    } satisfies Session);
}

describe("getCapacityForecast", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(getCapacityForecastViaGraphQL).mockResolvedValue(null);
    });

    it("uses orgId from params when provided", async () => {
        await getCapacityForecast({ orgId: "explicit-org" });
        expect(vi.mocked(getCapacityForecastViaGraphQL)).toHaveBeenCalledWith(
            "explicit-org",
            undefined,
        );
    });

    it("falls back to auth session org_id when orgId not in params", async () => {
        mockSession("session-org");
        await getCapacityForecast({});
        expect(vi.mocked(getCapacityForecastViaGraphQL)).toHaveBeenCalledWith(
            "session-org",
            undefined,
        );
    });

    it("throws error when orgId not in params and no session", async () => {
        vi.mocked(auth).mockResolvedValue(null);
        await expect(getCapacityForecast({})).rejects.toThrow("org_id is required");
    });

    it("throws error when orgId not in params and session has no org_id", async () => {
        vi.mocked(auth).mockResolvedValue({
            access_token: "t",
            user: { id: "u-1" },
            expires: "",
        } as Session);
        await expect(getCapacityForecast({})).rejects.toThrow("org_id is required");
    });

    it("does not call auth() when orgId is provided in params", async () => {
        await getCapacityForecast({ orgId: "explicit-org" });
        expect(vi.mocked(auth)).not.toHaveBeenCalled();
    });

    it("never sends 'default' as orgId", async () => {
        mockSession("real-org");
        await getCapacityForecast({});
        const calls = vi.mocked(getCapacityForecastViaGraphQL).mock.calls;
        expect(calls[0][0]).not.toBe("default");
        expect(calls[0][0]).toBe("real-org");
    });
});
