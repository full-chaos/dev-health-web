import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SyncConfig } from "@/lib/admin/types";

const mockListSyncConfigs = vi.fn();
vi.mock("@/lib/admin/server", () => ({
    listSyncConfigs: () => mockListSyncConfigs(),
}));

vi.mock("@/components/admin/sync/SyncConfigTable", () => ({
    SyncConfigTable: ({ configs }: { configs: readonly SyncConfig[] }) => (
        <div data-testid="sync-config-table">{configs.map((config) => config.name).join(", ")}</div>
    ),
}));

import SyncStatusPage from "./page";

const config: SyncConfig = {
    id: "cfg-1",
    name: "GitHub sync",
    provider: "github",
    credential_id: "cred-1",
    sync_targets: ["git"],
    sync_options: {},
    is_active: true,
    schedule_cron: null,
    timezone: null,
    last_sync_at: null,
    last_sync_success: null,
    last_sync_error: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    parent_id: null,
};

describe("SyncStatusPage", () => {
    it("exposes the shared Add sync config action", async () => {
        mockListSyncConfigs.mockResolvedValue({ data: [] });

        render(await SyncStatusPage());

        expect(screen.getByRole("link", { name: "Add sync config" })).toHaveAttribute(
            "href",
            "/org/admin/sync/new",
        );
    });

    it("keeps loaded configurations visible when the response also contains an error", async () => {
        mockListSyncConfigs.mockResolvedValue({
            data: [config],
            error: "Partial provider failure",
        });

        render(await SyncStatusPage());

        expect(screen.getByText("Sync configurations unavailable")).toBeInTheDocument();
        expect(screen.getByTestId("sync-config-table")).toHaveTextContent("GitHub sync");
    });

    it("does not render an empty table below a failed response with no data", async () => {
        mockListSyncConfigs.mockResolvedValue({ data: null, error: "Request failed" });

        render(await SyncStatusPage());

        expect(screen.getByText("Sync configurations unavailable")).toBeInTheDocument();
        expect(screen.queryByTestId("sync-config-table")).not.toBeInTheDocument();
    });
});
