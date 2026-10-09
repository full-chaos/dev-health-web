import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithToaster, screen, userEvent, waitFor, within } from "@/test/utils";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: mockRefresh }),
}));

const mockDeleteTeam = vi.fn();
vi.mock("@/lib/admin/server", () => ({
    deleteTeam: (...args: unknown[]) => mockDeleteTeam(...args),
}));

import { TeamDeleteControl } from "./TeamDeleteControl";

function renderControl() {
    return renderWithToaster(<TeamDeleteControl teamId="custom:abc" teamName="Night Owls" />);
}

describe("TeamDeleteControl", () => {
    beforeEach(() => {
        mockRefresh.mockReset();
        mockDeleteTeam.mockReset();
    });

    it("asks to confirm by team name and deletes that team on confirm", async () => {
        mockDeleteTeam.mockResolvedValueOnce({ data: undefined });
        renderControl();

        await userEvent.click(screen.getByRole("button", { name: "Delete Night Owls" }));
        expect(screen.getByRole("dialog")).toHaveTextContent("Delete Night Owls?");
        expect(screen.getByRole("dialog")).not.toHaveTextContent("custom:abc");
        expect(mockDeleteTeam).not.toHaveBeenCalled();

        await userEvent.click(screen.getByRole("button", { name: "Delete" }));

        await waitFor(() => expect(mockDeleteTeam).toHaveBeenCalledWith("custom:abc"));
        await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("calls nothing when the confirm is cancelled", async () => {
        renderControl();

        await userEvent.click(screen.getByRole("button", { name: "Delete Night Owls" }));
        await userEvent.click(
            within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }),
        );

        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(mockDeleteTeam).not.toHaveBeenCalled();
        expect(mockRefresh).not.toHaveBeenCalled();
    });

    it.each([
        [
            "a returned error",
            () => mockDeleteTeam.mockResolvedValueOnce({ error: "Denied" }),
            "Denied",
        ],
        [
            "a thrown error",
            () => mockDeleteTeam.mockRejectedValueOnce(new Error("Offline")),
            "The change was not saved. Try again.",
        ],
    ])("shows the error and does not refresh after %s", async (_case, fail, shown) => {
        fail();
        renderControl();

        await userEvent.click(screen.getByRole("button", { name: "Delete Night Owls" }));
        await userEvent.click(screen.getByRole("button", { name: "Delete" }));

        expect(await screen.findByText(shown)).toBeInTheDocument();
        expect(screen.queryByText(/Offline/)).toBeNull();
        expect(mockRefresh).not.toHaveBeenCalled();
    });
});
