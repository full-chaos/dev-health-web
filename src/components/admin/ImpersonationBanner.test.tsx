import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithToaster, userEvent } from "@/test/utils";
import { ImpersonationBanner } from "./ImpersonationBanner";

// Mutable holders so each test can swap session state / action results
// without re-mocking the modules.
let mockSessionUser: Record<string, unknown> | null;
const mockUpdate = vi.fn();
const mockRefresh = vi.fn();
const mockPush = vi.fn();

vi.mock("next-auth/react", () => ({
    useSession: () => ({
        data: mockSessionUser ? { user: mockSessionUser } : null,
        update: mockUpdate,
    }),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: mockRefresh, push: mockPush }),
}));

vi.mock("@/lib/admin/server", () => ({
    stopImpersonation: vi.fn(),
}));

import { stopImpersonation } from "@/lib/admin/server";

describe("ImpersonationBanner", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSessionUser = {
            id: "admin-1",
            email: "admin@devhealth.example",
            is_superuser: true,
            is_impersonating: true,
            impersonated_user_id: "target-1",
            impersonated_email: "target@example.com",
            impersonated_org_id: "org-target",
        };
    });

    it("is hidden when not impersonating", () => {
        mockSessionUser = { id: "admin-1", email: "admin@devhealth.example" };
        const { container } = renderWithToaster(<ImpersonationBanner />);
        expect(container.querySelector("button")).toBeNull();
    });

    it("shows the impersonated target's email, not the admin's own email", () => {
        // Regression: the banner used to render session.user.email, which is
        // always the ADMIN's email — making it impossible to tell who you are
        // viewing as (and making a successful stop look like a no-op).
        renderWithToaster(<ImpersonationBanner />);
        expect(screen.getByText(/viewing as/i).textContent).toContain("target@example.com");
        expect(screen.getByText(/viewing as/i).textContent).not.toContain(
            "admin@devhealth.example",
        );
    });

    it("falls back to the impersonated user id when the email is unknown", () => {
        mockSessionUser = {
            ...mockSessionUser,
            impersonated_email: undefined,
        };
        renderWithToaster(<ImpersonationBanner />);
        expect(screen.getByText(/viewing as/i).textContent).toContain("target-1");
    });

    it("forces a session re-poll and navigates on successful stop", async () => {
        vi.mocked(stopImpersonation).mockResolvedValue({ data: { status: "stopped" } });
        renderWithToaster(<ImpersonationBanner />);

        await userEvent.click(screen.getByRole("button", { name: /stop impersonating/i }));

        await waitFor(() => {
            expect(stopImpersonation).toHaveBeenCalledTimes(1);
            expect(mockUpdate).toHaveBeenCalledWith({ impersonationChanged: true });
            expect(mockRefresh).toHaveBeenCalled();
            expect(mockPush).toHaveBeenCalledWith("/superadmin");
        });
    });

    it("surfaces a toast and does not navigate when stop fails", async () => {
        // Regression: failures used to be silently swallowed — clicking Stop
        // did nothing visible, leaving the user stuck impersonating.
        vi.mocked(stopImpersonation).mockResolvedValue({ error: "No active impersonation" });
        renderWithToaster(<ImpersonationBanner />);

        await userEvent.click(screen.getByRole("button", { name: /stop impersonating/i }));

        await waitFor(() => {
            expect(screen.getByText(/failed to stop impersonation/i)).toBeDefined();
        });
        expect(mockUpdate).not.toHaveBeenCalled();
        expect(mockPush).not.toHaveBeenCalled();
    });
});
