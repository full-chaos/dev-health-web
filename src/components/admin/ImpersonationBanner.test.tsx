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

// Mutable holder for the cross-tab event handler registered by the banner.
const eventHandlerHolder: {
    handler: ((event: { type: "started" | "stopped" }) => void) | null;
} = { handler: null };

vi.mock("@/lib/impersonation-events", () => ({
    broadcastImpersonationEvent: vi.fn(),
    isImpersonationWindow: vi.fn(() => false),
    onImpersonationEvent: vi.fn((handler: (event: { type: "started" | "stopped" }) => void) => {
        eventHandlerHolder.handler = handler;
        return () => {};
    }),
}));

import { stopImpersonation } from "@/lib/admin/server";
import { broadcastImpersonationEvent, isImpersonationWindow } from "@/lib/impersonation-events";

describe("ImpersonationBanner", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(isImpersonationWindow).mockReturnValue(false);
        eventHandlerHolder.handler = null;
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

    it("forces a session re-poll, broadcasts, and navigates on successful stop", async () => {
        vi.mocked(stopImpersonation).mockResolvedValue({ data: { status: "stopped" } });
        renderWithToaster(<ImpersonationBanner />);

        await userEvent.click(screen.getByRole("button", { name: /stop impersonating/i }));

        await waitFor(() => {
            expect(stopImpersonation).toHaveBeenCalledTimes(1);
            expect(mockUpdate).toHaveBeenCalledWith({ impersonationChanged: true });
            expect(broadcastImpersonationEvent).toHaveBeenCalledWith({ type: "stopped" });
            expect(mockRefresh).toHaveBeenCalled();
            expect(mockPush).toHaveBeenCalledWith("/superadmin");
        });
    });

    it("closes the dedicated impersonation tab on stop instead of navigating (CHAOS-2347)", async () => {
        vi.mocked(stopImpersonation).mockResolvedValue({ data: { status: "stopped" } });
        vi.mocked(isImpersonationWindow).mockReturnValue(true);
        const closeSpy = vi.spyOn(window, "close").mockImplementation(() => {});
        Object.defineProperty(window, "closed", { value: true, configurable: true });
        try {
            renderWithToaster(<ImpersonationBanner />);

            await userEvent.click(screen.getByRole("button", { name: /stop impersonating/i }));

            await waitFor(() => {
                expect(closeSpy).toHaveBeenCalled();
            });
            expect(mockPush).not.toHaveBeenCalled();
        } finally {
            closeSpy.mockRestore();
            Object.defineProperty(window, "closed", { value: false, configurable: true });
        }
    });

    it("re-polls the session when another tab stops impersonating", async () => {
        // This tab still shows is_impersonating=true; a "stopped" event from
        // another tab must force the server-verified re-poll.
        mockUpdate.mockResolvedValue({});
        renderWithToaster(<ImpersonationBanner />);

        expect(eventHandlerHolder.handler).not.toBeNull();
        eventHandlerHolder.handler?.({ type: "stopped" });

        await waitFor(() => {
            expect(mockUpdate).toHaveBeenCalledWith({ impersonationChanged: true });
            expect(mockRefresh).toHaveBeenCalled();
        });
    });

    it("skips the re-poll when the tab already reflects the event", () => {
        // session is impersonating; a "started" event carries no new state —
        // guards against N-tab update() storms.
        renderWithToaster(<ImpersonationBanner />);

        eventHandlerHolder.handler?.({ type: "started" });

        expect(mockUpdate).not.toHaveBeenCalled();
    });

    it("retries the forced re-poll when next-auth drops update() mid-flight", async () => {
        vi.useFakeTimers();
        try {
            // First update() is dropped (returns undefined while a session
            // fetch is in flight); the retry must fire after the backoff.
            mockUpdate.mockResolvedValueOnce(undefined).mockResolvedValue({});
            renderWithToaster(<ImpersonationBanner />);

            eventHandlerHolder.handler?.({ type: "stopped" });
            await vi.advanceTimersByTimeAsync(0);
            expect(mockUpdate).toHaveBeenCalledTimes(1);

            await vi.advanceTimersByTimeAsync(1500);
            expect(mockUpdate).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it("navigates the impersonation tab to /superadmin when a remote stop cannot close it", async () => {
        vi.mocked(isImpersonationWindow).mockReturnValue(true);
        const closeSpy = vi.spyOn(window, "close").mockImplementation(() => {});
        // window.closed stays false — the browser refused to close the tab.
        mockUpdate.mockResolvedValue({});
        try {
            renderWithToaster(<ImpersonationBanner />);

            eventHandlerHolder.handler?.({ type: "stopped" });

            await waitFor(() => {
                expect(closeSpy).toHaveBeenCalled();
                expect(mockPush).toHaveBeenCalledWith("/superadmin");
            });
        } finally {
            closeSpy.mockRestore();
        }
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
