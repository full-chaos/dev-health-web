import { describe, it, expect, vi, beforeEach } from "vitest";

// Must mock auth before importing the module under test
vi.mock("@/lib/auth", () => ({
    auth: vi.fn(),
}));

import { listBillingPlans } from "../actions/checkout";
import { mockAuth } from "@/test/mocks/auth";

// CHAOS-4728: listBillingPlans is a Server Action reachable by a direct POST
// to its action id (Next.js dispatch has no page-ownership check — see
// action-handler.js getActionModIdOrError). Unlike its five sibling actions
// in this file (createBillingPlan, updateBillingPlan, deleteBillingPlan,
// syncBillingPlanToStripe, pullPlansFromStripe), listBillingPlans only used
// the session to decide whether to attach an Authorization header — the
// backend fetch proceeded unauthenticated regardless. This drives the
// action's own invocation path directly, matching its siblings' behavior.
describe("listBillingPlans — direct invocation, no session (CHAOS-4728)", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.stubEnv("BACKEND_URL", "http://test-ops:8000");
    });

    it("rejects instead of issuing an unauthenticated backend request when there is no session", async () => {
        mockAuth(null);
        const fetchSpy = vi.spyOn(global, "fetch");

        const result = await listBillingPlans();

        expect(result.error).toBe("Unauthorized");
        expect(result.data).toBeUndefined();
        expect(fetchSpy).not.toHaveBeenCalled();

        fetchSpy.mockRestore();
    });

    it("returns plans when authenticated", async () => {
        mockAuth();
        const fetchSpy = vi
            .spyOn(global, "fetch")
            .mockResolvedValue(
                new Response(JSON.stringify([{ id: "plan-1", key: "pro" }]), { status: 200 }),
            );

        const result = await listBillingPlans();

        expect(result.data).toEqual([{ id: "plan-1", key: "pro" }]);
        expect(fetchSpy).toHaveBeenCalledWith(
            "http://test-ops:8000/api/v1/billing/plans",
            expect.objectContaining({
                headers: { Authorization: "Bearer test-token" },
            }),
        );

        fetchSpy.mockRestore();
    });
});
