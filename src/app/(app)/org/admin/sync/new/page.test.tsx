import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin/server", () => ({
    listCredentials: vi.fn().mockResolvedValue({ data: [] }),
    getCanonicalIncidentIngestionEntitlement: vi
        .fn()
        .mockResolvedValue({ data: { enabled: false } }),
    getAutoImportCapabilities: vi.fn().mockResolvedValue({ data: {} }),
}));
vi.mock("@/components/admin/AdminHeader", () => ({
    AdminHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/admin/sync/SyncConfigForm", () => ({ SyncConfigForm: () => <div /> }));

import { render, screen } from "@/test/utils";

import NewSyncConfigPage from "./page";

describe("New sync configuration page (CHAOS-8243)", () => {
    it("has a back link to the connections list above the title", async () => {
        render(await NewSyncConfigPage());
        expect(screen.getByRole("link", { name: /Back to connections/ })).toHaveAttribute(
            "href",
            "/org/admin/sync",
        );
        expect(
            screen.getByRole("heading", { level: 1, name: "New Sync Configuration" }),
        ).toBeVisible();
    });
});
