import { beforeEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@/test/utils";
import { TEAM_CHANGED_MESSAGE } from "@/lib/admin/teamConflict";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
    usePathname: () => "/org/admin",
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({ push, refresh }),
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
    toast: { error: (m: string) => toastError(m), success: (m: string) => toastSuccess(m) },
}));

const CONFLICT = {
    error: "team changed concurrently, retry",
    status: 409,
    code: "team_changed_concurrently",
};

const createTeam = vi.fn();
vi.mock("@/lib/admin/server", () => ({ createTeam: (d: unknown) => createTeam(d) }));
vi.mock("@/components/admin/teams/TeamForm", () => ({
    TeamForm: ({ onSubmit }: { onSubmit: (d: unknown) => void }) => (
        <button
            type="button"
            onClick={() =>
                onSubmit({
                    team_id: "eng",
                    name: "Eng",
                    description: "",
                    repo_patterns: [],
                    project_keys: [],
                })
            }
        >
            save
        </button>
    ),
}));

import NewTeamPage from "./page";

beforeEach(() => {
    for (const m of [push, refresh, toastError, toastSuccess, createTeam]) m.mockReset();
});

describe("Add Team page 409 team_changed_concurrently", () => {
    it("shows the authored sentence and goes to a refreshed team list", async () => {
        createTeam.mockResolvedValue(CONFLICT);
        render(<NewTeamPage />);
        await userEvent.setup().click(screen.getByRole("button", { name: "save" }));
        await waitFor(() => expect(toastError).toHaveBeenCalledWith(TEAM_CHANGED_MESSAGE));
        expect(push).toHaveBeenCalledWith("/org/admin/teams");
        expect(refresh).toHaveBeenCalled();
    });
});
