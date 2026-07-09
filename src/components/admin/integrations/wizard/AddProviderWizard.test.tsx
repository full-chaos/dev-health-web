import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderWithToaster, screen, userEvent, waitFor } from "@/test/utils";

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

    it("github_app method: credential step shows the one-click install CTA, never a Finish button, and has no dangling Continue", async () => {
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
        // The credential step is terminal for this method (CHAOS-2837 blocker 4):
        // no verify/review steps and no dangling Continue button to nowhere.
        expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Finish" })).not.toBeInTheDocument();
    });

    it("invalidates a passed verification when a credential field changes afterward, blocking Finish until re-verified (CHAOS-2837 blocker 2)", async () => {
        vi.mocked(testConnection).mockResolvedValue({
            data: { success: true, error: null, details: null },
        });

        renderWithToaster(
            <AddProviderWizard
                lockedProvider="linear"
                credentials={[]}
                onCloseAction={vi.fn()}
                onCreatedAction={vi.fn()}
            />,
        );

        await userEvent.type(screen.getByLabelText("API Key"), "lin_api_test");
        await userEvent.click(screen.getByRole("button", { name: "Continue" }));
        await userEvent.click(screen.getByRole("button", { name: "Verify connection" }));
        await waitFor(() => {
            expect(screen.getByText(/connection successful/i)).toBeInTheDocument();
        });
        await userEvent.click(screen.getByRole("button", { name: "Continue" }));

        // On the review step with a verified credential, Finish is enabled.
        expect(screen.getByRole("button", { name: "Finish" })).not.toBeDisabled();

        // Go back to the credential step and change the field the test was run against.
        await userEvent.click(screen.getByRole("button", { name: "Back" }));
        await userEvent.click(screen.getByRole("button", { name: "Back" }));
        await userEvent.clear(screen.getByLabelText("API Key"));
        await userEvent.type(screen.getByLabelText("API Key"), "lin_api_test_CHANGED");
        await userEvent.click(screen.getByRole("button", { name: "Continue" }));

        // Verify step: the stale result is gone and re-verifying is required
        // again before Continue (and therefore Finish) can ever be reached —
        // the wizard structurally cannot get back to the review step with a
        // stale verification once a field has changed.
        expect(screen.queryByText(/connection successful(?!ly)/i)).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
        expect(createCredential).not.toHaveBeenCalled();
    });

    it("ignores a stale in-flight verify resolution after inputs change, never persisting unverified fields (CHAOS-2837 race fix)", async () => {
        let resolveDeferred!: (value: {
            data: { success: boolean; error: string | null; details: null };
        }) => void;
        const deferred = new Promise<{
            data: { success: boolean; error: string | null; details: null };
        }>((resolve) => {
            resolveDeferred = resolve;
        });
        vi.mocked(testConnection).mockReturnValueOnce(deferred);

        renderWithToaster(
            <AddProviderWizard
                lockedProvider="linear"
                credentials={[]}
                onCloseAction={vi.fn()}
                onCreatedAction={vi.fn()}
            />,
        );

        // Fill in snapshot A and fire verify against it — leave the request
        // pending (simulating a slow network round trip).
        await userEvent.type(screen.getByLabelText("API Key"), "lin_api_ORIGINAL");
        await userEvent.click(screen.getByRole("button", { name: "Continue" }));
        await userEvent.click(screen.getByRole("button", { name: "Verify connection" }));
        expect(testConnection).toHaveBeenCalledWith(
            "linear",
            expect.objectContaining({ credentials: { apiKey: "lin_api_ORIGINAL" } }),
        );

        // While that request is still in flight, go back and edit the field
        // the request was fired against — now snapshot B.
        await userEvent.click(screen.getByRole("button", { name: "Back" }));
        await userEvent.clear(screen.getByLabelText("API Key"));
        await userEvent.type(screen.getByLabelText("API Key"), "lin_api_CHANGED");

        // The STALE request for snapshot A now resolves successfully.
        await act(async () => {
            resolveDeferred({ data: { success: true, error: null, details: null } });
            await deferred;
            await Promise.resolve();
        });

        // Snapshot B (the live form) must NOT be considered verified: Continue
        // from the credential step lands back on a still-blocked verify step,
        // never on review, and no stale success message leaks through.
        await userEvent.click(screen.getByRole("button", { name: "Continue" }));
        expect(screen.queryByText(/connection successful(?!ly)/i)).not.toBeInTheDocument();
        await waitFor(() => {
            expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
        });
        expect(screen.queryByRole("button", { name: "Finish" })).not.toBeInTheDocument();

        // Even if the user forced their way to review somehow, Finish must
        // never call createCredential with the unverified snapshot B fields.
        expect(createCredential).not.toHaveBeenCalled();
    });
});
