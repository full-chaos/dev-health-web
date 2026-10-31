import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, userEvent, waitFor } from "@/test/utils";

const update = vi.fn();
vi.mock("next-auth/react", () => ({
    useSession: () => ({ data: null, status: "authenticated", update }),
}));

import { ChangePasswordSettings } from "./ChangePasswordSettings";

async function fill(
    user: ReturnType<typeof userEvent.setup>,
    current: string,
    next: string,
    confirm: string,
) {
    await user.type(screen.getByLabelText("Current password"), current);
    await user.type(screen.getByLabelText("New password"), next);
    await user.type(screen.getByLabelText("Confirm new password"), confirm);
    await user.click(screen.getByRole("button", { name: "Change password" }));
}

describe("ChangePasswordSettings", () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
        update.mockReset();
    });

    it("does not call the server when the confirmation differs", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        const user = userEvent.setup();
        render(<ChangePasswordSettings />);
        await fill(user, "old-password-1", "new-password-long-1", "new-password-long-2");
        expect(screen.getByText("The new passwords do not match.")).toBeInTheDocument();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("adopts the sealed handoff and clears the fields on success", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                new Response(JSON.stringify({ ok: true, sessionHandoff: "sealed-handoff" }), {
                    status: 200,
                }),
            ),
        );
        const user = userEvent.setup();
        render(<ChangePasswordSettings />);
        await fill(user, "old-password-1", "new-password-long-1", "new-password-long-1");
        // CHAOS-12088: the page passes the sealed handoff on, unread; no token pair in clear.
        await waitFor(() =>
            expect(update).toHaveBeenCalledWith({ sessionHandoff: "sealed-handoff" }),
        );
        expect(
            await screen.findByText("Password changed. Your other sessions were signed out."),
        ).toBeInTheDocument();
        expect(screen.getByLabelText("Current password")).toHaveValue("");
        expect(screen.getByLabelText("New password")).toHaveValue("");
    });

    it("shows the server's refusal and the rule names, and keeps the session untouched", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                new Response(
                    JSON.stringify({
                        error: "The new password was not accepted.",
                        violations: ["Password must be at least 12 characters long"],
                    }),
                    { status: 422 },
                ),
            ),
        );
        const user = userEvent.setup();
        render(<ChangePasswordSettings />);
        await fill(user, "old-password-1", "newpass-1", "newpass-1");
        expect(await screen.findByText("The new password was not accepted.")).toBeInTheDocument();
        expect(
            screen.getByText("Password must be at least 12 characters long"),
        ).toBeInTheDocument();
        expect(update).not.toHaveBeenCalled();
    });
});
