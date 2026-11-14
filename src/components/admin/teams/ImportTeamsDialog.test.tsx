import { render, screen, waitFor } from "@/test/utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { discoverTeams } from "@/lib/admin/server";
import { READ_FAILED_MESSAGE } from "@/lib/readFailure";
import { ImportTeamsDialog, REFUSED_CREDENTIAL_MESSAGE } from "./ImportTeamsDialog";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/admin/server", () => ({
    discoverTeams: vi.fn(),
    importTeams: vi.fn(),
}));

describe("ImportTeamsDialog", () => {
    beforeEach(() => {
        vi.mocked(toast.error).mockClear();
        vi.mocked(discoverTeams).mockReset();
    });

    it("renders the import button", () => {
        render(<ImportTeamsDialog />);
        expect(screen.getByRole("button", { name: /import teams/i })).toBeInTheDocument();
    });

    it("shows all four providers including Linear when dialog is opened", async () => {
        const { userEvent } = await import("@testing-library/user-event");
        const user = userEvent.setup();
        render(<ImportTeamsDialog />);

        await user.click(screen.getByRole("button", { name: /import teams/i }));

        expect(screen.getByText("GitHub")).toBeInTheDocument();
        expect(screen.getByText("GitLab")).toBeInTheDocument();
        expect(screen.getByText("Jira")).toBeInTheDocument();
        expect(screen.getByText("Linear")).toBeInTheDocument();
    });

    it("shows Linear provider description", async () => {
        const { userEvent } = await import("@testing-library/user-event");
        const user = userEvent.setup();
        render(<ImportTeamsDialog />);

        await user.click(screen.getByRole("button", { name: /import teams/i }));

        expect(screen.getByText(/discover teams from your linear workspace/i)).toBeInTheDocument();
    });

    it("shows exactly four provider options", async () => {
        const { userEvent } = await import("@testing-library/user-event");
        const user = userEvent.setup();
        render(<ImportTeamsDialog />);

        await user.click(screen.getByRole("button", { name: /import teams/i }));

        const providerNames = ["GitHub", "GitLab", "Jira", "Linear"];
        for (const name of providerNames) {
            expect(screen.getByText(name)).toBeInTheDocument();
        }
    });

    async function failDiscover(result: { error: string; status: number }) {
        vi.mocked(discoverTeams).mockResolvedValue(result);
        const { userEvent } = await import("@testing-library/user-event");
        const user = userEvent.setup();
        render(<ImportTeamsDialog />);
        await user.click(screen.getByRole("button", { name: /import teams/i }));
        await user.click(screen.getByText("GitHub"));
    }

    it("shows the authored refused-credential sentence on a 422 discover read", async () => {
        await failDiscover({ error: "SERVED-DETAIL provider said no", status: 422 });
        await waitFor(() => expect(toast.error).toHaveBeenCalledWith(REFUSED_CREDENTIAL_MESSAGE));
        expect(toast.error).not.toHaveBeenCalledWith(expect.stringContaining("SERVED-DETAIL"));
        expect(document.body.textContent).not.toContain("SERVED-DETAIL");
    });

    it("keeps the generic toast on a 500 discover read", async () => {
        await failDiscover({ error: READ_FAILED_MESSAGE, status: 500 });
        await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
        expect(toast.error).toHaveBeenCalledWith(READ_FAILED_MESSAGE);
        expect(toast.error).not.toHaveBeenCalledWith(REFUSED_CREDENTIAL_MESSAGE);
    });
});
