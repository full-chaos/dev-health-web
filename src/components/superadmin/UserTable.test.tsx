import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithToaster, userEvent } from "@/test/utils";
import { UserTable } from "./UserTable";
import type { User } from "@/lib/admin/types";

const mockUpdate = vi.fn();
const mockRefresh = vi.fn();
const mockPush = vi.fn();

vi.mock("next-auth/react", () => ({
    useSession: () => ({
        data: { user: { id: "admin-1", is_superuser: true } },
        update: mockUpdate,
    }),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: mockRefresh, push: mockPush }),
}));

vi.mock("@/lib/admin/server", () => ({
    startImpersonation: vi.fn(),
}));

vi.mock("@/lib/impersonation-events", () => ({
    broadcastImpersonationEvent: vi.fn(),
    openImpersonationWindow: vi.fn(() => null),
    isImpersonationWindow: vi.fn(() => false),
    onImpersonationEvent: vi.fn(() => () => {}),
}));

import { startImpersonation } from "@/lib/admin/server";
import { broadcastImpersonationEvent, openImpersonationWindow } from "@/lib/impersonation-events";

interface FakeImpersonationWindow {
    closed: boolean;
    location: { href: string };
    focus: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
}

function makeFakeWindow(): FakeImpersonationWindow {
    return { closed: false, location: { href: "" }, focus: vi.fn(), close: vi.fn() };
}

function makeUser(overrides: Partial<User> = {}): User {
    return {
        id: "target-1",
        email: "target@example.com",
        username: "target",
        full_name: "Target User",
        avatar_url: null,
        auth_provider: "local",
        is_active: true,
        is_verified: true,
        is_superuser: false,
        role: "member",
        last_login_at: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        ...overrides,
    };
}

describe("UserTable impersonation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default: popup blocked → same-tab fallback. Tests opt into a window.
        vi.mocked(openImpersonationWindow).mockReturnValue(null);
    });

    it("signals impersonationChanged so the session re-polls immediately (CHAOS-2309)", async () => {
        // Regression: this button used to send the legacy
        // `update({ startImpersonation: result.data })` payload, which the jwt
        // callback ignores — leaving the token unaware of the impersonation
        // for up to 30s while the backend already scoped data to the target
        // org (poisoning org-keyed client caches).
        vi.mocked(startImpersonation).mockResolvedValue({
            data: {
                status: "active",
                target_user: {
                    id: "target-1",
                    email: "target@example.com",
                    org_id: "org-target",
                    role: "member",
                },
                expires_at: "2026-01-01T01:00:00Z",
            },
        });
        renderWithToaster(<UserTable users={[makeUser()]} />);

        await userEvent.click(screen.getByRole("button", { name: /^impersonate$/i }));

        await waitFor(() => {
            expect(startImpersonation).toHaveBeenCalledWith("target-1");
            expect(mockUpdate).toHaveBeenCalledWith({ impersonationChanged: true });
            expect(mockRefresh).toHaveBeenCalled();
            // openImpersonationWindow is mocked to null (popup blocked) by
            // default — the fallback is same-tab navigation.
            expect(mockPush).toHaveBeenCalledWith("/dashboard");
        });
    });

    it("opens the impersonated view in the new tab and broadcasts the start (CHAOS-2347)", async () => {
        const fakeWindow = makeFakeWindow();
        vi.mocked(openImpersonationWindow).mockReturnValue(fakeWindow as unknown as Window);
        vi.mocked(startImpersonation).mockResolvedValue({
            data: {
                status: "active",
                target_user: {
                    id: "target-1",
                    email: "target@example.com",
                    org_id: "org-target",
                    role: "member",
                },
                expires_at: "2026-01-01T01:00:00Z",
            },
        });
        renderWithToaster(<UserTable users={[makeUser()]} />);

        await userEvent.click(screen.getByRole("button", { name: /^impersonate$/i }));

        await waitFor(() => {
            expect(fakeWindow.location.href).toBe("/dashboard");
            expect(fakeWindow.focus).toHaveBeenCalled();
            expect(broadcastImpersonationEvent).toHaveBeenCalledWith({ type: "started" });
            expect(mockPush).not.toHaveBeenCalled();
        });
    });

    it("closes the pre-opened tab when the start action fails", async () => {
        const fakeWindow = makeFakeWindow();
        vi.mocked(openImpersonationWindow).mockReturnValue(fakeWindow as unknown as Window);
        vi.mocked(startImpersonation).mockResolvedValue({ error: "Superuser access required" });
        renderWithToaster(<UserTable users={[makeUser()]} />);

        await userEvent.click(screen.getByRole("button", { name: /^impersonate$/i }));

        await waitFor(() => {
            expect(fakeWindow.close).toHaveBeenCalled();
        });
        expect(broadcastImpersonationEvent).not.toHaveBeenCalled();
    });

    it("shows an error toast and does not navigate when start fails", async () => {
        vi.mocked(startImpersonation).mockResolvedValue({ error: "Superuser access required" });
        renderWithToaster(<UserTable users={[makeUser()]} />);

        await userEvent.click(screen.getByRole("button", { name: /^impersonate$/i }));

        await waitFor(() => {
            expect(screen.getByText(/superuser access required/i)).toBeDefined();
        });
        expect(mockUpdate).not.toHaveBeenCalled();
        expect(mockPush).not.toHaveBeenCalled();
    });

    it("does not offer impersonation for superuser rows", () => {
        renderWithToaster(<UserTable users={[makeUser({ is_superuser: true })]} />);
        expect(screen.queryByRole("button", { name: /^impersonate$/i })).toBeNull();
    });
});
