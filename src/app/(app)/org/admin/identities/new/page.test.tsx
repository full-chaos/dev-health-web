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

const createIdentity = vi.fn();
const listTeams = vi.fn();
vi.mock("@/lib/admin/server", () => ({
    createIdentity: (d: unknown) => createIdentity(d),
    listTeams: () => listTeams(),
}));
vi.mock("@/components/admin/identities/IdentityForm", () => ({
    IdentityForm: ({ onSubmit }: { onSubmit: (d: unknown) => void }) => (
        <button
            type="button"
            onClick={() =>
                onSubmit({
                    canonical_id: "a",
                    display_name: "",
                    email: "",
                    provider_identities: {},
                    team_ids: ["eng"],
                })
            }
        >
            save
        </button>
    ),
}));

import NewIdentityPage from "./page";

beforeEach(() => {
    for (const m of [push, refresh, toastError, createIdentity, listTeams]) m.mockReset();
    listTeams.mockResolvedValue({ data: [] });
});

describe("Add Identity page 409 team_changed_concurrently", () => {
    it("shows the authored sentence and reloads the teams", async () => {
        createIdentity.mockResolvedValue(CONFLICT);
        render(<NewIdentityPage />);
        await userEvent.setup().click(await screen.findByRole("button", { name: "save" }));
        await waitFor(() => expect(toastError).toHaveBeenCalledWith(TEAM_CHANGED_MESSAGE));
        await waitFor(() => expect(listTeams).toHaveBeenCalledTimes(2));
        expect(push).not.toHaveBeenCalled();
    });
});
