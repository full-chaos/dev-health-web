import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithToaster, screen, userEvent, waitFor } from "@/test/utils";
import type { IntegrationCredential } from "@/lib/admin/types";

const mockTestConnection = vi.fn();
const mockCreateCredential = vi.fn();

vi.mock("@/lib/admin/server", () => ({
  testConnection: (...args: unknown[]) => mockTestConnection(...args),
  createCredential: (...args: unknown[]) => mockCreateCredential(...args),
}));

import { CreateCredentialModal } from "./CreateCredentialModal";

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
    expect(screen.getByLabelText("Server URL")).toBeInTheDocument();

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
      <CreateCredentialModal isOpen onCloseAction={vi.fn()} onCreatedAction={vi.fn()} provider="github" />,
    );

    await userEvent.type(screen.getByLabelText("Credential Name"), "Primary");
    await userEvent.type(screen.getByLabelText("Token"), "ghp_123");
    await userEvent.click(screen.getByRole("button", { name: "Test Connection" }));

    await waitFor(() => {
      expect(mockTestConnection).toHaveBeenCalledWith("github", "Primary", {
        token: "ghp_123",
      });
    });

    expect(screen.getByText(/Connection successful/)).toBeInTheDocument();
  });

  it("save is disabled until test passes", async () => {
    mockTestConnection.mockResolvedValue({
      data: { success: true, error: null, details: null },
    });

    renderWithToaster(
      <CreateCredentialModal isOpen onCloseAction={vi.fn()} onCreatedAction={vi.fn()} provider="github" />,
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
      <CreateCredentialModal isOpen onCloseAction={onClose} onCreatedAction={onCreated} provider="github" />,
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

  it("closes modal on cancel", async () => {
    const onClose = vi.fn();
    renderWithToaster(
      <CreateCredentialModal isOpen onCloseAction={onClose} onCreatedAction={vi.fn()} provider="github" />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
