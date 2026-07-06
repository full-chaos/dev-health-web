import { describe, expect, it, vi } from "vitest";
import { renderWithToaster, screen, userEvent } from "@/test/utils";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/admin/server", () => ({
    testConnection: vi.fn(),
    deleteCredential: vi.fn(),
    createCredential: vi.fn(),
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
        expect(screen.getByRole("button", { name: "Add Provider" })).toBeInTheDocument();
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

        await userEvent.click(screen.getByRole("button", { name: "Add Provider" }));
        expect(screen.getByLabelText("API Key")).toBeInTheDocument();

        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(screen.getByRole("table")).toBeInTheDocument();
    });
});
