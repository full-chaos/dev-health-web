import { beforeEach, describe, expect, it, vi } from "vitest";

const { getOrgEntitlementsMock, redirectMock, requireRoleMock } = vi.hoisted(() => ({
    getOrgEntitlementsMock: vi.fn(),
    redirectMock: vi.fn(),
    requireRoleMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/lib/auth", () => ({ requireRole: requireRoleMock }));
vi.mock("@/lib/admin/server", () => ({ getOrgEntitlements: getOrgEntitlementsMock }));

import AISetupPage from "./page";

describe("AISetupPage", () => {
    beforeEach(() => {
        redirectMock.mockReset();
        requireRoleMock.mockReset();
        getOrgEntitlementsMock.mockReset();
        requireRoleMock.mockResolvedValue({
            user: { org_id: "org-1", role: "admin", is_superuser: false },
        });
    });

    it.each([
        [{ ask_dev: true, byo_llm: false }, "/org/admin/ai/ask-dev"],
        [{ ask_dev: false, byo_llm: true }, "/org/admin/ai/byo-llm"],
        [{ ask_dev: true, byo_llm: true }, "/org/admin/ai/ask-dev"],
        [{ ask_dev: false, byo_llm: false }, "/org/admin"],
    ] as const)("redirects %o to %s without looping", async (features, destination) => {
        getOrgEntitlementsMock.mockResolvedValue({ data: { features } });

        await AISetupPage();

        expect(requireRoleMock).toHaveBeenCalledWith(["admin", "owner"], "/org/admin/ai");
        expect(getOrgEntitlementsMock).toHaveBeenCalledWith("org-1");
        expect(redirectMock).toHaveBeenCalledTimes(1);
        expect(redirectMock).toHaveBeenCalledWith(destination);
    });

    it("preserves the authorization guard before entitlement discovery", async () => {
        const authRedirect = new Error("NEXT_REDIRECT: /auth/signin");
        requireRoleMock.mockRejectedValue(authRedirect);

        await expect(AISetupPage()).rejects.toBe(authRedirect);

        expect(getOrgEntitlementsMock).not.toHaveBeenCalled();
        expect(redirectMock).not.toHaveBeenCalled();
    });

    it("returns a platform administrator without an organization to platform admin", async () => {
        requireRoleMock.mockResolvedValue({
            user: { org_id: null, role: "admin", is_superuser: true },
        });

        await AISetupPage();

        expect(redirectMock).toHaveBeenCalledWith("/superadmin");
        expect(getOrgEntitlementsMock).not.toHaveBeenCalled();
    });
});
