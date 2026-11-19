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

const getPendingTeamChanges = vi.fn();
const approveTeamChanges = vi.fn();
const dismissTeamChanges = vi.fn();
vi.mock("@/lib/admin/server", () => ({
    getPendingTeamChanges: () => getPendingTeamChanges(),
    approveTeamChanges: (...a: unknown[]) => approveTeamChanges(...a),
    dismissTeamChanges: (...a: unknown[]) => dismissTeamChanges(...a),
}));

import { PendingChangesPanel } from "./PendingChangesPanel";

const pending = {
    data: {
        changes: [
            {
                change_id: "c1",
                team_id: "eng",
                team_name: "Eng",
                change_type: "provider_removed",
                discovered_at: new Date().toISOString(),
            },
        ],
    },
};

beforeEach(() => {
    for (const m of [
        push,
        refresh,
        toastError,
        toastSuccess,
        getPendingTeamChanges,
        approveTeamChanges,
        dismissTeamChanges,
    ])
        m.mockReset();
    getPendingTeamChanges.mockResolvedValue(pending);
});

describe("PendingChangesPanel 409 team_changed_concurrently", () => {
    it.each([
        ["Approve", approveTeamChanges],
        ["Dismiss", dismissTeamChanges],
    ])("%s shows the authored sentence and reloads the changes", async (label, action) => {
        action.mockResolvedValue(CONFLICT);
        render(<PendingChangesPanel />);
        const button = await screen.findByRole("button", { name: label });
        await userEvent.setup().click(button);
        await waitFor(() => expect(toastError).toHaveBeenCalledWith(TEAM_CHANGED_MESSAGE));
        expect(getPendingTeamChanges).toHaveBeenCalledTimes(2);
        expect(refresh).toHaveBeenCalled();
    });
});
