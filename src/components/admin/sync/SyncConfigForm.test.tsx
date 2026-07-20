import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    fireEvent,
    render,
    renderWithToaster,
    screen,
    userEvent,
    waitFor,
    within,
} from "@/test/utils";
import type { IntegrationCredential, SyncConfig } from "@/lib/admin/types";

const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
    default: { useRouter: () => ({ push: mockPush, refresh: mockRefresh }) },
}));

const mockCreateSyncConfig = vi.fn();
const mockUpdateSyncConfig = vi.fn();
const mockUpdateSyncConfigRepositories = vi.fn();
const mockBatchCreateSyncConfigs = vi.fn();
const mockListReposForCredential = vi.fn();
const mockTestConnection = vi.fn();
const mockCreateCredential = vi.fn();
const mockGetPagerDutyServices = vi.fn();
vi.mock("@/lib/admin/server", () => ({
    createSyncConfig: (...args: unknown[]) => mockCreateSyncConfig(...args),
    updateSyncConfig: (...args: unknown[]) => mockUpdateSyncConfig(...args),
    updateSyncConfigRepositories: (...args: unknown[]) => mockUpdateSyncConfigRepositories(...args),
    batchCreateSyncConfigs: (...args: unknown[]) => mockBatchCreateSyncConfigs(...args),
    listReposForCredential: (...args: unknown[]) => mockListReposForCredential(...args),
    testConnection: (...args: unknown[]) => mockTestConnection(...args),
    createCredential: (...args: unknown[]) => mockCreateCredential(...args),
    getPagerDutyServices: (...args: unknown[]) => mockGetPagerDutyServices(...args),
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
    {
        id: "cred-ld",
        provider: "launchdarkly",
        name: "My LaunchDarkly Token",
        is_active: true,
        config: {},
        last_test_at: null,
        last_test_success: null,
        last_test_error: null,
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
    },
];

const sampleRepo = {
    name: "repo-a",
    full_name: "myorg/repo-a",
    description: null,
    is_private: false,
    is_archived: false,
    default_branch: "main",
    language: null,
    stargazers_count: null,
    forks_count: null,
    updated_at: null,
};

/** Step-navigation helpers — the create-mode wizard hides later steps until
 * earlier ones are satisfied, so tests advance explicitly instead of
 * asserting every field is present at once (CHAOS-2838). */
async function clickContinue() {
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
}
async function clickBack() {
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
}

describe("SyncConfigForm", () => {
    beforeEach(() => {
        mockGetPagerDutyServices.mockResolvedValue({
            data: {
                credential_name: "PagerDuty token",
                services: [
                    {
                        external_id: "service-api",
                        display_name: "API service",
                        name_resolved: true,
                        status: "active",
                    },
                    {
                        external_id: "service-worker",
                        display_name: "Worker service",
                        name_resolved: true,
                        status: "active",
                    },
                ],
            },
        });
    });

    afterEach(() => {
        mockPush.mockReset();
        mockRefresh.mockReset();
        mockCreateSyncConfig.mockReset();
        mockUpdateSyncConfig.mockReset();
        mockUpdateSyncConfigRepositories.mockReset();
        mockBatchCreateSyncConfigs.mockReset();
        mockListReposForCredential.mockReset();
        mockListReposForCredential.mockResolvedValue({
            data: { provider: "github", owner: "", repos: [], total: 0 },
        });
        mockTestConnection.mockReset();
        mockCreateCredential.mockReset();
        mockGetPagerDutyServices.mockReset();
        mockUseAdminTier.mockReset();
        mockUseAdminTier.mockReturnValue({
            tier: "community",
            features: {},
            limits: {},
            minSyncIntervalHours: 24,
        });
    });

    describe("create mode — guided wizard (CHAOS-2838)", () => {
        it("starts at the provider step and blocks Continue until a configuration name is entered", async () => {
            render(<SyncConfigForm credentials={mockCredentials} />);

            expect(screen.getByLabelText("Configuration Name")).toBeInTheDocument();
            expect(screen.getByLabelText("Provider")).toBeInTheDocument();
            expect(screen.queryByLabelText("Credential")).not.toBeInTheDocument();
            expect(screen.getByRole("link", { name: "Cancel" })).toBeInTheDocument();

            const continueButton = screen.getByRole("button", { name: "Continue" });
            expect(continueButton).toBeDisabled();
            expect(screen.getByText(/Enter a configuration name to continue/)).toBeInTheDocument();

            await userEvent.type(screen.getByLabelText("Configuration Name"), "Nightly Sync");
            expect(continueButton).toBeEnabled();

            await clickContinue();
            expect(screen.getByLabelText("Credential")).toBeInTheDocument();
        });

        it("switching provider on the provider step carries through to the credential step's filtered list", async () => {
            render(<SyncConfigForm credentials={mockCredentials} />);

            await userEvent.type(screen.getByLabelText("Configuration Name"), "GL Sync");
            await userEvent.selectOptions(screen.getByLabelText("Provider"), "gitlab");
            await clickContinue();

            expect(screen.getByRole("option", { name: "My GitLab Token" })).toBeInTheDocument();
            expect(
                screen.queryByRole("option", { name: "My GitHub Token" }),
            ).not.toBeInTheDocument();
        });

        it("credential step blocks Continue until a credential is chosen, and offers Create Credential when none exist for the provider", async () => {
            render(<SyncConfigForm credentials={mockCredentials} />);

            await userEvent.type(screen.getByLabelText("Configuration Name"), "Jira Sync");
            await userEvent.selectOptions(screen.getByLabelText("Provider"), "jira");
            await clickContinue();

            expect(screen.getByRole("button", { name: "Create One Now" })).toBeInTheDocument();
            const continueButton = screen.getByRole("button", { name: "Continue" });
            expect(continueButton).toBeDisabled();
            expect(
                screen.getByText(/Select a credential to continue — repository and dataset/),
            ).toBeInTheDocument();
        });

        it("scope step shows a prominent callout instead of the repo picker until an owner is entered", async () => {
            render(<SyncConfigForm credentials={mockCredentials} />);

            await userEvent.type(screen.getByLabelText("Configuration Name"), "Repo Sync");
            await clickContinue();
            await userEvent.selectOptions(screen.getByLabelText("Credential"), "cred-1");
            await clickContinue();

            expect(screen.getByText("Repository selection unavailable")).toBeInTheDocument();
            expect(
                screen.getByText(
                    "Enter an owner or organization above to browse and select repositories.",
                ),
            ).toBeInTheDocument();
            expect(screen.queryByText("Select Repositories")).not.toBeInTheDocument();

            await userEvent.type(screen.getByLabelText("Owner / Organization"), "myorg");

            expect(screen.getByText("Select Repositories")).toBeInTheDocument();
            expect(screen.queryByText("Repository selection unavailable")).not.toBeInTheDocument();
        });

        it("datasets step: toggling a sync target checkbox works", async () => {
            render(<SyncConfigForm credentials={mockCredentials} />);

            await userEvent.type(screen.getByLabelText("Configuration Name"), "Toggle Test");
            await clickContinue();
            await userEvent.selectOptions(screen.getByLabelText("Credential"), "cred-1");
            await clickContinue();
            await clickContinue(); // scope, skip owner

            expect(screen.getByLabelText("Git Data (Commits, Branches)")).toBeInTheDocument();
            expect(screen.getByLabelText("Pull Requests")).toBeInTheDocument();
            const gitDataCheckbox = screen.getByLabelText("Git Data (Commits, Branches)");
            expect(gitDataCheckbox).not.toBeChecked();
            await userEvent.click(gitDataCheckbox);
            expect(gitDataCheckbox).toBeChecked();
            await userEvent.click(gitDataCheckbox);
            expect(gitDataCheckbox).not.toBeChecked();
        });

        it("datasets step shows user-facing consequence copy for each dataset", async () => {
            render(<SyncConfigForm credentials={mockCredentials} />);

            await userEvent.type(screen.getByLabelText("Configuration Name"), "Copy Test");
            await clickContinue();
            await userEvent.selectOptions(screen.getByLabelText("Credential"), "cred-1");
            await clickContinue();
            await clickContinue(); // scope, skip owner

            expect(
                screen.getByText(/Pulls commit history, branches, and authorship/),
            ).toBeInTheDocument();
            expect(
                screen.getByText(/Pulls pull\/merge request activity, reviews, and cycle time/),
            ).toBeInTheDocument();
        });

        it("skips the repository scope step and hides auto-import for a non-repo-scoped provider without team attribution", async () => {
            render(<SyncConfigForm credentials={mockCredentials} />);

            await userEvent.type(screen.getByLabelText("Configuration Name"), "LD Sync");
            await userEvent.selectOptions(screen.getByLabelText("Provider"), "launchdarkly");
            await clickContinue();
            await userEvent.selectOptions(screen.getByLabelText("Credential"), "cred-ld");
            await clickContinue(); // scope step skipped entirely -> lands on datasets

            expect(screen.getByLabelText("Feature Flags")).toBeInTheDocument();
            expect(screen.queryByLabelText("Git Data (Commits, Branches)")).not.toBeInTheDocument();
            expect(screen.queryByText("Repository & source scope")).not.toBeInTheDocument();
            expect(screen.queryByText("Advanced options")).not.toBeInTheDocument();
            expect(
                screen.queryByLabelText("Auto-import teams, projects & members"),
            ).not.toBeInTheDocument();
        });

        it("depth/schedule step shows tier-gated options with upgrade copy below team tier", async () => {
            render(<SyncConfigForm credentials={mockCredentials} />);

            await userEvent.type(screen.getByLabelText("Configuration Name"), "Tier Sync");
            await clickContinue();
            await userEvent.selectOptions(screen.getByLabelText("Credential"), "cred-1");
            await clickContinue();
            await clickContinue(); // scope
            await clickContinue(); // datasets

            const ninetyDayButton = screen.getByText("90 days").closest("button");
            expect(ninetyDayButton).toBeDisabled();
            expect(screen.getAllByText("Team").length).toBeGreaterThan(0);
            expect(screen.getByRole("link", { name: "Upgrade plan" })).toBeInTheDocument();
            expect(screen.getByText(/Team plan feature/i)).toBeInTheDocument();
            expect(
                screen.queryByRole("radio", { name: "Manual only (no schedule)" }),
            ).not.toBeInTheDocument();
        });

        it("Team tier unlocks Team-gated depth options but keeps Enterprise-only ranges locked with upgrade copy", async () => {
            mockUseAdminTier.mockReturnValue({
                tier: "team",
                features: { scheduled_jobs: true, initial_sync_depth: true },
                limits: {},
                minSyncIntervalHours: 0.25,
            });
            render(<SyncConfigForm credentials={mockCredentials} />);

            await userEvent.type(screen.getByLabelText("Configuration Name"), "Team Tier Sync");
            await clickContinue();
            await userEvent.selectOptions(screen.getByLabelText("Credential"), "cred-1");
            await clickContinue();
            await clickContinue(); // scope
            await clickContinue(); // datasets

            // Team-gated ranges are unlocked for a Team-tier account.
            expect(screen.getByText("90 days").closest("button")).toBeEnabled();
            expect(screen.getByText("6 months").closest("button")).toBeEnabled();

            // Enterprise-only ranges must stay locked — this is the tier-
            // ordering regression: the prior gating check only looked at the
            // single `initial_sync_depth` feature boolean (true for both Team
            // and Enterprise), so a Team account could unlock Enterprise
            // ranges too. Rank-based gating fixes this.
            const oneYearButton = screen.getByText("1 year").closest("button");
            const allTimeButton = screen.getByText("All time").closest("button");
            expect(oneYearButton).toBeDisabled();
            expect(allTimeButton).toBeDisabled();
            expect(screen.getAllByText("Enterprise").length).toBe(2);
            expect(screen.getByRole("link", { name: "Upgrade plan" })).toBeInTheDocument();
        });

        it("Enterprise tier unlocks every initial-depth option", async () => {
            mockUseAdminTier.mockReturnValue({
                tier: "enterprise",
                features: {
                    scheduled_jobs: true,
                    initial_sync_depth: true,
                    unlimited_sync_depth: true,
                },
                limits: {},
                minSyncIntervalHours: 0,
            });
            render(<SyncConfigForm credentials={mockCredentials} />);

            await userEvent.type(
                screen.getByLabelText("Configuration Name"),
                "Enterprise Tier Sync",
            );
            await clickContinue();
            await userEvent.selectOptions(screen.getByLabelText("Credential"), "cred-1");
            await clickContinue();
            await clickContinue(); // scope
            await clickContinue(); // datasets

            for (const label of ["30 days", "90 days", "6 months", "1 year", "All time"]) {
                expect(screen.getByText(label).closest("button")).toBeEnabled();
            }
            expect(screen.queryByText("Upgrade plan")).not.toBeInTheDocument();
        });

        it("depth/schedule step shows user-facing consequence copy for schedule cadences", async () => {
            mockUseAdminTier.mockReturnValue({
                tier: "team",
                features: { scheduled_jobs: true },
                limits: {},
                minSyncIntervalHours: 0.25,
            });
            render(<SyncConfigForm credentials={mockCredentials} />);

            await userEvent.type(screen.getByLabelText("Configuration Name"), "Schedule Copy");
            await clickContinue();
            await userEvent.selectOptions(screen.getByLabelText("Credential"), "cred-1");
            await clickContinue();
            await clickContinue(); // scope
            await clickContinue(); // datasets

            expect(
                screen.getByText("Data only updates when you manually trigger a sync."),
            ).toBeInTheDocument();
            expect(
                screen.getByText(/Near real-time data, but the most frequent API usage/),
            ).toBeInTheDocument();
        });

        it("clears owner/gitlab_url in form state when the provider changes, even after leaving the scope step", async () => {
            render(<SyncConfigForm credentials={mockCredentials} />);

            await userEvent.type(screen.getByLabelText("Configuration Name"), "Repo Sync");
            await clickContinue();
            await userEvent.selectOptions(screen.getByLabelText("Credential"), "cred-1");
            await clickContinue();
            await userEvent.type(screen.getByLabelText("Owner / Organization"), "myorg");

            // The underlying provider-change reset (handleChange's "provider"
            // branch) clears owner/repos/gitlab_url/credential_id regardless
            // of which step happens to be visible at the time.
            await clickBack(); // -> credential
            await clickBack(); // -> provider
            await userEvent.selectOptions(screen.getByLabelText("Provider"), "jira");
            await userEvent.selectOptions(screen.getByLabelText("Provider"), "github");

            await clickContinue(); // credential (credential_id was reset)
            await userEvent.selectOptions(screen.getByLabelText("Credential"), "cred-1");
            await clickContinue(); // scope

            expect(screen.getByLabelText("Owner / Organization")).toHaveValue("");
        });

        it("walks the full guided flow from provider through review to a successful create", async () => {
            mockCreateSyncConfig.mockResolvedValue(undefined);
            renderWithToaster(<SyncConfigForm credentials={mockCredentials} />);

            await userEvent.type(screen.getByLabelText("Configuration Name"), "Nightly Sync");
            await clickContinue();

            await userEvent.selectOptions(screen.getByLabelText("Credential"), "cred-1");
            await clickContinue();

            await clickContinue(); // scope — leave owner/repos unset

            await userEvent.click(screen.getByLabelText("Git Data (Commits, Branches)"));
            await clickContinue();

            await clickContinue(); // depth/schedule — leave defaults

            expect(screen.getByText("Nightly Sync")).toBeInTheDocument();
            expect(screen.getByText("GitHub")).toBeInTheDocument();
            expect(screen.getByText("My GitHub Token")).toBeInTheDocument();
            expect(screen.getByText("Git Data (Commits, Branches)")).toBeInTheDocument();

            await userEvent.click(screen.getByRole("button", { name: "Create Configuration" }));

            await waitFor(() => {
                expect(mockCreateSyncConfig).toHaveBeenCalledWith({
                    name: "Nightly Sync",
                    provider: "github",
                    credential_id: "cred-1",
                    sync_targets: ["git"],
                    schedule_cron: null,
                    timezone: null,
                    initial_sync_depth: 30,
                    sync_options: { auto_import_teams: false },
                });
                expect(screen.getByText("Config created")).toBeInTheDocument();
                expect(mockPush).toHaveBeenCalledWith("/org/admin/sync");
            });
        });

        it("implicit form submission (e.g. pressing Enter) outside the review step never creates the config", async () => {
            mockCreateSyncConfig.mockResolvedValue(undefined);
            const { container } = renderWithToaster(
                <SyncConfigForm credentials={mockCredentials} />,
            );

            await userEvent.type(screen.getByLabelText("Configuration Name"), "Implicit Submit");
            // Simulate the browser's implicit form submission that pressing
            // Enter in a text field triggers — without clicking the explicit
            // Continue button. The gated step-1 name requirement was already
            // satisfied, so this is treated like Continue (advance one step)
            // rather than being silently swallowed — the point is it must
            // NEVER reach the create action from here.
            const form = container.querySelector("form");
            expect(form).not.toBeNull();
            fireEvent.submit(form as HTMLFormElement);

            expect(mockCreateSyncConfig).not.toHaveBeenCalled();
            expect(screen.getByLabelText("Credential")).toBeInTheDocument();
        });

        it("implicit form submission with an unmet gate neither advances nor creates the config", async () => {
            mockCreateSyncConfig.mockResolvedValue(undefined);
            const { container } = renderWithToaster(
                <SyncConfigForm credentials={mockCredentials} />,
            );

            // No name entered yet — the provider step's Continue gate is
            // unmet, so an implicit submit must be a no-op, not a bypass.
            const form = container.querySelector("form");
            fireEvent.submit(form as HTMLFormElement);

            expect(mockCreateSyncConfig).not.toHaveBeenCalled();
            expect(screen.getByLabelText("Configuration Name")).toBeInTheDocument();
        });

        it("implicit form submission on the owner field mid-flow does not bypass the review step", async () => {
            mockCreateSyncConfig.mockResolvedValue(undefined);
            const { container } = renderWithToaster(
                <SyncConfigForm credentials={mockCredentials} />,
            );

            await userEvent.type(screen.getByLabelText("Configuration Name"), "Owner Enter Sync");
            await clickContinue();
            await userEvent.selectOptions(screen.getByLabelText("Credential"), "cred-1");
            await clickContinue();
            await userEvent.type(screen.getByLabelText("Owner / Organization"), "myorg");

            const form = container.querySelector("form");
            fireEvent.submit(form as HTMLFormElement);

            expect(mockCreateSyncConfig).not.toHaveBeenCalled();
            // Advanced one step (scope has no gate), never straight to create.
            expect(screen.getByLabelText("Git Data (Commits, Branches)")).toBeInTheDocument();
        });

        it("failed create on the review step shows an error toast and stays on the review step", async () => {
            mockCreateSyncConfig.mockResolvedValue({ error: "Duplicate name" });
            renderWithToaster(<SyncConfigForm credentials={mockCredentials} />);

            await userEvent.type(screen.getByLabelText("Configuration Name"), "Duplicate");
            await clickContinue();
            await userEvent.selectOptions(screen.getByLabelText("Credential"), "cred-1");
            await clickContinue();
            await clickContinue(); // scope
            await clickContinue(); // datasets
            await clickContinue(); // depth
            await userEvent.click(screen.getByRole("button", { name: "Create Configuration" }));

            await waitFor(() => {
                expect(mockCreateSyncConfig).toHaveBeenCalled();
                expect(screen.getByText("Duplicate name")).toBeInTheDocument();
            });
            expect(
                screen.getByRole("button", { name: "Create Configuration" }),
            ).toBeInTheDocument();
        });

        it("sends owner in sync_options on create (no repos selected)", async () => {
            mockCreateSyncConfig.mockResolvedValue(undefined);
            renderWithToaster(<SyncConfigForm credentials={mockCredentials} />);

            await userEvent.type(screen.getByLabelText("Configuration Name"), "My Sync");
            await clickContinue();
            await userEvent.selectOptions(screen.getByLabelText("Credential"), "cred-1");
            await clickContinue();
            await userEvent.type(screen.getByLabelText("Owner / Organization"), "myorg");
            await clickContinue();
            await clickContinue(); // datasets
            await clickContinue(); // depth
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
                    sync_options: { owner: "myorg", auto_import_teams: false },
                });
            });
        });

        it("sends gitlab_url in sync_options for GitLab create", async () => {
            mockCreateSyncConfig.mockResolvedValue(undefined);
            renderWithToaster(<SyncConfigForm credentials={mockCredentials} />);

            await userEvent.selectOptions(screen.getByLabelText("Provider"), "gitlab");
            await userEvent.type(screen.getByLabelText("Configuration Name"), "GL Sync");
            await clickContinue();
            await userEvent.selectOptions(screen.getByLabelText("Credential"), "cred-2");
            await clickContinue();
            await userEvent.type(screen.getByLabelText("Owner / Organization"), "glorg");
            await userEvent.type(screen.getByLabelText("GitLab URL"), "https://gitlab.example.com");
            await clickContinue();
            await clickContinue(); // datasets
            await clickContinue(); // depth
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
                    sync_options: {
                        owner: "glorg",
                        gitlab_url: "https://gitlab.example.com",
                        auto_import_teams: false,
                    },
                });
            });
        });

        it("sync-all toggle with owner sends all_repos + owner and not batch", async () => {
            mockCreateSyncConfig.mockResolvedValue(undefined);
            renderWithToaster(<SyncConfigForm credentials={mockCredentials} />);

            await userEvent.type(screen.getByLabelText("Configuration Name"), "Org Sync");
            await clickContinue();
            await userEvent.selectOptions(screen.getByLabelText("Credential"), "cred-1");
            await clickContinue();
            await userEvent.type(screen.getByLabelText("Owner / Organization"), "myorg");
            await userEvent.click(
                screen.getByLabelText("Sync all repositories this token can access"),
            );
            await clickContinue();
            await clickContinue(); // datasets
            await clickContinue(); // depth
            await userEvent.click(screen.getByRole("button", { name: "Create Configuration" }));

            await waitFor(() => {
                expect(mockCreateSyncConfig).toHaveBeenCalledWith({
                    name: "Org Sync",
                    provider: "github",
                    credential_id: "cred-1",
                    sync_targets: [],
                    schedule_cron: null,
                    timezone: null,
                    initial_sync_depth: 30,
                    sync_options: { all_repos: true, owner: "myorg", auto_import_teams: false },
                });
            });
            expect(mockBatchCreateSyncConfigs).not.toHaveBeenCalled();
        });

        it("sync-all toggle with blank owner sends all_repos only (no search)", async () => {
            mockCreateSyncConfig.mockResolvedValue(undefined);
            renderWithToaster(<SyncConfigForm credentials={mockCredentials} />);

            await userEvent.type(screen.getByLabelText("Configuration Name"), "Token Sync");
            await clickContinue();
            await userEvent.selectOptions(screen.getByLabelText("Credential"), "cred-1");
            await clickContinue();
            await userEvent.click(
                screen.getByLabelText("Sync all repositories this token can access"),
            );
            await clickContinue();
            await clickContinue(); // datasets
            await clickContinue(); // depth
            await userEvent.click(screen.getByRole("button", { name: "Create Configuration" }));

            await waitFor(() => {
                expect(mockCreateSyncConfig).toHaveBeenCalledWith({
                    name: "Token Sync",
                    provider: "github",
                    credential_id: "cred-1",
                    sync_targets: [],
                    schedule_cron: null,
                    timezone: null,
                    initial_sync_depth: 30,
                    sync_options: { all_repos: true, auto_import_teams: false },
                });
            });
            expect(mockBatchCreateSyncConfigs).not.toHaveBeenCalled();
        });

        it("hides the repository picker when the org-wide toggle is on", async () => {
            render(<SyncConfigForm credentials={mockCredentials} />);

            await userEvent.type(screen.getByLabelText("Configuration Name"), "Toggle Sync");
            await clickContinue();
            await userEvent.selectOptions(screen.getByLabelText("Credential"), "cred-1");
            await clickContinue();
            await userEvent.type(screen.getByLabelText("Owner / Organization"), "myorg");
            expect(screen.getByText("Select Repositories")).toBeInTheDocument();

            await userEvent.click(
                screen.getByLabelText("Sync all repositories this token can access"),
            );
            expect(screen.queryByText("Select Repositories")).not.toBeInTheDocument();
        });

        it("selecting concrete repos still uses batchCreateSyncConfigs", async () => {
            mockBatchCreateSyncConfigs.mockResolvedValue({ data: { count: 1 } });
            mockListReposForCredential.mockResolvedValue({
                data: { provider: "github", owner: "myorg", repos: [sampleRepo], total: 1 },
            });
            renderWithToaster(<SyncConfigForm credentials={mockCredentials} />);

            await userEvent.type(screen.getByLabelText("Configuration Name"), "Repo Sync");
            await clickContinue();
            await userEvent.selectOptions(screen.getByLabelText("Credential"), "cred-1");
            await clickContinue();
            await userEvent.type(screen.getByLabelText("Owner / Organization"), "myorg");
            const repoCheckbox = await screen.findByLabelText("repo-a");
            await userEvent.click(repoCheckbox);
            await clickContinue();
            await clickContinue(); // datasets
            await clickContinue(); // depth
            await userEvent.click(screen.getByRole("button", { name: "Create Configuration" }));

            await waitFor(() => {
                expect(mockBatchCreateSyncConfigs).toHaveBeenCalledWith({
                    name: "Repo Sync",
                    provider: "github",
                    credential_id: "cred-1",
                    sync_targets: [],
                    schedule_cron: null,
                    timezone: null,
                    initial_sync_depth: 30,
                    sync_options: { owner: "myorg", auto_import_teams: false },
                    repos: ["myorg/repo-a"],
                });
            });
            expect(mockCreateSyncConfig).not.toHaveBeenCalled();
        });

        it("clears selected repos when owner changes on the scope step", async () => {
            mockCreateSyncConfig.mockResolvedValue(undefined);
            mockListReposForCredential.mockResolvedValue({
                data: { provider: "github", owner: "myorg", repos: [sampleRepo], total: 1 },
            });
            renderWithToaster(<SyncConfigForm credentials={mockCredentials} />);

            await userEvent.type(screen.getByLabelText("Configuration Name"), "Repo Sync");
            await clickContinue();
            await userEvent.selectOptions(screen.getByLabelText("Credential"), "cred-1");
            await clickContinue();
            await userEvent.type(screen.getByLabelText("Owner / Organization"), "myorg");
            const repoCheckbox = await screen.findByLabelText("repo-a");
            await userEvent.click(repoCheckbox);

            const ownerInput = screen.getByLabelText("Owner / Organization");
            await userEvent.clear(ownerInput);
            await userEvent.type(ownerInput, "otherorg");
            await clickContinue();
            await clickContinue(); // datasets
            await clickContinue(); // depth
            await userEvent.click(screen.getByRole("button", { name: "Create Configuration" }));

            await waitFor(() => {
                expect(mockCreateSyncConfig).toHaveBeenCalledWith({
                    name: "Repo Sync",
                    provider: "github",
                    credential_id: "cred-1",
                    sync_targets: [],
                    schedule_cron: null,
                    timezone: null,
                    initial_sync_depth: 30,
                    sync_options: { owner: "otherorg", auto_import_teams: false },
                });
            });
            expect(mockBatchCreateSyncConfigs).not.toHaveBeenCalled();
        });

        it("includes auto_import_teams=true in sync_options when toggled on", async () => {
            mockCreateSyncConfig.mockResolvedValue(undefined);
            renderWithToaster(<SyncConfigForm credentials={mockCredentials} />);

            await userEvent.type(screen.getByLabelText("Configuration Name"), "Team Sync");
            await clickContinue();
            await userEvent.selectOptions(screen.getByLabelText("Credential"), "cred-1");
            await clickContinue();
            await clickContinue(); // scope, skip owner
            await userEvent.click(screen.getByLabelText("Auto-import teams, projects & members"));
            await clickContinue(); // depth
            await clickContinue(); // review
            await userEvent.click(screen.getByRole("button", { name: "Create Configuration" }));

            await waitFor(() => {
                expect(mockCreateSyncConfig).toHaveBeenCalledWith({
                    name: "Team Sync",
                    provider: "github",
                    credential_id: "cred-1",
                    sync_targets: [],
                    schedule_cron: null,
                    timezone: null,
                    initial_sync_depth: 30,
                    sync_options: { auto_import_teams: true },
                });
            });
        });

        it("review step summarizes every staged choice before create", async () => {
            mockUseAdminTier.mockReturnValue({
                tier: "team",
                features: { scheduled_jobs: true, initial_sync_depth: true },
                limits: {},
                minSyncIntervalHours: 0.25,
            });
            render(<SyncConfigForm credentials={mockCredentials} />);

            await userEvent.type(screen.getByLabelText("Configuration Name"), "Full Review Sync");
            await clickContinue();
            await userEvent.selectOptions(screen.getByLabelText("Credential"), "cred-1");
            await clickContinue();
            await userEvent.type(screen.getByLabelText("Owner / Organization"), "myorg");
            await userEvent.click(
                screen.getByLabelText("Sync all repositories this token can access"),
            );
            await clickContinue();
            await userEvent.click(screen.getByLabelText("Pull Requests"));
            await userEvent.click(screen.getByLabelText("Auto-import teams, projects & members"));
            await clickContinue();
            await userEvent.click(screen.getByRole("button", { name: "90 days" }));
            await clickContinue();

            expect(screen.getByText("Full Review Sync")).toBeInTheDocument();
            expect(screen.getByText("GitHub")).toBeInTheDocument();
            expect(screen.getByText("My GitHub Token")).toBeInTheDocument();
            expect(
                screen.getByText(/All repositories this credential can access in myorg/),
            ).toBeInTheDocument();
            expect(screen.getByText("Pull Requests")).toBeInTheDocument();
            expect(screen.getByText("Enabled")).toBeInTheDocument();
            expect(screen.getByText("90 days")).toBeInTheDocument();
        });

        it("places PagerDuty service mappings in the operational wizard step and reviews them", async () => {
            // Given: a PagerDuty credential available to a new sync configuration.
            const pagerDutyCredential: IntegrationCredential = {
                id: "cred-pagerduty",
                provider: "pagerduty",
                name: "PagerDuty token",
                is_active: true,
                config: {},
                last_test_at: null,
                last_test_success: null,
                last_test_error: null,
                created_at: "2024-01-01",
                updated_at: "2024-01-01",
            };
            render(<SyncConfigForm credentials={[...mockCredentials, pagerDutyCredential]} />);

            // When: the services dataset is selected and its mapping is completed in the wizard.
            await userEvent.type(screen.getByLabelText("Configuration Name"), "PagerDuty Services");
            await userEvent.selectOptions(screen.getByLabelText("Provider"), "pagerduty");
            await clickContinue();
            await userEvent.selectOptions(screen.getByLabelText("Credential"), "cred-pagerduty");
            await clickContinue();
            await userEvent.click(screen.getByLabelText("PagerDuty operational data"));
            expect(screen.getByText("Service repository mappings")).toBeInTheDocument();
            const addMapping = screen.getByRole("button", { name: "Add service mapping" });
            await waitFor(() => expect(addMapping).toBeEnabled());
            await userEvent.click(addMapping);
            await userEvent.selectOptions(
                screen.getByLabelText("PagerDuty service"),
                "service-api",
            );
            await userEvent.type(
                screen.getByLabelText("Repository full name 1.1"),
                "full-chaos/api",
            );
            expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
            await clickContinue();
            await clickContinue();

            // Then: review precedes submit and summarizes the staged repository target safely.
            expect(screen.getByText("Service repository mappings")).toBeInTheDocument();
            expect(screen.getByText("API service: github:full-chaos/api")).toBeInTheDocument();
            expect(screen.queryByText("service-api")).not.toBeInTheDocument();
        });

        it("keeps duplicate PagerDuty mapping validation in the dataset step", async () => {
            // Given: a PagerDuty services configuration with duplicate service IDs.
            const pagerDutyCredential: IntegrationCredential = {
                id: "cred-pagerduty",
                provider: "pagerduty",
                name: "PagerDuty token",
                is_active: true,
                config: {},
                last_test_at: null,
                last_test_success: null,
                last_test_error: null,
                created_at: "2024-01-01",
                updated_at: "2024-01-01",
            };
            renderWithToaster(
                <SyncConfigForm credentials={[...mockCredentials, pagerDutyCredential]} />,
            );
            await userEvent.type(
                screen.getByLabelText("Configuration Name"),
                "PagerDuty duplicate",
            );
            await userEvent.selectOptions(screen.getByLabelText("Provider"), "pagerduty");
            await clickContinue();
            await userEvent.selectOptions(screen.getByLabelText("Credential"), "cred-pagerduty");
            await clickContinue();
            await userEvent.click(screen.getByLabelText("PagerDuty operational data"));
            const addMapping = screen.getByRole("button", { name: "Add service mapping" });
            await waitFor(() => expect(addMapping).toBeEnabled());
            await userEvent.click(addMapping);
            await userEvent.selectOptions(
                screen.getByLabelText("PagerDuty service"),
                "service-api",
            );
            await userEvent.type(
                screen.getByLabelText("Repository full name 1.1"),
                "full-chaos/api",
            );
            await userEvent.click(addMapping);
            await userEvent.selectOptions(
                screen.getAllByLabelText("PagerDuty service")[1],
                "service-api",
            );
            await userEvent.type(
                screen.getByLabelText("Repository full name 2.1"),
                "full-chaos/api-mirror",
            );

            // When: duplicate validation updates the mapping editor.
            await waitFor(() => {
                expect(screen.getByRole("alert")).toHaveTextContent(
                    "Each PagerDuty service can be mapped only once.",
                );
            });

            // Then: the invalid editor remains visible, and the flow cannot progress or submit.
            const mappingEditor = document.getElementById("pagerduty-service-repository-mappings");
            expect(mappingEditor).toBeInTheDocument();
            expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
            expect(
                screen.queryByRole("button", { name: "Create Configuration" }),
            ).not.toBeInTheDocument();
            expect(mockCreateSyncConfig).not.toHaveBeenCalled();
        });
    });

    describe("edit mode", () => {
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

        it("preserves existing sync_options on update in edit mode", async () => {
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
                    sync_options: {
                        owner: "neworg",
                        repo: "oldrepo",
                        auto_import_teams: false,
                    },
                });
            });

            // Save keeps the user on the edit page (revalidated via router.refresh)
            // instead of navigating away, and the diff summary calls out what changed.
            await waitFor(() => {
                expect(mockRefresh).toHaveBeenCalled();
                expect(mockPush).not.toHaveBeenCalled();
                expect(screen.getByText(/Changed:.*Owner: oldorg → neworg/)).toBeInTheDocument();
            });
        });

        it("shows selected repositories in edit mode", async () => {
            mockListReposForCredential.mockResolvedValue({
                data: {
                    provider: "github",
                    owner: "myorg",
                    repos: [sampleRepo],
                    total: 1,
                },
            });
            const initialData: SyncConfig = {
                id: "cfg-repos",
                name: "Existing Config",
                provider: "github",
                credential_id: "cred-1",
                sync_targets: ["git"],
                sync_options: { owner: "myorg" },
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

            render(
                <SyncConfigForm
                    initialData={initialData}
                    initialRepositorySelection={{
                        owner: "myorg",
                        repos: ["myorg/repo-a"],
                        sync_all_repos: false,
                    }}
                    credentials={mockCredentials}
                />,
            );

            expect(screen.getByText("Select Repositories")).toBeInTheDocument();
            const repoCheckbox = await screen.findByLabelText("repo-a");
            expect(repoCheckbox).toBeChecked();
        });

        it("updates repository selection after scalar config update in edit mode", async () => {
            mockUpdateSyncConfig.mockResolvedValue(undefined);
            mockUpdateSyncConfigRepositories.mockResolvedValue(undefined);
            mockListReposForCredential.mockResolvedValue({
                data: {
                    provider: "github",
                    owner: "myorg",
                    repos: [
                        sampleRepo,
                        {
                            name: "repo-b",
                            full_name: "myorg/repo-b",
                            description: null,
                            is_private: false,
                            is_archived: false,
                            default_branch: "main",
                            language: null,
                            stargazers_count: null,
                            forks_count: null,
                            updated_at: null,
                        },
                    ],
                    total: 2,
                },
            });
            const initialData: SyncConfig = {
                id: "cfg-repos-save",
                name: "Existing Config",
                provider: "github",
                credential_id: "cred-1",
                sync_targets: ["git"],
                sync_options: { owner: "myorg" },
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
                <SyncConfigForm
                    initialData={initialData}
                    initialRepositorySelection={{
                        owner: "myorg",
                        repos: ["myorg/repo-a"],
                        sync_all_repos: false,
                    }}
                    credentials={mockCredentials}
                />,
            );

            await userEvent.click(await screen.findByLabelText("repo-b"));
            await userEvent.click(screen.getByRole("button", { name: "Update Configuration" }));

            await waitFor(() => {
                expect(mockUpdateSyncConfigRepositories).toHaveBeenCalledWith("cfg-repos-save", {
                    owner: "myorg",
                    repos: ["myorg/repo-a", "myorg/repo-b"],
                });
                expect(screen.getByText("Config updated")).toBeInTheDocument();
            });
        });

        it("schedule picker hidden behind UpgradeGate below team tier", () => {
            mockUseAdminTier.mockReturnValue({
                tier: "community",
                features: {},
                limits: {},
                minSyncIntervalHours: 24,
            });
            const initialData: SyncConfig = {
                id: "cfg-tier",
                name: "Tier Config",
                provider: "github",
                credential_id: "cred-1",
                sync_targets: ["git"],
                sync_options: {},
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

            expect(screen.getByText(/Team plan feature/i)).toBeInTheDocument();
            expect(
                screen.queryByRole("radio", { name: "Manual only (no schedule)" }),
            ).not.toBeInTheDocument();
        });

        it("round-trips preset schedule_cron + timezone from sync_options in edit mode", () => {
            mockUseAdminTier.mockReturnValue({
                tier: "team",
                features: { scheduled_jobs: true },
                limits: {},
                minSyncIntervalHours: 0.25,
            });
            const initialData: SyncConfig = {
                id: "cfg-sched",
                name: "Scheduled Config",
                provider: "github",
                credential_id: "cred-1",
                sync_targets: ["git"],
                sync_options: {
                    owner: "full-chaos",
                    search: "full-chaos/*",
                    schedule_cron: "0 */6 * * *",
                    timezone: "America/New_York",
                    initial_sync_depth: 90,
                },
                is_active: true,
                schedule_cron: null,
                timezone: null,
                initial_sync_depth: null,
                last_sync_at: null,
                last_sync_success: null,
                last_sync_error: null,
                created_at: "2024-01-01",
                updated_at: "2024-01-01",
                parent_id: null,
            };

            render(<SyncConfigForm initialData={initialData} credentials={mockCredentials} />);

            // Schedule radio reflects the saved cron — NOT 'Manual only' (the bug)
            expect(screen.getByRole("radio", { name: "Every 6 hours" })).toBeChecked();
            expect(
                screen.getByRole("radio", { name: "Manual only (no schedule)" }),
            ).not.toBeChecked();
            // Timezone round-trips from sync_options
            expect(screen.getByLabelText("Timezone")).toHaveValue("America/New_York");
            // Other fields still round-trip
            expect(screen.getByLabelText("Owner / Organization")).toHaveValue("full-chaos");
            expect(screen.getByLabelText("Git Data (Commits, Branches)")).toBeChecked();
        });

        it("strips stale schedule keys from sync_options and clears schedule on update", async () => {
            mockUpdateSyncConfig.mockResolvedValue(undefined);
            mockUseAdminTier.mockReturnValue({
                tier: "team",
                features: { scheduled_jobs: true },
                limits: {},
                minSyncIntervalHours: 0.25,
            });
            const initialData: SyncConfig = {
                id: "cfg-clear",
                name: "Scheduled Config",
                provider: "github",
                credential_id: "cred-1",
                sync_targets: ["git"],
                sync_options: {
                    owner: "full-chaos",
                    search: "full-chaos/*",
                    schedule_cron: "0 0 * * *",
                    timezone: "America/Los_Angeles",
                    initial_sync_depth: 0,
                },
                is_active: true,
                schedule_cron: null,
                timezone: null,
                initial_sync_depth: null,
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

            await userEvent.click(screen.getByRole("radio", { name: "Manual only (no schedule)" }));
            await userEvent.click(screen.getByRole("button", { name: "Update Configuration" }));

            await waitFor(() => {
                expect(mockUpdateSyncConfig).toHaveBeenCalledWith("cfg-clear", {
                    sync_targets: ["git"],
                    is_active: true,
                    schedule_cron: null,
                    timezone: "America/Los_Angeles",
                    initial_sync_depth: 0,
                    // Stale schedule keys must NOT ride along inside sync_options —
                    // they previously resurrected the old schedule on the backend.
                    sync_options: {
                        owner: "full-chaos",
                        search: "full-chaos/*",
                        auto_import_teams: false,
                    },
                });
            });
        });

        it("falls back to custom cron radio for non-preset schedule_cron in sync_options", () => {
            mockUseAdminTier.mockReturnValue({
                tier: "team",
                features: { scheduled_jobs: true },
                limits: {},
                minSyncIntervalHours: 0.25,
            });
            const initialData: SyncConfig = {
                id: "cfg-custom",
                name: "Custom Schedule Config",
                provider: "github",
                credential_id: "cred-1",
                sync_targets: ["git"],
                sync_options: {
                    owner: "full-chaos",
                    schedule_cron: "15 3 * * *",
                    timezone: "UTC",
                },
                is_active: true,
                schedule_cron: null,
                timezone: null,
                initial_sync_depth: null,
                last_sync_at: null,
                last_sync_success: null,
                last_sync_error: null,
                created_at: "2024-01-01",
                updated_at: "2024-01-01",
                parent_id: null,
            };

            render(<SyncConfigForm initialData={initialData} credentials={mockCredentials} />);

            expect(screen.getByRole("radio", { name: "Custom cron expression" })).toBeChecked();
            expect(
                screen.getByRole("radio", { name: "Manual only (no schedule)" }),
            ).not.toBeChecked();
            expect(screen.getByLabelText("Custom cron")).toHaveValue("15 3 * * *");
        });

        it("round-trips auto_import_teams and preserves other sync_options on update", async () => {
            mockUpdateSyncConfig.mockResolvedValue(undefined);
            const initialData: SyncConfig = {
                id: "cfg-ai",
                name: "Existing Config",
                provider: "github",
                credential_id: "cred-1",
                sync_targets: ["git"],
                sync_options: {
                    owner: "myorg",
                    search: "myorg/*",
                    auto_import_teams: true,
                },
                is_active: true,
                schedule_cron: null,
                timezone: null,
                initial_sync_depth: null,
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

            const toggle = screen.getByLabelText("Auto-import teams, projects & members");
            expect(toggle).toBeChecked();
            await userEvent.click(toggle); // turn off
            await userEvent.click(screen.getByRole("button", { name: "Update Configuration" }));

            await waitFor(() => {
                expect(mockUpdateSyncConfig).toHaveBeenCalledWith("cfg-ai", {
                    sync_targets: ["git"],
                    is_active: true,
                    schedule_cron: null,
                    timezone: null,
                    initial_sync_depth: 30,
                    sync_options: {
                        owner: "myorg",
                        search: "myorg/*",
                        auto_import_teams: false,
                    },
                });
            });
        });

        it("renders each IA section as a distinct card on one page (unaffected by the create wizard)", () => {
            const initialData: SyncConfig = {
                id: "cfg-sections",
                name: "Sectioned Config",
                provider: "github",
                credential_id: "cred-1",
                sync_targets: ["git"],
                sync_options: { owner: "myorg" },
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

            expect(screen.getByText("Identity")).toBeInTheDocument();
            expect(screen.getByRole("heading", { name: "Credential" })).toBeInTheDocument();
            expect(screen.getByText("Repository & source scope")).toBeInTheDocument();
            expect(screen.getByText("Datasets & sync targets")).toBeInTheDocument();
            expect(screen.getByText("Initial depth")).toBeInTheDocument();
            expect(screen.getAllByText("Schedule").length).toBeGreaterThan(0);
            expect(screen.getByText("Advanced options")).toBeInTheDocument();
        });

        describe("immutable fields in edit mode", () => {
            const initialData: SyncConfig = {
                id: "cfg-immutable",
                name: "Immutable Config",
                provider: "github",
                credential_id: "cred-1",
                sync_targets: ["git"],
                sync_options: { owner: "myorg" },
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

            it("renders name, provider, and credential as locked read-only fields with an explanation", () => {
                render(<SyncConfigForm initialData={initialData} credentials={mockCredentials} />);

                // Not editable form controls anymore in edit mode.
                expect(screen.queryByLabelText("Configuration Name")).not.toBeInTheDocument();
                expect(screen.queryByLabelText("Provider")).not.toBeInTheDocument();
                expect(screen.queryByLabelText("Credential")).not.toBeInTheDocument();

                // Rendered as an explicit locked value + explanation, not a silently
                // disabled input.
                expect(screen.getByText("Immutable Config")).toBeInTheDocument();
                expect(screen.getByText("GitHub")).toBeInTheDocument();
                expect(screen.getByText("My GitHub Token")).toBeInTheDocument();
                expect(screen.getAllByText("Locked")).toHaveLength(3);
                expect(screen.getAllByTestId("immutable-field-lock-icon")).toHaveLength(3);
                expect(
                    screen.getByText(/name can't be changed after creation/i),
                ).toBeInTheDocument();
                expect(
                    screen.getByText(/provider can't be changed after creation/i),
                ).toBeInTheDocument();
                expect(
                    screen.getByText(/credential can't be changed after creation/i),
                ).toBeInTheDocument();
            });
        });

        describe("destructive change warnings", () => {
            it("warns when removing a dataset from an existing config", async () => {
                const initialData: SyncConfig = {
                    id: "cfg-datasets",
                    name: "Dataset Config",
                    provider: "github",
                    credential_id: "cred-1",
                    sync_targets: ["git", "prs"],
                    sync_options: {},
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

                expect(screen.queryByRole("alert")).not.toBeInTheDocument();

                await userEvent.click(screen.getByLabelText("Pull Requests"));

                expect(screen.getByRole("alert")).toHaveTextContent(
                    /Removing dataset.*Pull Requests/,
                );
            });

            it("warns when reducing repo scope by removing a previously-synced repo", async () => {
                mockListReposForCredential.mockResolvedValue({
                    data: {
                        provider: "github",
                        owner: "myorg",
                        repos: [
                            sampleRepo,
                            {
                                name: "repo-b",
                                full_name: "myorg/repo-b",
                                description: null,
                                is_private: false,
                                is_archived: false,
                                default_branch: "main",
                                language: null,
                                stargazers_count: null,
                                forks_count: null,
                                updated_at: null,
                            },
                        ],
                        total: 2,
                    },
                });
                const initialData: SyncConfig = {
                    id: "cfg-repo-scope",
                    name: "Repo Scope Config",
                    provider: "github",
                    credential_id: "cred-1",
                    sync_targets: ["git"],
                    sync_options: { owner: "myorg" },
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

                render(
                    <SyncConfigForm
                        initialData={initialData}
                        initialRepositorySelection={{
                            owner: "myorg",
                            repos: ["myorg/repo-a", "myorg/repo-b"],
                            sync_all_repos: false,
                        }}
                        credentials={mockCredentials}
                    />,
                );

                const repoBCheckbox = await screen.findByLabelText("repo-b");
                expect(repoBCheckbox).toBeChecked();

                await userEvent.click(repoBCheckbox);

                expect(screen.getByRole("alert")).toHaveTextContent(
                    /Removing 1 repository.*repo-b/,
                );
            });
        });

        describe("save diff summary", () => {
            it("shows a change summary describing what was updated", async () => {
                mockUpdateSyncConfig.mockResolvedValue(undefined);
                const initialData: SyncConfig = {
                    id: "cfg-diff",
                    name: "Diff Config",
                    provider: "github",
                    credential_id: "cred-1",
                    sync_targets: ["git"],
                    sync_options: { owner: "myorg" },
                    is_active: true,
                    schedule_cron: null,
                    timezone: null,
                    initial_sync_depth: 30,
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

                await userEvent.click(screen.getByLabelText("Pull Requests"));
                await userEvent.click(screen.getByRole("button", { name: "Update Configuration" }));

                await waitFor(() => {
                    expect(screen.getByText("Config updated")).toBeInTheDocument();
                    expect(
                        screen.getByText(/Changed:.*Datasets: \+Pull Requests/),
                    ).toBeInTheDocument();
                });
            });

            it("omits the change description when nothing actually changed", async () => {
                mockUpdateSyncConfig.mockResolvedValue(undefined);
                const initialData: SyncConfig = {
                    id: "cfg-nochange",
                    name: "No Change Config",
                    provider: "github",
                    credential_id: "cred-1",
                    sync_targets: ["git"],
                    sync_options: { owner: "myorg" },
                    is_active: true,
                    schedule_cron: null,
                    timezone: null,
                    initial_sync_depth: 30,
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

                await userEvent.click(screen.getByRole("button", { name: "Update Configuration" }));

                await waitFor(() => {
                    expect(screen.getByText("Config updated")).toBeInTheDocument();
                });
                expect(screen.queryByText(/Changed:/)).not.toBeInTheDocument();
            });
        });

        describe("destructive-change confirmation (CHAOS-2838)", () => {
            it("gates a destructive save behind the shared ConfirmDialog and clears the stale baseline after confirming", async () => {
                mockUpdateSyncConfig.mockResolvedValue(undefined);
                const initialData: SyncConfig = {
                    id: "cfg-baseline-refresh",
                    name: "Baseline Refresh Config",
                    provider: "github",
                    credential_id: "cred-1",
                    sync_targets: ["git", "prs"],
                    sync_options: {},
                    is_active: true,
                    schedule_cron: null,
                    timezone: null,
                    initial_sync_depth: 30,
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

                // Stage a destructive change (dropping a dataset) — the inline
                // warning surfaces before submit.
                await userEvent.click(screen.getByLabelText("Pull Requests"));
                expect(screen.getByRole("alert")).toHaveTextContent(
                    /Removing dataset.*Pull Requests/,
                );

                // Submitting a destructive edit opens the shared ConfirmDialog
                // instead of saving immediately.
                await userEvent.click(screen.getByRole("button", { name: "Update Configuration" }));
                expect(mockUpdateSyncConfig).not.toHaveBeenCalled();
                expect(
                    screen.getByRole("dialog", { name: "Confirm destructive changes" }),
                ).toBeInTheDocument();

                await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

                await waitFor(() => {
                    expect(mockUpdateSyncConfig).toHaveBeenCalledTimes(1);
                    expect(
                        screen.getByText(/Changed:.*Datasets: -Pull Requests/),
                    ).toBeInTheDocument();
                });
                expect(screen.queryByRole("alert")).not.toBeInTheDocument();
                expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

                // Save again with no further edits. A stale baseline would
                // recompute the same "Datasets: -Pull Requests" diff a second
                // time against the original page-load snapshot, and since
                // there's nothing destructive left staged, no confirm dialog
                // should reappear.
                const saveButtonAgain = await screen.findByRole("button", {
                    name: "Update Configuration",
                });
                await userEvent.click(saveButtonAgain);
                expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
                await waitFor(() => {
                    expect(mockUpdateSyncConfig).toHaveBeenCalledTimes(2);
                });
                expect(screen.getAllByText(/Changed:/)).toHaveLength(1);
            });

            it("cancelling the ConfirmDialog leaves the config unsaved", async () => {
                const initialData: SyncConfig = {
                    id: "cfg-cancel-destructive",
                    name: "Cancel Config",
                    provider: "github",
                    credential_id: "cred-1",
                    sync_targets: ["git", "prs"],
                    sync_options: {},
                    is_active: true,
                    schedule_cron: null,
                    timezone: null,
                    initial_sync_depth: 30,
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

                await userEvent.click(screen.getByLabelText("Pull Requests"));
                await userEvent.click(screen.getByRole("button", { name: "Update Configuration" }));
                expect(
                    screen.getByRole("dialog", { name: "Confirm destructive changes" }),
                ).toBeInTheDocument();

                await userEvent.click(
                    within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }),
                );

                expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
                expect(mockUpdateSyncConfig).not.toHaveBeenCalled();
            });
        });

        it("hides auto-import toggle for launchdarkly provider", () => {
            const initialData: SyncConfig = {
                id: "cfg-ld",
                name: "LD Config",
                provider: "launchdarkly",
                credential_id: "cred-ld",
                sync_targets: ["feature-flags"],
                sync_options: {},
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

            expect(
                screen.queryByLabelText("Auto-import teams, projects & members"),
            ).not.toBeInTheDocument();
        });

        it("blocks a PagerDuty save for duplicate service IDs and focuses the mapping editor", async () => {
            // Given: a valid persisted PagerDuty services mapping.
            const initialData: SyncConfig = {
                id: "cfg-pagerduty-duplicates",
                name: "PagerDuty Services",
                provider: "pagerduty",
                credential_id: "cred-pagerduty",
                sync_targets: ["operational"],
                sync_options: {
                    service_repository_mappings: {
                        admin: {
                            "service-api": [{ provider: "github", full_name: "full-chaos/api" }],
                        },
                    },
                },
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
            render(
                <SyncConfigForm
                    initialData={initialData}
                    credentials={[
                        ...mockCredentials,
                        {
                            id: "cred-pagerduty",
                            provider: "pagerduty",
                            name: "PagerDuty token",
                            is_active: true,
                            config: {},
                            last_test_at: null,
                            last_test_success: null,
                            last_test_error: null,
                            created_at: "2024-01-01",
                            updated_at: "2024-01-01",
                        },
                    ]}
                />,
            );

            // When: a second complete row repeats the existing service ID and is submitted.
            const addMapping = screen.getByRole("button", { name: "Add service mapping" });
            await waitFor(() => expect(addMapping).toBeEnabled());
            await userEvent.click(addMapping);
            await userEvent.selectOptions(
                screen.getAllByLabelText("PagerDuty service")[1],
                "service-api",
            );
            await userEvent.type(
                screen.getByLabelText("Repository full name 2.1"),
                "full-chaos/api-mirror",
            );
            await waitFor(() => {
                expect(screen.getByRole("alert")).toHaveTextContent(
                    "Each PagerDuty service can be mapped only once.",
                );
            });
            await userEvent.click(screen.getByRole("button", { name: "Update Configuration" }));

            // Then: the parent blocks persistence and directs keyboard focus to the invalid editor.
            expect(mockUpdateSyncConfig).not.toHaveBeenCalled();
            expect(document.activeElement).toBe(
                document.getElementById("pagerduty-service-repository-mappings"),
            );
        });

        it("preserves non-admin mapping namespaces when a non-PagerDuty config is saved", async () => {
            // Given: a GitHub configuration containing mappings from several independent sources.
            mockUpdateSyncConfig.mockResolvedValue(undefined);
            const initialData: SyncConfig = {
                id: "cfg-github-preserve-mappings",
                name: "GitHub Delivery",
                provider: "github",
                credential_id: "cred-1",
                sync_targets: ["git"],
                sync_options: {
                    service_repository_mappings: {
                        admin: {
                            "service-old": [{ provider: "github", full_name: "full-chaos/old" }],
                        },
                        compass: {
                            "service-catalog": [
                                { provider: "github", full_name: "full-chaos/catalog" },
                            ],
                        },
                        heuristic: {
                            "service-heuristic": [
                                { provider: "gitlab", full_name: "full-chaos/heuristic" },
                            ],
                        },
                    },
                },
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

            // When: the unrelated provider configuration is saved.
            await userEvent.click(screen.getByRole("button", { name: "Update Configuration" }));

            // Then: only the web-owned admin namespace clears from the payload.
            await waitFor(() => {
                expect(mockUpdateSyncConfig).toHaveBeenCalledWith("cfg-github-preserve-mappings", {
                    sync_targets: ["git"],
                    is_active: true,
                    schedule_cron: null,
                    timezone: null,
                    initial_sync_depth: 30,
                    sync_options: {
                        auto_import_teams: false,
                        service_repository_mappings: {
                            compass: {
                                "service-catalog": [
                                    { provider: "github", full_name: "full-chaos/catalog" },
                                ],
                            },
                            heuristic: {
                                "service-heuristic": [
                                    { provider: "gitlab", full_name: "full-chaos/heuristic" },
                                ],
                            },
                        },
                    },
                });
            });
        });
    });
});
