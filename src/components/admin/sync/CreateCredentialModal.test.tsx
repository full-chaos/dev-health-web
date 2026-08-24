import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithToaster, screen, userEvent, waitFor } from "@/test/utils";
import type { IntegrationCredential, Provider } from "@/lib/admin/types";

const mockTestConnection = vi.fn();
const mockCreateCredential = vi.fn();

vi.mock("@/lib/admin/server", () => ({
    testConnection: (...args: unknown[]) => mockTestConnection(...args),
    createCredential: (...args: unknown[]) => mockCreateCredential(...args),
}));

import { unresolvableCredentialKeys } from "@/lib/admin/credentialVocabulary";
import { CreateCredentialModal } from "./CreateCredentialModal";

const PROVIDER_ENTRY_FIXTURES: { provider: Provider; fields: [string, string][] }[] = [
    { provider: "github", fields: [["Token", "ghp_123"]] },
    {
        provider: "gitlab",
        fields: [
            ["Token", "glpat_123"],
            ["GitLab URL", "https://gitlab.com"],
        ],
    },
    {
        provider: "jira",
        fields: [
            ["Email", "user@example.com"],
            ["API Token", "jira-token"],
            ["Jira URL", "https://acme.atlassian.net"],
        ],
    },
    { provider: "linear", fields: [["API Key", "lin_api_123"]] },
    {
        provider: "launchdarkly",
        fields: [
            ["API Token", "api-123"],
            ["Project Key", "default"],
            ["Environment Key", "production"],
        ],
    },
];

