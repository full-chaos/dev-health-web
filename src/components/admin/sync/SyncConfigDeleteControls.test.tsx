import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithToaster, screen, userEvent, waitFor } from "@/test/utils";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: mockRefresh }),
}));

const mockDeleteSyncConfig = vi.fn();
vi.mock("@/lib/admin/server", () => ({
    deleteSyncConfig: (...args: unknown[]) => mockDeleteSyncConfig(...args),
}));

import { SyncConfigDeleteControls } from "./SyncConfigDeleteControls";

function renderControls() {
    return renderWithToaster(
        <SyncConfigDeleteControls
            configId="config-1"
            confirmMessage="Delete Example sync?"
            successMessage="Config deleted"
            targetName="Example sync"
        />,
    );
}

describe("SyncConfigDeleteControls", () => {
    beforeEach(() => {
        mockRefresh.mockReset();
        mockDeleteSyncConfig.mockReset();
    });

    it.each([
        ["a returned error", () => mockDeleteSyncConfig.mockResolvedValueOnce({ error: "Denied" })],
        ["a thrown error", () => mockDeleteSyncConfig.mockRejectedValueOnce(new Error("Offline"))],
    ])("closes without refreshing after %s", async (_case, configureFailure) => {
        configureFailure();
        renderControls();

        await userEvent.click(screen.getByRole("button", { name: "Delete Example sync" }));
        await userEvent.click(screen.getByRole("button", { name: "Yes, Delete" }));

        await waitFor(() => {
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
        expect(screen.getByText(/Denied|Offline/)).toBeInTheDocument();
        expect(mockRefresh).not.toHaveBeenCalled();
    });
});
