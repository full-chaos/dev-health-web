import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SyncConfig } from "@/lib/admin/types";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
    usePathname: () => "/org/admin/sync",
    useSearchParams: () => new URLSearchParams(),
}));

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

    it("says one plain sentence with Retry and never prints the backend text", async () => {
        mockListSyncConfigs.mockResolvedValue({
            data: null,
            error: "GET /api/v1/admin/sync-configs 502 upstream connect error",
        });

        const { container } = render(await SyncStatusPage());

        expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
        expect(container.textContent).not.toContain("502");
        expect(container.textContent).not.toContain("/api/v1");
        expect(
            screen.getByText(
                "Sync configurations could not be loaded. Retry, or check again in a moment.",
            ),
        ).toBeInTheDocument();
    });

    it("has the title Connections and the Add sync config action with an icon before the label", async () => {
        mockListSyncConfigs.mockResolvedValue({ data: [] });

        render(await SyncStatusPage());

        expect(screen.getByRole("heading", { level: 1, name: "Connections" })).toBeInTheDocument();
        const add = screen.getByRole("link", { name: "Add sync config" });
        expect(add.firstElementChild?.tagName.toLowerCase()).toBe("svg");
    });
});
