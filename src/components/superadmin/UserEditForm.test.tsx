import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, userEvent } from "@/test/utils";
import { UserEditForm } from "./UserEditForm";
import type { User } from "@/lib/admin/types";

const updateUser = vi.hoisted(() => vi.fn());

vi.mock("@/lib/admin/server", () => ({ updateUser }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const baseUser: User = {
    id: "user-1",
    email: "alice@example.com",
    username: "alice",
    full_name: "Alice Example",
    avatar_url: null,
    auth_provider: "local",
    is_active: true,
    is_verified: false,
    is_superuser: false,
    role: "member",
    last_login_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
};

describe("UserEditForm", () => {
    beforeEach(() => {
        updateUser.mockReset();
    });

    it("shows the saved Verified and Superuser state after save without a reload", async () => {
        updateUser.mockResolvedValue({
            data: { ...baseUser, is_verified: true, is_superuser: true },
        });
        const user = userEvent.setup();
        render(<UserEditForm user={baseUser} />);

        await user.click(screen.getByLabelText("Verified"));
        await user.click(screen.getByLabelText("Superuser"));
        await user.click(screen.getByRole("button", { name: "Save Changes" }));

        await waitFor(() => expect(updateUser).toHaveBeenCalledTimes(1));
        expect(updateUser.mock.calls[0][1]).toMatchObject({
            is_verified: true,
            is_superuser: true,
        });
        await waitFor(() =>
            expect(screen.getByRole("button", { name: "Save Changes" })).toBeEnabled(),
        );
        expect(screen.getByLabelText("Verified")).toBeChecked();
        expect(screen.getByLabelText("Superuser")).toBeChecked();
    });

    it("keeps the entered state when the save fails", async () => {
        updateUser.mockResolvedValue({ error: "nope" });
        const user = userEvent.setup();
        render(<UserEditForm user={baseUser} />);

        await user.click(screen.getByLabelText("Verified"));
        await user.click(screen.getByRole("button", { name: "Save Changes" }));

        await waitFor(() => expect(updateUser).toHaveBeenCalledTimes(1));
        expect(screen.getByLabelText("Verified")).toBeChecked();
    });
});
