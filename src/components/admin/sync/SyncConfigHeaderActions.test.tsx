import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SyncConfig } from "@/lib/admin/types";
import { render, screen, userEvent, waitFor, within } from "@/test/utils";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("next/link", () => ({
    default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));
const toggleSyncActive = vi.fn();
const deleteSyncConfig = vi.fn();
const triggerSync = vi.fn();
vi.mock("@/lib/admin/server", () => ({
    toggleSyncActive: (...a: unknown[]) => toggleSyncActive(...a),
    deleteSyncConfig: (...a: unknown[]) => deleteSyncConfig(...a),
    triggerSync: (...a: unknown[]) => triggerSync(...a),
    getSyncJobs: vi.fn(),
}));

import { SyncConfigHeaderActions } from "./SyncConfigHeaderActions";

const config = {
    id: "cfg 1",
    name: "github",
    provider: "github",
    is_active: true,
    last_sync_at: "2026-10-01T00:00:00Z",
    last_sync_success: true,
    sync_targets: [],
} as unknown as SyncConfig;

beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
    toggleSyncActive.mockReset().mockResolvedValue({ data: {} });
    deleteSyncConfig.mockReset().mockResolvedValue({ data: {} });
    triggerSync.mockReset().mockResolvedValue({ data: {} });
});

describe("Sync configuration header actions (CHAOS-8242)", () => {
    it("shows the status, then Edit (to the edit page), Pause, Delete and Sync Now", () => {
        render(<SyncConfigHeaderActions config={config} />);
        expect(screen.getByText("Success")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
            "href",
            "/org/admin/sync/cfg%201/edit",
        );
        expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /^Delete/ })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Sync Now" })).toBeInTheDocument();
        // The actions share one size: Delete is not the small list-row button.
        const sizeOf = (name: RegExp | string) =>
            screen.getByRole("button", { name }).className.includes("min-h-8.75");
        expect(sizeOf("Pause")).toBe(true);
        expect(sizeOf(/^Delete/)).toBe(true);
    });

    it("says Resume for a paused config and calls the same toggle as the list row", async () => {
        render(<SyncConfigHeaderActions config={{ ...config, is_active: false }} />);
        await userEvent.click(screen.getByRole("button", { name: "Resume" }));
        await waitFor(() => expect(toggleSyncActive).toHaveBeenCalledWith("cfg 1", true));
    });

    it("Pause calls the toggle with false", async () => {
        render(<SyncConfigHeaderActions config={config} />);
        await userEvent.click(screen.getByRole("button", { name: "Pause" }));
        await waitFor(() => expect(toggleSyncActive).toHaveBeenCalledWith("cfg 1", false));
    });

    it("Delete keeps its confirm, deletes only after it, and goes back to the list", async () => {
        render(<SyncConfigHeaderActions config={config} />);
        await userEvent.click(screen.getByRole("button", { name: /^Delete/ }));
        expect(deleteSyncConfig).not.toHaveBeenCalled();
        const dialog = screen.getByRole("dialog");
        await userEvent.click(within(dialog).getByRole("button", { name: /Delete/ }));
        await waitFor(() => expect(deleteSyncConfig).toHaveBeenCalledWith("cfg 1"));
        await waitFor(() => expect(push).toHaveBeenCalledWith("/org/admin/sync"));
    });

    it("Sync Now triggers the sync for this config", async () => {
        render(<SyncConfigHeaderActions config={config} />);
        await userEvent.click(screen.getByRole("button", { name: "Sync Now" }));
        await waitFor(() => expect(triggerSync).toHaveBeenCalledWith("cfg 1"));
    });
});
