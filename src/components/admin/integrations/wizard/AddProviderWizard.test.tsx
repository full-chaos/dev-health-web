import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderWithToaster, screen, userEvent, waitFor } from "@/test/utils";

import { AddProviderWizard } from "./AddProviderWizard";
import type { IntegrationCredential } from "@/lib/admin/types";

vi.mock("@/lib/admin/server", () => ({
    testConnection: vi.fn(),
    createCredential: vi.fn(),
}));

import { testConnection, createCredential } from "@/lib/admin/server";

function makeGitHubAppCredential(): IntegrationCredential {
    return {
        id: "cred-app",
        provider: "github",
        name: "github-app",
        is_active: true,
        config: { auth_mode: "github_app" },
        last_test_at: null,
        last_test_success: null,
        last_test_error: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
    };
}

describe("AddProviderWizard", () => {
    afterEach(() => {
        cleanup();
        vi.mocked(testConnection).mockReset();
        vi.mocked(createCredential).mockReset();
    });

    it("locked to github with no GitHub App connected offers the auth-method step with GitHub App recommended", () => {
        renderWithToaster(
            <AddProviderWizard
                lockedProvider="github"
                credentials={[]}
                onCloseAction={vi.fn()}
                onCreatedAction={vi.fn()}
            />,
        );

        expect(screen.getByText("Use GitHub App")).toBeInTheDocument();
        expect(screen.getByText(/Use a personal access token instead/i)).toBeInTheDocument();
    });

    it("locked to github with a GitHub App already connected skips straight to the manual credential step", () => {
        renderWithToaster(
            <AddProviderWizard
                lockedProvider="github"
                credentials={[makeGitHubAppCredential()]}
                onCloseAction={vi.fn()}
                onCreatedAction={vi.fn()}
            />,
        );

        // No auth-method step: no "Use GitHub App" option ever rendered.
        expect(screen.queryByText("Use GitHub App")).not.toBeInTheDocument();
        expect(screen.getByLabelText("Credential Name")).toBeInTheDocument();
        expect(screen.getByLabelText("Personal access token")).toBeInTheDocument();
    });

    it("runs the full manual create flow: fill token \u2192 verify \u2192 finish \u2192 persists credential", async () => {
        vi.mocked(testConnection).mockResolvedValue({
            data: { success: true, error: null, details: null },
        });
        vi.mocked(createCredential).mockResolvedValue({
            data: {
                id: "new-cred",
                provider: "linear",
                name: "default",
                is_active: true,
                config: {},
                last_test_at: null,
                last_test_success: true,
                last_test_error: null,
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-01T00:00:00Z",
            },
        });
        const onCreated = vi.fn();

        renderWithToaster(
            <AddProviderWizard
                lockedProvider="linear"
                credentials={[]}
                onCloseAction={vi.fn()}
                onCreatedAction={onCreated}
            />,
        );

        // Credential step: Continue is blocked until the API key is filled in.
        expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
        await userEvent.type(screen.getByLabelText("API Key"), "lin_api_test");
        await waitFor(() => {
            expect(screen.getByRole("button", { name: "Continue" })).not.toBeDisabled();
        });
        await userEvent.click(screen.getByRole("button", { name: "Continue" }));

        // Verify step: Continue is blocked until the test succeeds.
        expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
        await userEvent.click(screen.getByRole("button", { name: "Verify connection" }));
        await waitFor(() => {
            expect(screen.getByText(/connection successful/i)).toBeInTheDocument();
        });
        expect(screen.getByRole("button", { name: "Continue" })).not.toBeDisabled();
        await userEvent.click(screen.getByRole("button", { name: "Continue" }));

        // Review step: finish persists the credential.
        await userEvent.click(screen.getByRole("button", { name: "Finish" }));

        await waitFor(() => {
            expect(createCredential).toHaveBeenCalledWith(
                expect.objectContaining({ provider: "linear", name: "default" }),
            );
            expect(onCreated).toHaveBeenCalledTimes(1);
        });
        expect(screen.getByRole("link", { name: "Create sync configuration" })).toHaveAttribute(
            "href",
            "/org/admin/sync/new",
        );
    });

    it("github_app method: credential step shows the one-click install CTA, never a Finish button", async () => {
        renderWithToaster(
            <AddProviderWizard
                lockedProvider="github"
                credentials={[]}
                onCloseAction={vi.fn()}
                onCreatedAction={vi.fn()}
            />,
        );

        await userEvent.click(screen.getByText("Use GitHub App"));
        await userEvent.click(screen.getByRole("button", { name: "Continue" }));

        expect(screen.getByRole("link", { name: "Connect GitHub App" })).toBeInTheDocument();
        expect(screen.queryByLabelText("Personal access token")).not.toBeInTheDocument();
    });
});
