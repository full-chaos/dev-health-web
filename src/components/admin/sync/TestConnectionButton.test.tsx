import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderWithToaster, screen, userEvent, waitFor } from "@/test/utils";
import { TestConnectionButton } from "./TestConnectionButton";

const mockTestConnection = vi.fn();

vi.mock("@/lib/admin/server", () => ({
  testConnection: (...args: unknown[]) => mockTestConnection(...args),
}));

describe("TestConnectionButton", () => {
  afterEach(() => {
    mockTestConnection.mockReset();
  });

  it("renders button", () => {
    renderWithToaster(<TestConnectionButton provider="github" credentialId="cred-1" />);

    expect(screen.getByRole("button", { name: "Test Connection" })).toBeInTheDocument();
  });

  it("is disabled when credentialId is null", () => {
    renderWithToaster(<TestConnectionButton provider="github" credentialId={null} />);

    expect(screen.getByRole("button", { name: "Test Connection" })).toBeDisabled();
  });

  it("shows spinner while testing", async () => {
    let resolvePromise: ((value: unknown) => void) | undefined;
    mockTestConnection.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePromise = resolve;
        }),
    );

    const { container } = renderWithToaster(
      <TestConnectionButton provider="github" credentialId="cred-1" />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Test Connection" }));

    expect(screen.getByRole("button", { name: "Testing..." })).toBeDisabled();
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();

    await act(async () => {
      resolvePromise?.({ data: { success: true, error: null, details: null } });
    });
  });

  it("calls testConnection on click", async () => {
    mockTestConnection.mockResolvedValue({ data: { success: true, error: null, details: null } });
    renderWithToaster(<TestConnectionButton provider="github" credentialId="cred-123" />);

    await userEvent.click(screen.getByRole("button", { name: "Test Connection" }));

    await waitFor(() => {
      expect(mockTestConnection).toHaveBeenCalledWith("github", { credentialId: "cred-123" });
    });
  });

  it("shows success toast when test succeeds", async () => {
    mockTestConnection.mockResolvedValue({ data: { success: true, error: null, details: null } });
    renderWithToaster(<TestConnectionButton provider="github" credentialId="cred-1" />);

    await userEvent.click(screen.getByRole("button", { name: "Test Connection" }));

    await waitFor(() => {
      expect(screen.getByText("Connection successful")).toBeInTheDocument();
    });
  });

  it("shows error toast when test fails", async () => {
    mockTestConnection.mockResolvedValue({ error: "Connection test failed" });
    renderWithToaster(<TestConnectionButton provider="github" credentialId="cred-1" />);

    await userEvent.click(screen.getByRole("button", { name: "Test Connection" }));

    await waitFor(() => {
      expect(screen.getByText("Connection test failed")).toBeInTheDocument();
    });
  });
});
