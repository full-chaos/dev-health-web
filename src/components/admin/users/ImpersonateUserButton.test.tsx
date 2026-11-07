import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { render, renderWithToaster, userEvent } from "@/test/utils";
import { ImpersonateUserButton } from "./ImpersonateUserButton";
import type { User } from "@/lib/admin/types";

// useSession is read for the ACTOR (the logged-in admin). A mutable holder lets
// each test swap the session without re-mocking the module.
let mockSessionUser: Record<string, unknown> | null;
const mockUpdate = vi.fn();
const mockPush = vi.fn();

vi.mock("next-auth/react", () => ({
    useSession: () => ({
        data: mockSessionUser ? { user: mockSessionUser } : null,
        update: mockUpdate,
    }),
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn(), push: mockPush }),
}));

vi.mock("@/lib/admin/server", () => ({
    startImpersonation: vi.fn(),
    stopImpersonation: vi.fn(async () => ({ data: { status: "stopped" } })),
}));

vi.mock("@/lib/impersonation-events", async (actual) => ({
    ...(await actual<typeof import("@/lib/impersonation-events")>()),
    broadcastImpersonationEvent: vi.fn(),
    openImpersonationWindow: vi.fn(() => null),
}));

import { startImpersonation, stopImpersonation } from "@/lib/admin/server";
import {
    broadcastImpersonationEvent,
    IMPERSONATION_NOT_STARTED_TEXT,
} from "@/lib/impersonation-events";

const startAnswer = {
    data: {
        status: "active",
        target_user: {
            id: "target-1",
            email: "target@example.com",
            org_id: "org-t",
            role: "member",
        },
        expires_at: "2026-01-01T01:00:00Z",
        sessionHandoff: "sealed",
    },
};

function makeUser(overrides: Partial<User> = {}): User {
    return {
        id: "target-1",
        email: "target@example.com",
        username: null,
        full_name: null,
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

describe("ImpersonateUserButton", () => {
    beforeEach(() => {
        // Default actor: a superuser (the only role allowed to impersonate).
        mockSessionUser = { id: "admin-1", is_superuser: true };
        vi.clearAllMocks();
        mockUpdate.mockResolvedValue({ user: { id: "admin-1", is_impersonating: true } });
    });

    // CHAOS-13184: an update that did not admit the start ends the go-api row with the stop step
    // and shows the error; it never goes to the dashboard as if the start worked.
    it.each([
        ["the update answered no session (503)", null],
        ["the session is not impersonating", { user: { id: "admin-1", is_impersonating: false } }],
    ])("%s: stops, shows the error and does not navigate", async (_name, updated) => {
        mockUpdate.mockResolvedValue(updated);
        vi.mocked(startImpersonation).mockResolvedValue(startAnswer);
        renderWithToaster(<ImpersonateUserButton user={makeUser()} />);
        await userEvent.click(screen.getByRole("button", { name: /impersonate user/i }));
        await waitFor(() => expect(screen.getByText(IMPERSONATION_NOT_STARTED_TEXT)).toBeDefined());
        expect(stopImpersonation).toHaveBeenCalledTimes(1);
        expect(broadcastImpersonationEvent).not.toHaveBeenCalled();
        expect(mockPush).not.toHaveBeenCalled();
    });

    it("an admitted start goes to the dashboard and sends no stop", async () => {
        vi.mocked(startImpersonation).mockResolvedValue(startAnswer);
        renderWithToaster(<ImpersonateUserButton user={makeUser()} />);
        await userEvent.click(screen.getByRole("button", { name: /impersonate user/i }));
        await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/dashboard"));
        expect(stopImpersonation).not.toHaveBeenCalled();
        expect(broadcastImpersonationEvent).toHaveBeenCalledWith({ type: "started" });
    });

    it("renders for a superuser actor targeting a regular user", () => {
        render(<ImpersonateUserButton user={makeUser()} />);
        expect(screen.queryByRole("button", { name: /impersonate user/i })).not.toBeNull();
    });

    it("is hidden when the actor is not a superuser (CHAOS-2303)", () => {
        // Regression: a normal admin must not be offered an action that the
        // backend always rejects with 403.
        mockSessionUser = { id: "admin-1", is_superuser: false };
        const { container } = render(<ImpersonateUserButton user={makeUser()} />);
        expect(container.firstChild).toBeNull();
    });

    it("is hidden when there is no session", () => {
        mockSessionUser = null;
        const { container } = render(<ImpersonateUserButton user={makeUser()} />);
        expect(container.firstChild).toBeNull();
    });

    it("is hidden when targeting a superuser", () => {
        const { container } = render(
            <ImpersonateUserButton user={makeUser({ is_superuser: true })} />,
        );
        expect(container.firstChild).toBeNull();
    });

    it("is hidden when targeting an admin", () => {
        const { container } = render(<ImpersonateUserButton user={makeUser({ role: "admin" })} />);
        expect(container.firstChild).toBeNull();
    });

    it("is hidden when targeting yourself", () => {
        const { container } = render(<ImpersonateUserButton user={makeUser({ id: "admin-1" })} />);
        expect(container.firstChild).toBeNull();
    });
});
