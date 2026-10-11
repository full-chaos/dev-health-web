import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@/test/utils";
import { ACTION_FAILED_MESSAGE } from "@/lib/actionFailure";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    usePathname: () => "/superadmin/service-accounts/new",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ push, refresh }),
}));

const createServiceAccount = vi.fn();
vi.mock("@/lib/admin/server", () => ({
    createServiceAccount: (d: unknown) => createServiceAccount(d),
}));

import NewServiceAccountPage from "./page";

async function fill(name: string) {
    const user = userEvent.setup();
    render(<NewServiceAccountPage />);
    if (name) await user.type(screen.getByLabelText(/^name/i), name);
    await user.click(screen.getByRole("button", { name: /create service account/i }));
}

beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    createServiceAccount.mockReset();
});

describe("Create service account page (CHAOS-8966)", () => {
    it("refuses an empty name without calling the action", async () => {
        await fill("");
        expect(await screen.findByText("Enter a name.")).toBeInTheDocument();
        expect(createServiceAccount).not.toHaveBeenCalled();
    });

    it("refuses an invalid name without calling the action", async () => {
        await fill("Bad Name");
        expect(await screen.findByText(/lowercase letters/i)).toBeInTheDocument();
        expect(createServiceAccount).not.toHaveBeenCalled();
    });

    it("shows the made address and the operator line on success, with no URL change", async () => {
        createServiceAccount.mockResolvedValue({
            data: { id: "u-9", email: "ci@service.dev-health.invalid" },
        });
        await fill("ci");
        expect(await screen.findByText("ci@service.dev-health.invalid")).toBeInTheDocument();
        expect(screen.getByText(/issued by an operator/i)).toBeInTheDocument();
        expect(createServiceAccount).toHaveBeenCalledWith({ name: "ci", description: "" });
        expect(push).not.toHaveBeenCalled();
        expect(refresh).toHaveBeenCalled();
    });

    it("shows the returned sentence on a failure and keeps the form", async () => {
        createServiceAccount.mockResolvedValue({
            error: "A service account with this name already exists.",
        });
        await fill("ci");
        expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/^name/i)).toBeInTheDocument();
    });

    it("shows the generic sentence when the action throws", async () => {
        createServiceAccount.mockRejectedValue(new Error("pgx boom"));
        await fill("ci");
        await waitFor(() => expect(screen.getByText(ACTION_FAILED_MESSAGE)).toBeInTheDocument());
        expect(screen.queryByText(/pgx/)).toBeNull();
    });
});
