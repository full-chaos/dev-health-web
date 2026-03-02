import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, renderWithToaster, screen, userEvent, waitFor } from "@/test/utils";
import type { IntegrationCredential } from "@/lib/admin/types";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  default: { useRouter: () => ({ push: mockPush }) },
}));

const mockCreateSyncConfig = vi.fn();
const mockUpdateSyncConfig = vi.fn();
vi.mock("@/lib/admin/server", () => ({
  createSyncConfig: (...args: unknown[]) => mockCreateSyncConfig(...args),
  updateSyncConfig: (...args: unknown[]) => mockUpdateSyncConfig(...args),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string; [key: string]: unknown }) => (
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
});
