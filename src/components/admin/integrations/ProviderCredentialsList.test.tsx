import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderWithToaster, screen, userEvent, waitFor } from "@/test/utils";

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
import { startPagerDutyOAuth } from "@/lib/admin/server";
import type { IntegrationCredential } from "@/lib/admin/types";

const originalLocation = window.location;
const locationAssign = vi.fn();

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
    beforeEach(() => {
        Object.defineProperty(window, "location", {
            configurable: true,
            writable: true,
            value: { ...originalLocation, assign: locationAssign },
        });
    });

    afterEach(() => {
        cleanup();
        locationAssign.mockReset();
        vi.mocked(startPagerDutyOAuth).mockReset();
        Object.defineProperty(window, "location", {
            configurable: true,
            writable: true,
            value: originalLocation,
        });
    });

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
        vi.mocked(startPagerDutyOAuth).mockResolvedValue({
            data: { authorize_url: "https://pagerduty.example/authorize" },
        });
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

        await waitFor(() => {
            expect(startPagerDutyOAuth).toHaveBeenCalledWith();
        });

        expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Credential Name")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Account subdomain")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Client ID")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Client secret")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("API token")).not.toBeInTheDocument();
        expect(screen.queryByText("Datasets")).not.toBeInTheDocument();
        expect(screen.queryByText("Service repository mappings")).not.toBeInTheDocument();
    });

    it("starts PagerDuty OAuth immediately without rendering credential fields", async () => {
        const user = userEvent.setup();
        vi.mocked(startPagerDutyOAuth).mockResolvedValue({
            data: { authorize_url: "https://pagerduty.example/authorize" },
        });
        renderWithToaster(
            <ProviderCredentialsList
                provider="pagerduty"
                providerName="PagerDuty"
                credentials={[makeCredential({ provider: "pagerduty" })]}
                syncConfigs={[]}
                canCreateCredential
            />,
        );

        await user.click(screen.getByRole("button", { name: "Add credential" }));
        const oauthChoice = screen.getByRole("button", { name: /^OAuth \(recommended\)/ });
        expect(oauthChoice).toHaveAttribute("aria-pressed", "true");
        await user.click(oauthChoice);

        expect(screen.queryByText("2. Credential")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Credential name")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Account subdomain")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Region")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Client ID")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Client secret")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("API token")).not.toBeInTheDocument();
        expect(screen.queryByText("Datasets")).not.toBeInTheDocument();

        await waitFor(() => {
            expect(startPagerDutyOAuth).toHaveBeenCalledWith();
            expect(locationAssign).toHaveBeenCalledWith("https://pagerduty.example/authorize");
        });
    });

    it("keeps PagerDuty client credentials and API token as selectable manual fallbacks", async () => {
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

        await user.click(screen.getByRole("button", { name: "Add credential" }));
        await user.click(screen.getByRole("button", { name: /^Client credentials/ }));
        await user.click(screen.getByRole("button", { name: "Continue" }));

        expect(screen.getByText("2. Credential")).toBeInTheDocument();
        expect(screen.getByLabelText("Client ID")).toBeInTheDocument();
        expect(screen.getByLabelText("Client secret")).toBeInTheDocument();
        expect(screen.queryByLabelText("API token")).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Back" }));
        await user.click(screen.getByRole("button", { name: "Use API token instead" }));
        await user.click(screen.getByRole("button", { name: "Continue" }));

        expect(screen.getByText("2. Credential")).toBeInTheDocument();
        expect(screen.getByLabelText("API token")).toBeInTheDocument();
        expect(screen.queryByLabelText("Client ID")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Client secret")).not.toBeInTheDocument();
    });

    it("keeps PagerDuty OAuth retryable when authorization cannot be started", async () => {
        const user = userEvent.setup();
        vi.mocked(startPagerDutyOAuth)
            .mockResolvedValueOnce({ error: "PagerDuty authorization could not be started." })
            .mockResolvedValueOnce({
                data: { authorize_url: "https://pagerduty.example/authorize" },
            });
        renderWithToaster(
            <ProviderCredentialsList
                provider="pagerduty"
                providerName="PagerDuty"
                credentials={[makeCredential({ provider: "pagerduty" })]}
                syncConfigs={[]}
                canCreateCredential
            />,
        );

        await user.click(screen.getByRole("button", { name: "Add credential" }));
        await user.click(screen.getByRole("button", { name: /^OAuth \(recommended\)/ }));
        expect(
            await screen.findByText("PagerDuty authorization could not be started."),
        ).toBeVisible();

        await user.click(screen.getByRole("button", { name: /^OAuth \(recommended\)/ }));
        await waitFor(() => {
            expect(startPagerDutyOAuth).toHaveBeenCalledTimes(2);
            expect(locationAssign).toHaveBeenCalledWith("https://pagerduty.example/authorize");
        });
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
