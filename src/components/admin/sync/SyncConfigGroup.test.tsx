import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithToaster, screen, userEvent, waitFor } from "@/test/utils";
import type { SyncConfig } from "@/lib/admin/types";

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: mockRefresh }),
    default: { useRouter: () => ({ refresh: mockRefresh }) },
}));

const mockDeleteSyncConfig = vi.fn();
const mockTriggerSync = vi.fn();
const mockToggleSyncActive = vi.fn();
vi.mock("@/lib/admin/server", () => ({
    deleteSyncConfig: (...args: unknown[]) => mockDeleteSyncConfig(...args),
    triggerSync: (...args: unknown[]) => mockTriggerSync(...args),
    toggleSyncActive: (...args: unknown[]) => mockToggleSyncActive(...args),
}));

vi.mock("next/link", () => ({
    default: ({
        children,
        href,
        ...props
    }: {
        children: ReactNode;
        href: string;
        [key: string]: unknown;
    }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

import { SyncConfigGroup } from "./SyncConfigGroup";

function makeConfig(overrides: Partial<SyncConfig>): SyncConfig {
    return {
        id: "cfg-1",
        name: "chaos",
        provider: "github",
        credential_id: "cred-1",
        sync_targets: ["git"],
        sync_options: { owner: "full-chaos" },
        is_active: true,
        schedule_cron: null,
        timezone: null,
        last_sync_at: null,
        last_sync_success: null,
        last_sync_error: null,
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
        parent_id: null,
        ...overrides,
    };
}

const parent = makeConfig({ id: "parent-1", name: "chaos" });
const childConfigs = [
    makeConfig({ id: "child-1", name: "chaos/repo-a", parent_id: "parent-1" }),
    makeConfig({ id: "child-2", name: "chaos/repo-b", parent_id: "parent-1" }),
];

describe("SyncConfigGroup", () => {
    afterEach(() => {
        mockRefresh.mockReset();
        mockDeleteSyncConfig.mockReset();
        mockTriggerSync.mockReset();
        mockToggleSyncActive.mockReset();
    });

    it("renders group header with a delete control", () => {
        renderWithToaster(<SyncConfigGroup parent={parent} childConfigs={childConfigs} />);

        expect(screen.getByText("chaos")).toBeInTheDocument();
        expect(screen.getByText("2 repos")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    });

    it("clicking delete shows two-step confirm with group + child count copy", async () => {
        renderWithToaster(<SyncConfigGroup parent={parent} childConfigs={childConfigs} />);

        await userEvent.click(screen.getByRole("button", { name: "Delete" }));

        expect(screen.getByText("Delete group and 2 repo configs?")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Yes, Delete" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
        expect(mockDeleteSyncConfig).not.toHaveBeenCalled();
    });

    it("cancel dismisses the confirm without deleting", async () => {
        renderWithToaster(<SyncConfigGroup parent={parent} childConfigs={childConfigs} />);

        await userEvent.click(screen.getByRole("button", { name: "Delete" }));
        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

        expect(screen.queryByText("Delete group and 2 repo configs?")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
        expect(mockDeleteSyncConfig).not.toHaveBeenCalled();
    });

    it("confirming calls deleteSyncConfig with the parent id and refreshes", async () => {
        mockDeleteSyncConfig.mockResolvedValue({});
        renderWithToaster(<SyncConfigGroup parent={parent} childConfigs={childConfigs} />);

        await userEvent.click(screen.getByRole("button", { name: "Delete" }));
        await userEvent.click(screen.getByRole("button", { name: "Yes, Delete" }));

        await waitFor(() => {
            expect(mockDeleteSyncConfig).toHaveBeenCalledWith("parent-1");
            expect(screen.getByText("Group deleted")).toBeInTheDocument();
            expect(mockRefresh).toHaveBeenCalled();
        });
    });

    it("failed delete shows error toast and does not refresh", async () => {
        mockDeleteSyncConfig.mockResolvedValue({ error: "Delete failed upstream" });
        renderWithToaster(<SyncConfigGroup parent={parent} childConfigs={childConfigs} />);

        await userEvent.click(screen.getByRole("button", { name: "Delete" }));
        await userEvent.click(screen.getByRole("button", { name: "Yes, Delete" }));

        await waitFor(() => {
            expect(screen.getByText("Delete failed upstream")).toBeInTheDocument();
        });
        expect(mockRefresh).not.toHaveBeenCalled();
        // Confirm collapses back to the initial delete control
        expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    });

    it("delete click does not toggle expansion; expand toggle still works", async () => {
        renderWithToaster(<SyncConfigGroup parent={parent} childConfigs={childConfigs} />);

        await userEvent.click(screen.getByRole("button", { name: "Delete" }));
        expect(screen.queryByText("chaos/repo-a")).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

        const expandToggle = screen.getByRole("button", { expanded: false });
        await userEvent.click(expandToggle);
        expect(screen.getByText("chaos/repo-a")).toBeInTheDocument();
        expect(screen.getByText("chaos/repo-b")).toBeInTheDocument();
        expect(expandToggle).toHaveAttribute("aria-expanded", "true");
    });

    it("keeps child cards and their footers readable through tablet widths", async () => {
        renderWithToaster(<SyncConfigGroup parent={parent} childConfigs={childConfigs} />);

        await userEvent.click(screen.getByRole("button", { expanded: false }));

        const childCard = screen.getByRole("link", { name: /chaos\/repo-a/ });
        const childGrid = childCard.parentElement;
        const timestamp = screen.getAllByText("Last sync: Never")[0];
        const footer = timestamp.parentElement?.parentElement;

        expect(childGrid).toHaveClass("xl:grid-cols-2");
        expect(childGrid).not.toHaveClass("md:grid-cols-2");
        expect(timestamp.parentElement).toHaveClass("shrink-0");
        expect(footer).toHaveClass("flex-col", "sm:flex-row");
    });

    it("uses singular copy for a single repo config", async () => {
        renderWithToaster(<SyncConfigGroup parent={parent} childConfigs={[childConfigs[0]]} />);

        await userEvent.click(screen.getByRole("button", { name: "Delete" }));

        expect(screen.getByText("Delete group and 1 repo config?")).toBeInTheDocument();
    });
});