describe("CreateCredentialModal", () => {
    afterEach(() => {
        mockTestConnection.mockReset();
        mockCreateCredential.mockReset();
    });

    it("renders provider-specific fields", () => {
        const onClose = vi.fn();
        const onCreated = vi.fn();
        const { rerender } = renderWithToaster(
            <CreateCredentialModal
                isOpen
                onCloseAction={onClose}
                onCreatedAction={onCreated}
                provider="github"
            />,
        );

        expect(screen.getByLabelText("Credential Name")).toBeInTheDocument();
        expect(screen.getByLabelText("Token")).toBeInTheDocument();

        rerender(
            <>
                <CreateCredentialModal
                    isOpen
                    onCloseAction={onClose}
                    onCreatedAction={onCreated}
                    provider="gitlab"
                />
            </>,
        );
        expect(screen.getByLabelText("Token")).toBeInTheDocument();
        expect(screen.getByLabelText("GitLab URL")).toBeInTheDocument();

        rerender(
            <>
                <CreateCredentialModal
                    isOpen
                    onCloseAction={onClose}
                    onCreatedAction={onCreated}
                    provider="jira"
                />
            </>,
        );
        expect(screen.getByLabelText("Email")).toBeInTheDocument();
        expect(screen.getByLabelText("API Token")).toBeInTheDocument();
        expect(screen.getByLabelText("Jira URL")).toBeInTheDocument();

        rerender(
            <>
                <CreateCredentialModal
                    isOpen
                    onCloseAction={onClose}
                    onCreatedAction={onCreated}
                    provider="linear"
                />
            </>,
        );
        expect(screen.getByLabelText("API Key")).toBeInTheDocument();
    });

    it("test connection calls server action and shows result", async () => {
        mockTestConnection.mockResolvedValue({
            data: { success: true, error: null, details: null },
        });

        renderWithToaster(
            <CreateCredentialModal
                isOpen
                onCloseAction={vi.fn()}
                onCreatedAction={vi.fn()}
                provider="github"
            />,
        );

        await userEvent.type(screen.getByLabelText("Credential Name"), "Primary");
        await userEvent.type(screen.getByLabelText("Token"), "ghp_123");
        await userEvent.click(screen.getByRole("button", { name: "Test Connection" }));

        await waitFor(() => {
            expect(mockTestConnection).toHaveBeenCalledWith("github", {
                name: "Primary",
                credentials: { token: "ghp_123" },
            });
        });

        expect(screen.getByText(/Connection successful/)).toBeInTheDocument();
    });

    it("save is disabled until test passes", async () => {
        mockTestConnection.mockResolvedValue({
            data: { success: true, error: null, details: null },
        });

        renderWithToaster(
            <CreateCredentialModal
                isOpen
                onCloseAction={vi.fn()}
                onCreatedAction={vi.fn()}
                provider="github"
            />,
        );

        const saveButton = screen.getByRole("button", { name: "Save" });
        expect(saveButton).toBeDisabled();

        await userEvent.type(screen.getByLabelText("Credential Name"), "Primary");
        await userEvent.type(screen.getByLabelText("Token"), "ghp_123");
        await userEvent.click(screen.getByRole("button", { name: "Test Connection" }));

        await waitFor(() => {
            expect(saveButton).toBeEnabled();
        });
    });

    it("calls onCreated when save succeeds", async () => {
        const created: IntegrationCredential = {
            id: "cred-new",
            provider: "github",
            name: "Primary",
            is_active: true,
            config: {},
            last_test_at: null,
            last_test_success: true,
            last_test_error: null,
            created_at: "2024-01-01",
            updated_at: "2024-01-01",
        };

        mockTestConnection.mockResolvedValue({
            data: { success: true, error: null, details: null },
        });
        mockCreateCredential.mockResolvedValue({ data: created });

        const onClose = vi.fn();
        const onCreated = vi.fn();
        renderWithToaster(
            <CreateCredentialModal
                isOpen
                onCloseAction={onClose}
                onCreatedAction={onCreated}
                provider="github"
            />,
        );

        await userEvent.type(screen.getByLabelText("Credential Name"), "Primary");
        await userEvent.type(screen.getByLabelText("Token"), "ghp_123");
        await userEvent.click(screen.getByRole("button", { name: "Test Connection" }));
        await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());

        await userEvent.click(screen.getByRole("button", { name: "Save" }));

        await waitFor(() => {
            expect(mockCreateCredential).toHaveBeenCalledWith({
                provider: "github",
                name: "Primary",
                credentials: { token: "ghp_123" },
            });
            expect(onCreated).toHaveBeenCalledWith(created);
            expect(onClose).toHaveBeenCalled();
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
            <CreateCredentialModal
                isOpen
                onCloseAction={vi.fn()}
                onCreatedAction={vi.fn()}
                provider="github"
            />,
        );

        await userEvent.type(screen.getByLabelText("Credential Name"), "Primary");
        await userEvent.type(screen.getByLabelText("Token"), "ghp_123");
        await userEvent.click(screen.getByRole("button", { name: "Test Connection" }));

        expect(await screen.findByText(/Bad credentials/)).toBeInTheDocument();
    });

    it("submits Jira credentials under the keys the backend resolves", async () => {
        mockTestConnection.mockResolvedValue({
            data: { success: true, error: null, details: null },
        });
        mockCreateCredential.mockResolvedValue({
            data: {
                id: "cred-jira",
                provider: "jira",
                name: "Primary",
                is_active: true,
                config: {},
                last_test_at: null,
                last_test_success: true,
                last_test_error: null,
                created_at: "2024-01-01",
                updated_at: "2024-01-01",
            } satisfies IntegrationCredential,
        });

        renderWithToaster(
            <CreateCredentialModal
                isOpen
                onCloseAction={vi.fn()}
                onCreatedAction={vi.fn()}
                provider="jira"
            />,
        );

        await userEvent.type(screen.getByLabelText("Credential Name"), "Primary");
        await userEvent.type(screen.getByLabelText("Email"), "user@example.com");
        await userEvent.type(screen.getByLabelText("API Token"), "jira-token");
        await userEvent.type(screen.getByLabelText("Jira URL"), "https://acme.atlassian.net");
        await userEvent.click(screen.getByRole("button", { name: "Test Connection" }));

        await waitFor(() => {
            expect(mockTestConnection).toHaveBeenCalledWith("jira", {
                name: "Primary",
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
                name: "Primary",
                credentials: {
                    email: "user@example.com",
                    api_token: "jira-token",
                    url: "https://acme.atlassian.net",
                },
            });
        });
    });

    it.each(PROVIDER_ENTRY_FIXTURES)(
        "only submits credential keys $provider resolves server-side",
        async ({ provider, fields }) => {
            mockTestConnection.mockResolvedValue({
                data: { success: true, error: null, details: null },
            });

            renderWithToaster(
                <CreateCredentialModal
                    isOpen
                    onCloseAction={vi.fn()}
                    onCreatedAction={vi.fn()}
                    provider={provider}
                />,
            );

            await userEvent.type(screen.getByLabelText("Credential Name"), "Primary");
            for (const [label, value] of fields) {
                await userEvent.clear(screen.getByLabelText(label));
                await userEvent.type(screen.getByLabelText(label), value);
            }
            await userEvent.click(screen.getByRole("button", { name: "Test Connection" }));

            await waitFor(() => expect(mockTestConnection).toHaveBeenCalled());
            const [, options] = mockTestConnection.mock.calls[0] as [
                string,
                { credentials: Record<string, string> },
            ];
            expect(unresolvableCredentialKeys(provider, options.credentials)).toEqual([]);
        },
    );

    it("closes modal on cancel", async () => {
        const onClose = vi.fn();
        renderWithToaster(
            <CreateCredentialModal
                isOpen
                onCloseAction={onClose}
                onCreatedAction={vi.fn()}
                provider="github"
            />,
        );

        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
