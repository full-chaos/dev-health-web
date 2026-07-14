import { beforeEach, describe, expect, it, vi } from "vitest";
import { within } from "@testing-library/react";
import { renderWithToaster, screen, userEvent, waitFor } from "@/test/utils";
import type { SyncConfig } from "@/lib/admin/types";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: mockRefresh }),
}));

const mockDeleteSyncConfig = vi.fn();
const mockToggleSyncActive = vi.fn();
vi.mock("@/lib/admin/server", () => ({
    deleteSyncConfig: (...args: unknown[]) => mockDeleteSyncConfig(...args),
    toggleSyncActive: (...args: unknown[]) => mockToggleSyncActive(...args),
}));

const mockTrigger = vi.fn();
const mockUseSyncTrigger = vi.fn();
vi.mock("./useSyncTrigger", () => ({
    useSyncTrigger: (configId: string) => mockUseSyncTrigger(configId),
}));

import { SyncConfigTable } from "./SyncConfigTable";

function makeConfig(overrides: Partial<SyncConfig> = {}): SyncConfig {
    return {
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
        ...overrides,
    };
}

const parent = makeConfig({
    id: "parent-1",
    name: "chaos",
    sync_options: { owner: "full-chaos" },
});
const childConfigs = [
    makeConfig({ id: "child-1", name: "chaos/repo-a", parent_id: "parent-1" }),
    makeConfig({ id: "child-2", name: "chaos/repo-b", parent_id: "parent-1" }),
];
const standalone = makeConfig({
    id: "linear-1",
    name: "Linear sync",
    provider: "linear",
    is_active: false,
});

function renderTable(configs: readonly SyncConfig[] = [parent, ...childConfigs, standalone]) {
    return renderWithToaster(<SyncConfigTable configs={configs} />);
}

function rowFor(text: string): HTMLElement {
    return screen.getByRole("row", { name: new RegExp(text, "i") });
}

