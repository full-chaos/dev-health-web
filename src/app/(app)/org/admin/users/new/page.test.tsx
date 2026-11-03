import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@/test/utils";
import { ACTION_FAILED_MESSAGE } from "@/lib/actionFailure";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    usePathname: () => "/org/admin/users/new",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ push, refresh }),
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
    toast: { error: (m: string) => toastError(m), success: (m: string) => toastSuccess(m) },
}));

const inviteCurrentOrgMember = vi.fn();
vi.mock("@/lib/admin/server", () => ({
    inviteCurrentOrgMember: (email: string, role: string) => inviteCurrentOrgMember(email, role),
}));

import NewUserPage from "./page";

beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    toastError.mockReset();
    toastSuccess.mockReset();
    inviteCurrentOrgMember.mockReset();
});

async function fillAndSubmit(role?: string) {
    const user = userEvent.setup();
    render(<NewUserPage />);
    await user.type(screen.getByLabelText(/Email/u), "new.admin@example.com");
    if (role) await user.selectOptions(screen.getByLabelText("Role"), role);
    await user.click(screen.getByRole("button", { name: "Send invite" }));
}

describe("Add User page sends an invite (CHAOS-10881)", () => {
    it("offers Member, Admin and Viewer with Member first, and no password field", () => {
        render(<NewUserPage />);
        const options = Array.from(
            (screen.getByLabelText("Role") as HTMLSelectElement).options,
        ).map((o) => o.textContent);
        expect(options).toEqual(["Member", "Admin", "Viewer"]);
        expect((screen.getByLabelText("Role") as HTMLSelectElement).value).toBe("member");
        expect(screen.queryByLabelText(/Password/u)).not.toBeInTheDocument();
    });

    it("sends the invite with the chosen role and returns to a refreshed Users list", async () => {
        inviteCurrentOrgMember.mockResolvedValue({ data: { id: "i1" } });
        await fillAndSubmit("admin");

        await waitFor(() => expect(push).toHaveBeenCalledWith("/org/admin/users"));
        expect(inviteCurrentOrgMember).toHaveBeenCalledWith("new.admin@example.com", "admin");
        expect(refresh).toHaveBeenCalled();
        expect(toastError).not.toHaveBeenCalled();
        expect(toastSuccess).toHaveBeenCalledWith("Invite sent to new.admin@example.com");
    });

    it("shows the refusal sentence and stays on the form", async () => {
        inviteCurrentOrgMember.mockResolvedValue({
            error: "An invite for this email is already pending.",
        });
        await fillAndSubmit();

        await waitFor(() =>
            expect(toastError).toHaveBeenCalledWith("An invite for this email is already pending."),
        );
        expect(push).not.toHaveBeenCalled();
    });

    it("shows a failure when the action itself throws, and re-enables the form", async () => {
        inviteCurrentOrgMember.mockRejectedValue(new Error("Failed to find Server Action"));
        await fillAndSubmit();

        await waitFor(() => expect(toastError).toHaveBeenCalledWith(ACTION_FAILED_MESSAGE));
        expect(push).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Send invite" })).toBeEnabled();
    });
});
