import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithToaster, screen, userEvent, waitFor } from "@/test/utils";
import type { IntegrationCredential } from "@/lib/admin/types";

const mockTestConnection = vi.fn();
const mockCreateCredential = vi.fn();

vi.mock("@/lib/admin/server", () => ({
    testConnection: (...args: unknown[]) => mockTestConnection(...args),
    createCredential: (...args: unknown[]) => mockCreateCredential(...args),
}));

import { EditCredentialModal } from "./EditCredentialModal";

const JIRA_CREDENTIAL: IntegrationCredential = {
    id: "cred-jira",
    provider: "jira",
    name: "JIRA",
    is_active: true,
    config: {},
    last_test_at: null,
    last_test_success: null,
    last_test_error: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
};

describe("EditCredentialModal", () => {
    afterEach(() => {
        mockTestConnection.mockReset();
        mockCreateCredential.mockReset();
    });

    it("edits Jira under the keys the sync runtime resolves", async () => {
        mockTestConnection.mockResolvedValue({
            data: { success: true, error: null, details: null },
        });
        mockCreateCredential.mockResolvedValue({ data: JIRA_CREDENTIAL });

        renderWithToaster(
            <EditCredentialModal
                isOpen
                onCloseAction={vi.fn()}
                onEditedAction={vi.fn()}
                provider="jira"
                existingCredential={JIRA_CREDENTIAL}
            />,
        );

        await userEvent.type(screen.getByLabelText("Email"), "user@example.com");
        await userEvent.type(screen.getByLabelText("API Token"), "jira-token");
        await userEvent.type(screen.getByLabelText("Jira URL"), "https://acme.atlassian.net");
        await userEvent.click(screen.getByRole("button", { name: "Test Connection" }));

        await waitFor(() => {
            expect(mockTestConnection).toHaveBeenCalledWith("jira", {
                name: "JIRA",
                credentials: {
                    email: "user@example.com",
                    api_token: "jira-token",
                    url: "https://acme.atlassian.net",
                },
            });
        });

        await userEvent.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() => {
            expect(mockCreateCredential).toHaveBeenCalledWith({
                provider: "jira",
                name: "JIRA",
                credentials: {
                    email: "user@example.com",
                    api_token: "jira-token",
                    url: "https://acme.atlassian.net",
                },
            });
        });
    });

    it("surfaces the provider's reason when the test fails", async () => {
        mockTestConnection.mockResolvedValue({
            data: {
                success: false,
                error: null,
                details: { status: 401, error: "Bad credentials" },
            },
        });

        renderWithToaster(
            <EditCredentialModal
                isOpen
                onCloseAction={vi.fn()}
                onEditedAction={vi.fn()}
                provider="github"
                existingCredential={{ ...JIRA_CREDENTIAL, provider: "github", name: "default" }}
            />,
        );

        await userEvent.type(screen.getByLabelText("Token"), "ghp_123");
        await userEvent.click(screen.getByRole("button", { name: "Test Connection" }));

        expect(await screen.findByText(/Bad credentials/)).toBeInTheDocument();
    });
});
