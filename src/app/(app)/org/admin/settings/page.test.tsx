import { describe, expect, it, vi } from "vitest";

const { getOrg } = vi.hoisted(() => ({ getOrg: vi.fn() }));

vi.mock("@/lib/admin/server", () => ({
    getCurrentOrg: getOrg,
    deleteCurrentOrg: vi.fn(),
    dryRunDeleteCurrentOrg: vi.fn(),
    updateCurrentOrg: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/admin/AdminHeader", () => ({
    AdminHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/admin/settings/GeneralSettings", () => ({ GeneralSettings: () => null }));
vi.mock("@/components/admin/settings/BillingSettings", () => ({ BillingSettings: () => null }));
vi.mock("@/components/admin/settings/SecuritySettings", () => ({ SecuritySettings: () => null }));
vi.mock("@/components/admin/settings/DangerZone", () => ({ DangerZone: () => null }));

import { render, screen } from "@/test/utils";

import OrganizationSettingsPage from "./page";

describe("Organization settings load error (CHAOS-8241)", () => {
    it("says one plain sentence with a Retry, and never prints the raw backend text", async () => {
        getOrg.mockResolvedValue({ error: "GET /api/v1/orgs/current 500 upstream connect error" });
        render(await OrganizationSettingsPage());
        expect(screen.getByText("Organization settings could not be loaded")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
        expect(screen.queryByText(/upstream connect error/)).not.toBeInTheDocument();
        expect(screen.queryByText(/api\/v1/)).not.toBeInTheDocument();
    });

    it("shows no error state when the organization loads", async () => {
        getOrg.mockResolvedValue({ data: { name: "Acme", tier: "community" } });
        render(await OrganizationSettingsPage());
        expect(screen.queryByText("Organization settings could not be loaded")).toBeNull();
    });

    it("uses the full width and spaces the cards from the header (CHAOS-8255)", async () => {
        getOrg.mockResolvedValue({ data: { name: "Acme", tier: "community" } });
        render(await OrganizationSettingsPage());
        const page = screen.getByTestId("org-settings-page");
        expect(page.className).toContain("gap-6");
        expect(screen.getByTestId("org-settings-sections").className).not.toContain("max-w-");
    });
});
