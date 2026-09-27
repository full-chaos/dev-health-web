import { beforeEach, describe, expect, it, vi } from "vitest";

const { permanentRedirectMock, requireSessionMock } = vi.hoisted(() => ({
    permanentRedirectMock: vi.fn(),
    requireSessionMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({ permanentRedirect: permanentRedirectMock }));
vi.mock("@/lib/auth", () => ({ requireSession: requireSessionMock }));

import ContextPacketCompatibilityPage from "./page";

describe("ContextPacketCompatibilityPage role matrix", () => {
    beforeEach(() => {
        permanentRedirectMock.mockClear();
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
    });

    it("returns any non-superuser to Diagnose without diagnostic query details", async () => {
        requireSessionMock.mockResolvedValue({
            user: { id: "user-1", org_id: "org-1", role: "member", is_superuser: false },
        });

        await ContextPacketCompatibilityPage({
            searchParams: Promise.resolve({ state: "error", repository: "private-repo" }),
        });

        expect(permanentRedirectMock).toHaveBeenCalledWith("/diagnose");
        expect(permanentRedirectMock).not.toHaveBeenCalledWith(
            expect.stringContaining("private-repo"),
        );
    });

    it("uses the standard authenticated-route guard before choosing a destination", async () => {
        const signInRedirect = new Error("NEXT_REDIRECT: /auth/signin");
        requireSessionMock.mockRejectedValue(signInRedirect);

        await expect(ContextPacketCompatibilityPage({})).rejects.toBe(signInRedirect);
        expect(permanentRedirectMock).not.toHaveBeenCalled();
    });
});
