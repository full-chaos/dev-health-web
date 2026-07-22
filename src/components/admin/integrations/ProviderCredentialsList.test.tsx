import { describe, expect, it, vi } from "vitest";
import { renderWithToaster, screen, userEvent } from "@/test/utils";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/admin/server", () => ({
    connectPagerDutyApiToken: vi.fn(),
    connectPagerDutyClientCredentials: vi.fn(),
    testConnection: vi.fn(),
    deleteCredential: vi.fn(),
    createCredential: vi.fn(),
    startPagerDutyOAuth: vi.fn(),
}));

import { ProviderCredentialsList } from "./ProviderCredentialsList";
import type { IntegrationCredential } from "@/lib/admin/types";

function makeCredential(overrides: Partial<IntegrationCredential> = {}): IntegrationCredential {
    return {
        id: "cred-1",
        provider: "linear",
        name: "default",
        is_active: true,
        config: {},
        last_test_at: null,
        last_test_success: true,
        last_test_error: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        ...overrides,
    };
}

describe("ProviderCredentialsList", () => {
    it("auto-opens the Add Provider wizard on first-time setup (zero credentials)", () => {
        renderWithToaster(
            <ProviderCredentialsList
                provider="linear"
                providerName="Linear"
                credentials={[]}
                syncConfigs={[]}
            />,
        );

        expect(screen.getByLabelText("API Key")).toBeInTheDocument();
    });

    it("renders the credentials table (not the wizard) when credentials already exist", () => {
        renderWithToaster(
            <ProviderCredentialsList
                provider="linear"
                providerName="Linear"
                credentials={[makeCredential()]}
                syncConfigs={[]}
            />,
        );

        expect(screen.getByRole("table")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Add credential" })).toBeInTheDocument();
    });

    it("opens the wizard when Add Provider is clicked and closes it back to the table on Cancel", async () => {
        renderWithToaster(
            <ProviderCredentialsList
                provider="linear"
                providerName="Linear"
                credentials={[makeCredential()]}
                syncConfigs={[]}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "Add credential" }));
        expect(screen.getByLabelText("API Key")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(screen.getByRole("table")).toBeInTheDocument();
    });

    it("uses the shared credential wizard for PagerDuty when credential creation is enabled", async () => {
        const user = userEvent.setup();
        renderWithToaster(
            <ProviderCredentialsList
                provider="pagerduty"
                providerName="PagerDuty"
                credentials={[makeCredential({ provider: "pagerduty" })]}
                syncConfigs={[]}
                canCreateCredential
            />,
        );

        expect(screen.getByRole("button", { name: "Add credential" })).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Add credential" }));
        expect(screen.getByText("OAuth (recommended)")).toBeInTheDocument();
        await user.click(screen.getByText("OAuth (recommended)"));
        await user.click(screen.getByRole("button", { name: "Continue" }));
        expect(screen.getByLabelText("Account subdomain")).toBeInTheDocument();
        expect(screen.queryByText("Datasets")).not.toBeInTheDocument();
        expect(screen.queryByText("Service repository mappings")).not.toBeInTheDocument();
    });

    it("keeps existing PagerDuty rows manageable while hiding credential creation when disabled", () => {
        renderWithToaster(
            <ProviderCredentialsList
                provider="pagerduty"
                providerName="PagerDuty"
                credentials={[makeCredential({ provider: "pagerduty" })]}
                syncConfigs={[]}
                canCreateCredential={false}
            />,
        );

        expect(screen.getByRole("table")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Manage" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Test" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Add credential" })).not.toBeInTheDocument();
    });
});
