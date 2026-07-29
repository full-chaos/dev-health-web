import { beforeEach, describe, expect, it, vi } from "vitest";

const { getOrgEntitlementsMock, permanentRedirectMock, requireSessionMock } = vi.hoisted(() => ({
    getOrgEntitlementsMock: vi.fn(),
    permanentRedirectMock: vi.fn(),
    requireSessionMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ permanentRedirect: permanentRedirectMock }));
vi.mock("@/lib/auth", () => ({ requireSession: requireSessionMock }));
vi.mock("@/lib/admin/server/billing", () => ({
    getOrgEntitlements: getOrgEntitlementsMock,
}));
vi.mock("@/lib/fetchOrNull", () => ({
    fetchOrNull: async <T,>(value: Promise<T>) => value,
}));

import ContextPacketCompatibilityPage from "./page";

describe("ContextPacketCompatibilityPage role matrix", () => {
    beforeEach(() => {
        permanentRedirectMock.mockClear();
        getOrgEntitlementsMock.mockClear();
    });

    it("moves platform administrators to the independent validation surface", async () => {
        requireSessionMock.mockResolvedValue({
            user: { id: "platform-1", is_superuser: true },
        });

        await ContextPacketCompatibilityPage({
            searchParams: Promise.resolve({ state: "partial" }),
        });

        expect(permanentRedirectMock).toHaveBeenCalledWith(
            "/superadmin/context-fabric/validation?state=partial",
        );
        expect(getOrgEntitlementsMock).not.toHaveBeenCalled();
    });

    it("moves an entitled product user to Ask Dev without diagnostic query details", async () => {
        requireSessionMock.mockResolvedValue({
            user: { id: "user-1", org_id: "org-1", role: "member", is_superuser: false },
        });
        getOrgEntitlementsMock.mockResolvedValue({
            data: { features: { ask_dev: true }, is_valid: true },
        });

        await ContextPacketCompatibilityPage({
            searchParams: Promise.resolve({ state: "error", repository: "private-repo" }),
        });

        expect(permanentRedirectMock).toHaveBeenCalledWith("/dev");
        expect(permanentRedirectMock).not.toHaveBeenCalledWith(
            expect.stringContaining("private-repo"),
        );
    });

    it("returns an org administrator without platform access to Diagnose", async () => {
        requireSessionMock.mockResolvedValue({
            user: { id: "admin-1", org_id: "org-1", role: "admin", is_superuser: false },
        });
        getOrgEntitlementsMock.mockResolvedValue({
            data: { features: { ask_dev: false, agent_context_runtime: true }, is_valid: true },
        });

        await ContextPacketCompatibilityPage({});

        expect(permanentRedirectMock).toHaveBeenCalledWith("/diagnose");
        expect(permanentRedirectMock).not.toHaveBeenCalledWith(
            expect.stringContaining("context-fabric"),
        );
    });

    it("uses the standard authenticated-route guard before choosing a destination", async () => {
        const signInRedirect = new Error("NEXT_REDIRECT: /auth/signin");
        requireSessionMock.mockRejectedValue(signInRedirect);

        await expect(ContextPacketCompatibilityPage({})).rejects.toBe(signInRedirect);
        expect(permanentRedirectMock).not.toHaveBeenCalled();
    });
});
