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

const createUser = vi.fn();
vi.mock("@/lib/admin/server", () => ({ createUser: (data: unknown) => createUser(data) }));

import NewUserPage from "./page";

beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    toastError.mockReset();
    toastSuccess.mockReset();
    createUser.mockReset();
});

async function fillAndSubmit(role?: string) {
    const user = userEvent.setup();
    render(<NewUserPage />);
    await user.type(screen.getByLabelText(/Email/u), "new.admin@example.com");
    if (role) await user.selectOptions(screen.getByLabelText("Role"), role);
    await user.click(screen.getByRole("button", { name: "Add User" }));
}

describe("Add User page (CHAOS-8972)", () => {
    it("offers Member, Admin and Viewer with Member first", () => {
        render(<NewUserPage />);
        const options = Array.from(
            (screen.getByLabelText("Role") as HTMLSelectElement).options,
        ).map((o) => o.textContent);
        expect(options).toEqual(["Member", "Admin", "Viewer"]);
        expect((screen.getByLabelText("Role") as HTMLSelectElement).value).toBe("member");
    });

    it("sends the chosen role and returns to a refreshed Users list", async () => {
        createUser.mockResolvedValue({ data: { email: "new.admin@example.com" } });
        await fillAndSubmit("admin");

        await waitFor(() => expect(push).toHaveBeenCalledWith("/org/admin/users"));
        expect(createUser).toHaveBeenCalledWith(
            expect.objectContaining({ email: "new.admin@example.com", role: "admin" }),
        );
        expect(refresh).toHaveBeenCalled();
        expect(toastError).not.toHaveBeenCalled();
    });

    it("shows the served error and stays on the form", async () => {
        createUser.mockResolvedValue({
            error: "User with email new.admin@example.com already exists",
        });
        await fillAndSubmit();

        await waitFor(() =>
            expect(toastError).toHaveBeenCalledWith(
                "User with email new.admin@example.com already exists",
            ),
        );
        expect(push).not.toHaveBeenCalled();
    });

    it("shows a failure when the action itself throws, and re-enables the form", async () => {
        createUser.mockRejectedValue(new Error("Failed to find Server Action"));
        await fillAndSubmit();

        await waitFor(() => expect(toastError).toHaveBeenCalledWith(ACTION_FAILED_MESSAGE));
        expect(push).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Add User" })).toBeEnabled();
    });
});
