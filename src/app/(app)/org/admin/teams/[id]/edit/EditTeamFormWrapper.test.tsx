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

const updateTeam = vi.fn();
vi.mock("@/lib/admin/server", () => ({
    updateTeam: (id: string, d: unknown) => updateTeam(id, d),
}));
let submitted: Record<string, unknown> = {};
vi.mock("@/components/admin/teams/TeamForm", () => ({
    TeamForm: ({ onSubmit }: { onSubmit: (d: unknown) => void }) => (
        <button type="button" onClick={() => onSubmit(submitted)}>
            save
        </button>
    ),
}));

import { EditTeamFormWrapper } from "./EditTeamFormWrapper";
import type { TeamMapping } from "@/lib/admin/types";

const team = {
    id: "row",
    team_id: "eng",
    name: "Engineering",
    description: "old",
    repo_patterns: ["a/*"],
    project_keys: ["ENG"],
    updated_at: "2026-01-01T00:00:00Z",
} as TeamMapping;

const form = (over: Record<string, unknown> = {}) => ({
    team_id: "eng",
    name: "Engineering",
    description: "old",
    repo_patterns: ["a/*"],
    project_keys: ["ENG"],
    ...over,
});

beforeEach(() => {
    for (const m of [push, refresh, toastError, toastSuccess, updateTeam]) m.mockReset();
});

async function save() {
    render(<EditTeamFormWrapper team={team} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "save" }));
}

describe("Edit Team form (CHAOS-14127)", () => {
    it("PATCHes only the changed fields", async () => {
        updateTeam.mockResolvedValue({ data: team });
        submitted = form({ name: "Platform", project_keys: ["ENG", "OPS"] });
        await save();
        await waitFor(() => expect(push).toHaveBeenCalledWith("/org/admin/teams"));
        expect(updateTeam).toHaveBeenCalledWith("eng", {
            name: "Platform",
            project_keys: ["ENG", "OPS"],
        });
    });

    it('sends description "" when the user clears it (only "" clears in go-api)', async () => {
        updateTeam.mockResolvedValue({ data: team });
        submitted = form({ name: "Platform", description: "" });
        await save();
        await waitFor(() => expect(updateTeam).toHaveBeenCalled());
        expect(updateTeam).toHaveBeenCalledWith("eng", { name: "Platform", description: "" });
    });

    it("omits an unchanged empty description", async () => {
        updateTeam.mockResolvedValue({ data: { ...team, description: null } });
        submitted = form({ name: "Platform", description: "" });
        render(<EditTeamFormWrapper team={{ ...team, description: null }} />);
        await userEvent.setup().click(screen.getByRole("button", { name: "save" }));
        await waitFor(() => expect(updateTeam).toHaveBeenCalled());
        expect(updateTeam).toHaveBeenCalledWith("eng", { name: "Platform" });
    });

    it("sends a changed non-empty description", async () => {
        updateTeam.mockResolvedValue({ data: team });
        submitted = form({ description: "new" });
        await save();
        await waitFor(() => expect(updateTeam).toHaveBeenCalled());
        expect(updateTeam).toHaveBeenCalledWith("eng", { description: "new" });
    });

    it("sends no request when nothing changed", async () => {
        submitted = form();
        await save();
        await waitFor(() => expect(push).toHaveBeenCalledWith("/org/admin/teams"));
        expect(updateTeam).not.toHaveBeenCalled();
    });

    it("on 409 team_changed_concurrently shows the authored sentence and reloads the team", async () => {
        updateTeam.mockResolvedValue(CONFLICT);
        submitted = form({ name: "Platform" });
        await save();
        await waitFor(() => expect(toastError).toHaveBeenCalledWith(TEAM_CHANGED_MESSAGE));
        expect(refresh).toHaveBeenCalled();
        expect(push).not.toHaveBeenCalled();
    });
});