describe("SyncConfigTable", () => {
    beforeEach(() => {
        mockRefresh.mockReset();
        mockDeleteSyncConfig.mockReset();
        mockDeleteSyncConfig.mockResolvedValue({});
        mockToggleSyncActive.mockReset();
        mockToggleSyncActive.mockResolvedValue({});
        mockTrigger.mockReset();
        mockUseSyncTrigger.mockReset();
        mockUseSyncTrigger.mockImplementation(() => ({
            liveStatus: null,
            isSyncing: false,
            trigger: mockTrigger,
        }));
    });

    it("renders the Providers-style table columns and horizontal overflow frame", () => {
        renderTable();

        expect(screen.getByRole("table")).toBeInTheDocument();
        expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
            "Configuration",
            "Provider",
            "State",
            "Sync status",
            "Last sync",
            "Actions",
        ]);
        expect(screen.getByRole("table").parentElement).toHaveClass("overflow-x-auto");
        expect(screen.getByRole("region", { name: "Sync configurations" })).toHaveAttribute(
            "tabindex",
            "0",
        );
        expect(screen.getAllByRole("row")).toHaveLength(3);
        expect(screen.getByText("GitHub")).toBeInTheDocument();
        expect(screen.getByText("Linear")).toBeInTheDocument();
    });

    it("keeps repository groups collapsed until their table row is expanded", async () => {
        renderTable();

        expect(screen.queryByRole("link", { name: "chaos/repo-a" })).not.toBeInTheDocument();
        const expandButton = screen.getByRole("button", { name: "Expand chaos group" });

        await userEvent.click(expandButton);

        expect(screen.getByRole("link", { name: "chaos/repo-a" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "chaos/repo-b" })).toBeInTheDocument();
        expect(screen.getAllByText("Part of chaos")).toHaveLength(2);
        expect(expandButton).toHaveAttribute("aria-expanded", "true");

        await userEvent.click(screen.getByRole("button", { name: "Collapse chaos group" }));

        expect(screen.queryByRole("link", { name: "chaos/repo-a" })).not.toBeInTheDocument();
    });

    it("resumes a paused configuration from its Actions cell", async () => {
        renderTable();
        const row = within(rowFor("Linear sync"));
        await userEvent.click(row.getByRole("button", { name: "Resume Linear sync" }));
        await waitFor(() => {
            expect(mockToggleSyncActive).toHaveBeenCalledWith("linear-1", true);
            expect(mockRefresh).toHaveBeenCalled();
            expect(screen.getByText("Sync resumed")).toBeInTheDocument();
        });
    });

    it("pauses an active configuration from its Actions cell", async () => {
        renderTable([makeConfig({ id: "active-1", name: "Active sync" })]);
        await userEvent.click(
            within(rowFor("Active sync")).getByRole("button", { name: "Pause Active sync" }),
        );
        await waitFor(() => {
            expect(mockToggleSyncActive).toHaveBeenCalledWith("active-1", false);
            expect(screen.getByText("Sync paused")).toBeInTheDocument();
        });
    });

    it.each([
        ["a returned error", () => mockToggleSyncActive.mockResolvedValueOnce({ error: "Denied" })],
        ["a thrown error", () => mockToggleSyncActive.mockRejectedValueOnce(new Error("Offline"))],
    ])("does not refresh after %s while toggling", async (_case, configureFailure) => {
        configureFailure();
        renderTable([standalone]);
        await userEvent.click(
            within(rowFor("Linear sync")).getByRole("button", { name: "Resume Linear sync" }),
        );
        await waitFor(() => expect(mockRefresh).not.toHaveBeenCalled());
        expect(screen.getByText(/Denied|Offline/)).toBeInTheDocument();
    });

    it("confirms group deletion without expanding the group", async () => {
        renderTable();
        const groupRow = within(rowFor("chaos"));
        await userEvent.click(groupRow.getByRole("button", { name: "Delete chaos group" }));
        expect(screen.queryByRole("link", { name: "chaos/repo-a" })).not.toBeInTheDocument();
        expect(screen.getByText("Delete chaos group and 2 repo configs?")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Yes, Delete" }));

        await waitFor(() => {
            expect(mockDeleteSyncConfig).toHaveBeenCalledWith("parent-1");
            expect(mockRefresh).toHaveBeenCalled();
            expect(screen.getByText("Group deleted")).toBeInTheDocument();
        });
    });

    it("keeps live sync status and the manual trigger in the same row controller", async () => {
        mockUseSyncTrigger.mockImplementation((configId: string) => ({
            liveStatus: configId === "linear-1" ? "running" : null,
            isSyncing: configId === "linear-1",
            trigger: mockTrigger,
        }));
        renderTable([standalone]);
        const row = within(rowFor("Linear sync"));

        expect(row.getAllByText("Syncing...")).toHaveLength(2);
        expect(row.getByRole("button", { name: "Syncing Linear sync" })).toBeDisabled();
    });

    it("triggers an immediate sync from the row action", async () => {
        renderTable([standalone]);
        const row = within(rowFor("Linear sync"));

        await userEvent.click(row.getByRole("button", { name: "Sync Linear sync now" }));

        expect(mockTrigger).toHaveBeenCalledOnce();
    });

    it("cancels deletion without mutating the configuration", async () => {
        renderTable([standalone]);
        const row = within(rowFor("Linear sync"));
        const deleteButton = row.getByRole("button", { name: "Delete Linear sync" });

        await userEvent.click(deleteButton);

        const dialog = screen.getByRole("dialog", { name: "Delete Linear sync?" });
        expect(dialog).toHaveFocus();
        expect(row.getByRole("button", { name: "Resume Linear sync" })).toBeDisabled();
        expect(row.getByRole("button", { name: "Sync Linear sync now" })).toBeDisabled();
        await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

        expect(
            screen.queryByRole("dialog", { name: "Delete Linear sync?" }),
        ).not.toBeInTheDocument();
        expect(deleteButton).toHaveFocus();
        expect(mockDeleteSyncConfig).not.toHaveBeenCalled();
    });

    it("keeps deletion modal and sibling actions locked while deletion is pending", async () => {
        let resolveDelete: (value: object) => void = () => undefined;
        mockDeleteSyncConfig.mockReturnValueOnce(
            new Promise((resolve) => {
                resolveDelete = resolve;
            }),
        );
        renderTable([standalone]);
        const row = within(rowFor("Linear sync"));

        await userEvent.click(row.getByRole("button", { name: "Delete Linear sync" }));
        await userEvent.click(screen.getByRole("button", { name: "Yes, Delete" }));
        await userEvent.keyboard("{Escape}");

        expect(screen.getByRole("dialog", { name: "Delete Linear sync?" })).toBeInTheDocument();
        expect(row.getByRole("button", { name: "Resume Linear sync" })).toBeDisabled();
        expect(row.getByRole("button", { name: "Sync Linear sync now" })).toBeDisabled();

        resolveDelete({});
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("renders the empty state inside the table frame", () => {
        renderTable([]);

        expect(screen.getByRole("table")).toBeInTheDocument();
        expect(
            screen.getByText(
                "No sync configurations found. Create a new configuration to get started.",
            ),
        ).toBeInTheDocument();
    });
});
