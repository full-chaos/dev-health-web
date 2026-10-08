import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@/test/utils";
import { ACTION_FAILED_MESSAGE } from "@/lib/actionFailure";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    usePathname: () => "/superadmin/users/new",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ push, refresh }),
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (m: string) => toastError(m) } }));

const createPlatformUser = vi.fn();
vi.mock("@/lib/admin/server", () => ({
    createPlatformUser: (d: unknown) => createPlatformUser(d),
}));

import NewPlatformUserPage from "./page";

async function submit() {
    const user = userEvent.setup();
    render(<NewPlatformUserPage />);
    await user.type(screen.getByLabelText(/email/i), "a@b.co");
    await user.type(screen.getByLabelText(/^password/i), "longenoughpass1");
    await user.click(screen.getByRole("button", { name: /create|save|add/i }));
}

beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    toastError.mockReset();
    createPlatformUser.mockReset();
});

describe("Create platform user page (CHAOS-8967)", () => {
    it("is titled Create User", () => {
        render(<NewPlatformUserPage />);
        expect(screen.getByRole("heading", { name: "Create User" })).toBeInTheDocument();
    });

    it("goes to the platform users list and refreshes on success", async () => {
        createPlatformUser.mockResolvedValue({ data: { id: "u1" } });
        await submit();
        await waitFor(() => expect(push).toHaveBeenCalledWith("/superadmin/users"));
        expect(refresh).toHaveBeenCalled();
        expect(toastError).not.toHaveBeenCalled();
    });

    it("shows a returned error and stays on the page", async () => {
        createPlatformUser.mockResolvedValue({ error: "Email already exists" });
        await submit();
        await waitFor(() => expect(toastError).toHaveBeenCalledWith("Email already exists"));
        expect(push).not.toHaveBeenCalled();
    });

    it("shows the action-failed message when the action throws", async () => {
        createPlatformUser.mockRejectedValue(new Error("boom"));
        await submit();
        await waitFor(() => expect(toastError).toHaveBeenCalledWith(ACTION_FAILED_MESSAGE));
        expect(push).not.toHaveBeenCalled();
    });
});
