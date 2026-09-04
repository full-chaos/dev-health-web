import { describe, expect, it, vi, beforeEach } from "vitest";

// Must mock before importing the module under test (vi.mock is hoisted).
vi.mock("@/lib/auth", () => ({
    auth: vi.fn(),
}));

const { mockFetchFeatureFlagList } = vi.hoisted(() => ({
    mockFetchFeatureFlagList: vi.fn(),
}));
vi.mock("@/lib/feature-flags/fetchers", () => ({
    fetchFeatureFlagList: mockFetchFeatureFlagList,
}));

import { fetchFlagPage } from "./actions";
import { mockAuth } from "@/test/mocks/auth";

// CHAOS-4728: fetchFlagPage is a Server Action. Next.js dispatches a Server
// Action by resolving its id against a global module map with no
// page-ownership check (action-handler.js getActionModIdOrError) — a direct
// POST to the action id never runs feature-flags/layout.tsx or any page
// guard. This drives the ACTION'S OWN invocation path directly (not the
// page component), which is the only thing a real unauthenticated POST
// actually exercises.
describe("fetchFlagPage — direct invocation, no session (CHAOS-4728)", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it("rejects instead of returning data when there is no session", async () => {
        mockAuth(null);

        await expect(fetchFlagPage(0, 20)).rejects.toThrow("Unauthorized");
        // No fallback tenant id may be synthesized and forwarded downstream.
        expect(mockFetchFeatureFlagList).not.toHaveBeenCalled();
    });

    it("rejects instead of returning data when the session has no org_id", async () => {
        mockAuth({ user: { org_id: undefined } });

        await expect(fetchFlagPage(0, 20)).rejects.toThrow("Unauthorized");
        expect(mockFetchFeatureFlagList).not.toHaveBeenCalled();
    });

    it("proceeds to fetchFeatureFlagList for an authenticated session", async () => {
        mockAuth({ user: { org_id: "org-1" } });
        mockFetchFeatureFlagList.mockResolvedValueOnce({
            items: [],
            totalCount: 0,
            hasNextPage: false,
        });

        const result = await fetchFlagPage(0, 20);

        expect(mockFetchFeatureFlagList).toHaveBeenCalledWith(0, 20);
        expect(result).toEqual({ items: [], totalCount: 0, hasNextPage: false });
    });
});
