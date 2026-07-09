import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderWithToaster, screen, userEvent, waitFor } from "@/test/utils";

import { CredentialsTable } from "./CredentialsTable";
import type { IntegrationCredential } from "@/lib/admin/types";

vi.mock("@/lib/admin/server", () => ({
    testConnection: vi.fn(),
    deleteCredential: vi.fn(),
    createCredential: vi.fn(),
}));

import { testConnection, deleteCredential } from "@/lib/admin/server";

function makeCredential(overrides: Partial<IntegrationCredential> = {}): IntegrationCredential {
    return {
        id: "cred-1",
        provider: "github",
        name: "Primary GitHub",
        is_active: true,
        config: {},
        last_test_at: "2026-01-01T12:00:00Z",
        last_test_success: true,
        last_test_error: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        ...overrides,
    };
}

describe("CredentialsTable", () => {
    afterEach(() => {
        cleanup();
        vi.mocked(testConnection).mockReset();
        vi.mocked(deleteCredential).mockReset();
    });

    it("renders a compact table row per credential with auth method and status", () => {
        renderWithToaster(
            <CredentialsTable
                provider="github"
                providerName="GitHub"
                credentials={[makeCredential()]}
                syncConfigs={[]}
            />,
        );

        expect(screen.getByRole("table")).toBeInTheDocument();
        expect(screen.getByText("Primary GitHub")).toBeInTheDocument();
        expect(screen.getByText("Personal access token")).toBeInTheDocument();
        expect(screen.getByText("Connected")).toBeInTheDocument();
    });

    it("shows a used-by-sync-configs count derived from the passed sync configs", () => {
        renderWithToaster(
            <CredentialsTable
                provider="github"
                providerName="GitHub"
                credentials={[makeCredential({ id: "cred-1" })]}
                syncConfigs={[{ credential_id: "cred-1" }, { credential_id: "cred-1" }]}
            />,
        );

        expect(screen.getByText("2")).toBeInTheDocument();
    });

    it("shows Resolve instead of Manage for a failing/untested credential", () => {
        renderWithToaster(
            <CredentialsTable
                provider="github"
                providerName="GitHub"
                credentials={[makeCredential({ last_test_success: false })]}
                syncConfigs={[]}
            />,
        );

        expect(screen.getByRole("button", { name: "Resolve" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Manage" })).not.toBeInTheDocument();
    });

    it("hides the Manage/Resolve action for a GitHub App credential (managed via reinstall, not manual edit)", () => {
        renderWithToaster(
            <CredentialsTable
                provider="github"
                providerName="GitHub"
                credentials={[
                    makeCredential({ name: "github-app", config: { auth_mode: "github_app" } }),
                ]}
                syncConfigs={[]}
            />,
        );

        expect(screen.queryByRole("button", { name: "Manage" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Resolve" })).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Test" })).toBeInTheDocument();
    });

    it("runs a connection test and shows a success toast", async () => {
        vi.mocked(testConnection).mockResolvedValue({
            data: { success: true, error: null, details: null },
        });
        renderWithToaster(
            <CredentialsTable
                provider="github"
                providerName="GitHub"
                credentials={[makeCredential()]}
                syncConfigs={[]}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "Test" }));

        await waitFor(() => {
            expect(screen.getByText("Connection successful")).toBeInTheDocument();
        });
        expect(testConnection).toHaveBeenCalledWith("github", { name: "Primary GitHub" });
    });

    it("opens a destructive confirm dialog before deleting, warning when used by sync configs", async () => {
        renderWithToaster(
            <CredentialsTable
                provider="github"
                providerName="GitHub"
                credentials={[makeCredential({ id: "cred-1" })]}
                syncConfigs={[{ credential_id: "cred-1" }]}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "Delete" }));

        expect(screen.getByRole("dialog")).toHaveTextContent(/used by 1 sync configuration/i);
    });

    it("deletes the credential when the confirm dialog is confirmed", async () => {
        vi.mocked(deleteCredential).mockResolvedValue({ data: undefined });
        renderWithToaster(
            <CredentialsTable
                provider="github"
                providerName="GitHub"
                credentials={[makeCredential({ name: "Primary GitHub" })]}
                syncConfigs={[]}
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "Delete" }));
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

        await waitFor(() => {
            expect(deleteCredential).toHaveBeenCalledWith("github", "Primary GitHub");
        });
    });
});
