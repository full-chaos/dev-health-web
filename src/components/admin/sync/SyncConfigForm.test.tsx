import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, renderWithToaster, screen, userEvent, waitFor } from "@/test/utils";
import type { IntegrationCredential, SyncConfig } from "@/lib/admin/types";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: mockPush }),
    default: { useRouter: () => ({ push: mockPush }) },
}));

const mockCreateSyncConfig = vi.fn();
const mockUpdateSyncConfig = vi.fn();
const mockBatchCreateSyncConfigs = vi.fn();
const mockListReposForCredential = vi.fn();
const mockTestConnection = vi.fn();
const mockCreateCredential = vi.fn();
vi.mock("@/lib/admin/server", () => ({
    createSyncConfig: (...args: unknown[]) => mockCreateSyncConfig(...args),
    updateSyncConfig: (...args: unknown[]) => mockUpdateSyncConfig(...args),
    batchCreateSyncConfigs: (...args: unknown[]) => mockBatchCreateSyncConfigs(...args),
    listReposForCredential: (...args: unknown[]) => mockListReposForCredential(...args),
    testConnection: (...args: unknown[]) => mockTestConnection(...args),
    createCredential: (...args: unknown[]) => mockCreateCredential(...args),
}));

const mockUseAdminTier = vi.fn(() => ({
    tier: "community",
    features: {},
    limits: {},
    minSyncIntervalHours: 24,
}));
vi.mock("@/components/admin/AdminTierContext", () => ({
    useAdminTier: () => mockUseAdminTier(),
}));

