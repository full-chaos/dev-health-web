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

const updateIdentity = vi.fn();
vi.mock("@/lib/admin/server", () => ({ updateIdentity: (d: unknown) => updateIdentity(d) }));
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

import { EditIdentityFormWrapper } from "./EditIdentityFormWrapper";
import type { IdentityMapping } from "@/lib/admin/types";

beforeEach(() => {
    for (const m of [push, refresh, toastError, updateIdentity]) m.mockReset();
});

describe("Edit Identity form 409 team_changed_concurrently", () => {
    it("shows the authored sentence and reloads the identity", async () => {
        updateIdentity.mockResolvedValue(CONFLICT);
        render(
            <EditIdentityFormWrapper
                identity={
                    {
                        canonical_id: "a",
                        display_name: null,
                        email: null,
                        team_ids: [],
                        provider_identities: {},
                        updated_at: "2026-01-01T00:00:00Z",
                    } as unknown as IdentityMapping
                }
                teams={[]}
            />,
        );
        await userEvent.setup().click(screen.getByRole("button", { name: "save" }));
        await waitFor(() => expect(toastError).toHaveBeenCalledWith(TEAM_CHANGED_MESSAGE));
        expect(refresh).toHaveBeenCalled();
        expect(push).not.toHaveBeenCalled();
    });
});