vi.mock("next/link", () => ({
    default: ({
        children,
        href,
        ...props
    }: {
        children: ReactNode;
        href: string;
        [key: string]: unknown;
    }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

import { SyncConfigForm } from "./SyncConfigForm";

const mockCredentials: IntegrationCredential[] = [
    {
        id: "cred-1",
        provider: "github",
        name: "My GitHub Token",
        is_active: true,
        config: {},
        last_test_at: null,
        last_test_success: null,
        last_test_error: null,
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
    },
    {
        id: "cred-2",
        provider: "gitlab",
        name: "My GitLab Token",
        is_active: true,
        config: {},
        last_test_at: null,
        last_test_success: null,
        last_test_error: null,
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
    },
];

describe("SyncConfigForm", () => {
    afterEach(() => {
        mockPush.mockReset();
        mockCreateSyncConfig.mockReset();
        mockUpdateSyncConfig.mockReset();
        mockBatchCreateSyncConfigs.mockReset();
        mockListReposForCredential.mockReset();
        mockListReposForCredential.mockResolvedValue({
            data: { provider: "github", owner: "", repos: [], total: 0 },
        });
        mockTestConnection.mockReset();
        mockCreateCredential.mockReset();
        mockUseAdminTier.mockReset();
        mockUseAdminTier.mockReturnValue({
            tier: "community",
            features: {},
            limits: {},
            minSyncIntervalHours: 24,
        });
    });

    it("renders all form fields for create mode", () => {
        render(<SyncConfigForm credentials={mockCredentials} />);

        expect(screen.getByLabelText("Configuration Name")).toBeInTheDocument();
        expect(screen.getByLabelText("Provider")).toBeInTheDocument();
        expect(screen.getByLabelText("Credential")).toBeInTheDocument();
        expect(screen.getByText("Sync Targets")).toBeInTheDocument();
        expect(screen.getByLabelText("Enable automatic sync schedule")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Create Configuration" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Cancel" })).toBeInTheDocument();
    });

    it("shows GitHub sync targets by default", () => {
        render(<SyncConfigForm credentials={mockCredentials} />);

        expect(screen.getByLabelText("Git Data (Commits, Branches)")).toBeInTheDocument();
        expect(screen.getByLabelText("Pull Requests")).toBeInTheDocument();
        expect(screen.getByLabelText("CI/CD Pipelines")).toBeInTheDocument();
        expect(screen.getByLabelText("Deployments")).toBeInTheDocument();
        expect(screen.getByLabelText("Incidents")).toBeInTheDocument();
        expect(screen.getByLabelText("Work Items (Issues, Tickets)")).toBeInTheDocument();
    });

    it("switching provider updates available targets", async () => {
        render(<SyncConfigForm credentials={mockCredentials} />);

        await userEvent.selectOptions(screen.getByLabelText("Provider"), "jira");

        expect(screen.getByLabelText("Work Items (Issues, Tickets)")).toBeInTheDocument();
        expect(screen.queryByLabelText("Git Data (Commits, Branches)")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Pull Requests")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("CI/CD Pipelines")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Deployments")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Incidents")).not.toBeInTheDocument();
    });

    it("switching provider filters credentials", async () => {
        render(<SyncConfigForm credentials={mockCredentials} />);

        expect(screen.getByRole("option", { name: "My GitHub Token" })).toBeInTheDocument();

        await userEvent.selectOptions(screen.getByLabelText("Provider"), "gitlab");

        expect(screen.getByRole("option", { name: "My GitLab Token" })).toBeInTheDocument();
        expect(screen.queryByRole("option", { name: "My GitHub Token" })).not.toBeInTheDocument();
    });

    it("toggling sync target checkboxes works", async () => {
        render(<SyncConfigForm credentials={mockCredentials} />);

        const gitDataCheckbox = screen.getByLabelText("Git Data (Commits, Branches)");
        expect(gitDataCheckbox).not.toBeChecked();

        await userEvent.click(gitDataCheckbox);
        expect(gitDataCheckbox).toBeChecked();

        await userEvent.click(gitDataCheckbox);
        expect(gitDataCheckbox).not.toBeChecked();
    });

    it("successful create calls server action and redirects", async () => {
        mockCreateSyncConfig.mockResolvedValue(undefined);
        renderWithToaster(<SyncConfigForm credentials={mockCredentials} />);

        await userEvent.type(screen.getByLabelText("Configuration Name"), "Nightly Sync");
        await userEvent.selectOptions(screen.getByLabelText("Credential"), "cred-1");
        await userEvent.click(screen.getByRole("button", { name: "Create Configuration" }));

        await waitFor(() => {
            expect(mockCreateSyncConfig).toHaveBeenCalledWith({
                name: "Nightly Sync",
                provider: "github",
                credential_id: "cred-1",
                sync_targets: [],
                schedule_cron: null,
                timezone: null,
                initial_sync_depth: 30,
                sync_options: {},
            });
            expect(screen.getByText("Config created")).toBeInTheDocument();
            expect(mockPush).toHaveBeenCalledWith("/admin/sync");
        });
    });

    it("failed create shows error toast", async () => {
        mockCreateSyncConfig.mockResolvedValue({ error: "Duplicate name" });
        renderWithToaster(<SyncConfigForm credentials={mockCredentials} />);

        await userEvent.type(screen.getByLabelText("Configuration Name"), "Duplicate");
        await userEvent.click(screen.getByRole("button", { name: "Create Configuration" }));

        await waitFor(() => {
            expect(mockCreateSyncConfig).toHaveBeenCalled();
            expect(screen.getByText("Duplicate name")).toBeInTheDocument();
        });
    });

    describe("sync_options fields", () => {
        it("shows owner field for GitHub provider (default)", () => {
            render(<SyncConfigForm credentials={mockCredentials} />);

            expect(screen.getByLabelText("Owner / Organization")).toBeInTheDocument();
            expect(screen.queryByLabelText("GitLab URL")).not.toBeInTheDocument();
        });

        it("shows owner and gitlab_url fields for GitLab provider", async () => {
            render(<SyncConfigForm credentials={mockCredentials} />);

            await userEvent.selectOptions(screen.getByLabelText("Provider"), "gitlab");

            expect(screen.getByLabelText("Owner / Organization")).toBeInTheDocument();
            expect(screen.getByLabelText("GitLab URL")).toBeInTheDocument();
        });

        it("hides owner field for Jira provider", async () => {
            render(<SyncConfigForm credentials={mockCredentials} />);

            await userEvent.selectOptions(screen.getByLabelText("Provider"), "jira");

            expect(screen.queryByLabelText("Owner / Organization")).not.toBeInTheDocument();
            expect(screen.queryByLabelText("GitLab URL")).not.toBeInTheDocument();
        });

        it("hides owner field for Linear provider", async () => {
            render(<SyncConfigForm credentials={mockCredentials} />);

            await userEvent.selectOptions(screen.getByLabelText("Provider"), "linear");

            expect(screen.queryByLabelText("Owner / Organization")).not.toBeInTheDocument();
            expect(screen.queryByLabelText("GitLab URL")).not.toBeInTheDocument();
        });

        it("sends owner in sync_options on create (no repos selected)", async () => {
            mockCreateSyncConfig.mockResolvedValue(undefined);
            renderWithToaster(<SyncConfigForm credentials={mockCredentials} />);

            await userEvent.type(screen.getByLabelText("Configuration Name"), "My Sync");
            await userEvent.selectOptions(screen.getByLabelText("Credential"), "cred-1");
            await userEvent.type(screen.getByLabelText("Owner / Organization"), "myorg");
            await userEvent.click(screen.getByRole("button", { name: "Create Configuration" }));

            await waitFor(() => {
                expect(mockCreateSyncConfig).toHaveBeenCalledWith({
                    name: "My Sync",
                    provider: "github",
                    credential_id: "cred-1",
                    sync_targets: [],
                    schedule_cron: null,
                    timezone: null,
                    initial_sync_depth: 30,
                    sync_options: { owner: "myorg" },
                });
            });
        });

        it("sends gitlab_url in sync_options for GitLab create", async () => {
            mockCreateSyncConfig.mockResolvedValue(undefined);
            renderWithToaster(<SyncConfigForm credentials={mockCredentials} />);

            await userEvent.selectOptions(screen.getByLabelText("Provider"), "gitlab");
            await userEvent.type(screen.getByLabelText("Configuration Name"), "GL Sync");
            await userEvent.selectOptions(screen.getByLabelText("Credential"), "cred-2");
            await userEvent.type(screen.getByLabelText("Owner / Organization"), "glorg");
            await userEvent.type(screen.getByLabelText("GitLab URL"), "https://gitlab.example.com");
            await userEvent.click(screen.getByRole("button", { name: "Create Configuration" }));

            await waitFor(() => {
                expect(mockCreateSyncConfig).toHaveBeenCalledWith({
                    name: "GL Sync",
                    provider: "gitlab",
                    credential_id: "cred-2",
                    sync_targets: [],
                    schedule_cron: null,
                    timezone: null,
                    initial_sync_depth: 30,
                    sync_options: { owner: "glorg", gitlab_url: "https://gitlab.example.com" },
                });
            });
        });

        it("clears owner/gitlab_url when switching provider", async () => {
            render(<SyncConfigForm credentials={mockCredentials} />);

            // Fill owner for GitHub
            await userEvent.type(screen.getByLabelText("Owner / Organization"), "myorg");

            // Switch to Jira (hides fields)
            await userEvent.selectOptions(screen.getByLabelText("Provider"), "jira");
            expect(screen.queryByLabelText("Owner / Organization")).not.toBeInTheDocument();

            // Switch back to GitHub — fields should be cleared
            await userEvent.selectOptions(screen.getByLabelText("Provider"), "github");
            expect(screen.getByLabelText("Owner / Organization")).toHaveValue("");
        });

        it("pre-fills owner from initialData in edit mode", () => {
            const initialData: SyncConfig = {
                id: "cfg-1",
                name: "Existing Config",
                provider: "github",
                credential_id: "cred-1",
                sync_targets: ["git"],
                sync_options: { owner: "existingorg", repo: "existingrepo" },
                is_active: true,
                schedule_cron: null,
                timezone: null,
                last_sync_at: null,
                last_sync_success: null,
                last_sync_error: null,
                created_at: "2024-01-01",
                updated_at: "2024-01-01",
                parent_id: null,
            };

            render(<SyncConfigForm initialData={initialData} credentials={mockCredentials} />);

            expect(screen.getByLabelText("Owner / Organization")).toHaveValue("existingorg");
        });

        it("sends sync_options on update in edit mode", async () => {
            mockUpdateSyncConfig.mockResolvedValue(undefined);
            const initialData: SyncConfig = {
                id: "cfg-1",
                name: "Existing Config",
                provider: "github",
                credential_id: "cred-1",
                sync_targets: ["git"],
                sync_options: { owner: "oldorg", repo: "oldrepo" },
                is_active: true,
                schedule_cron: null,
                timezone: null,
                last_sync_at: null,
                last_sync_success: null,
                last_sync_error: null,
                created_at: "2024-01-01",
                updated_at: "2024-01-01",
                parent_id: null,
            };

            renderWithToaster(
                <SyncConfigForm initialData={initialData} credentials={mockCredentials} />,
            );

            const ownerInput = screen.getByLabelText("Owner / Organization");
            await userEvent.clear(ownerInput);
            await userEvent.type(ownerInput, "neworg");
            await userEvent.click(screen.getByRole("button", { name: "Update Configuration" }));

            await waitFor(() => {
                expect(mockUpdateSyncConfig).toHaveBeenCalledWith("cfg-1", {
                    sync_targets: ["git"],
                    is_active: true,
                    schedule_cron: null,
                    timezone: null,
                    initial_sync_depth: 30,
                    sync_options: { owner: "neworg" },
                });
            });
        });

        it("shows Create Credential button when no credentials for provider", async () => {
            render(<SyncConfigForm credentials={mockCredentials} />);

            await userEvent.selectOptions(screen.getByLabelText("Provider"), "jira");

            expect(screen.getByRole("button", { name: "Create One Now" })).toBeInTheDocument();
        });

        it("schedule picker hidden behind UpgradeGate for non-enterprise", () => {
            mockUseAdminTier.mockReturnValue({
                tier: "community",
                features: {},
                limits: {},
                minSyncIntervalHours: 24,
            });
            render(<SyncConfigForm credentials={mockCredentials} />);

            expect(screen.getByText("Enterprise Plan Feature")).toBeInTheDocument();
            expect(
                screen.queryByRole("radio", { name: "Manual only (no schedule)" }),
            ).not.toBeInTheDocument();
        });

        it("shows schedule picker for enterprise tier", () => {
            mockUseAdminTier.mockReturnValue({
                tier: "enterprise",
                features: { custom_scheduling: true },
                limits: {},
                minSyncIntervalHours: 0.25,
            });
            render(<SyncConfigForm credentials={mockCredentials} />);

            expect(screen.getByText("Manual only (no schedule)")).toBeInTheDocument();
        });
    });
});
