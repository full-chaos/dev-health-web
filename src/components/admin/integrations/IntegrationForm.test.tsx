import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithToaster, screen, userEvent, waitFor } from "@/test/utils";

vi.mock("sonner", async () => {
  const actual = await vi.importActual<typeof import("sonner")>("sonner");
  return actual;
});

import { IntegrationForm } from "./IntegrationForm";

type IntegrationFormProps = React.ComponentProps<typeof IntegrationForm>;

const mockOnSave = vi.fn<IntegrationFormProps["onSave"]>();
const mockOnTestConnection = vi.fn<IntegrationFormProps["onTestConnection"]>();

function renderForm(props?: Partial<IntegrationFormProps>) {
  return renderWithToaster(
    <IntegrationForm
      providerName="GitHub"
      initialStatus="not_configured"
      onSave={mockOnSave}
      onTestConnection={mockOnTestConnection}
      {...props}
    >
      <input name="token" data-testid="token-input" defaultValue="test-token" />
    </IntegrationForm>,
  );
}

describe("IntegrationForm", () => {
  beforeEach(() => {
    mockOnSave.mockReset();
    mockOnTestConnection.mockReset();
  });

  it("renders configuration heading and connection status", () => {
    renderForm();

    expect(screen.getByRole("heading", { name: "Configuration" })).toBeInTheDocument();
    expect(screen.getByText("Not Configured")).toBeInTheDocument();
  });

  it("renders children (form fields)", () => {
    renderForm();

    expect(screen.getByTestId("token-input")).toBeInTheDocument();
  });

  it("renders save and test buttons", () => {
    renderForm();

    expect(screen.getByRole("button", { name: "Save Changes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test Connection" })).toBeInTheDocument();
  });

  it("calls onSave with form data on submit", async () => {
    mockOnSave.mockResolvedValue(undefined);
    renderForm();

    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(mockOnSave).toHaveBeenCalledWith(expect.objectContaining({ token: "test-token" }));
  });

  it("shows success toast on save", async () => {
    mockOnSave.mockResolvedValue(undefined);
    renderForm();

    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(screen.getByText("Settings saved successfully.")).toBeInTheDocument();
    });
  });

  it("shows error toast on save failure", async () => {
    mockOnSave.mockRejectedValue(new Error("save failed"));
    renderForm();

    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(screen.getByText("Failed to save settings.")).toBeInTheDocument();
    });
  });

  it("calls onTestConnection and shows success", async () => {
    mockOnTestConnection.mockResolvedValue(true);
    renderForm();

    await userEvent.click(screen.getByRole("button", { name: "Test Connection" }));

    expect(mockOnTestConnection).toHaveBeenCalledWith(
      expect.objectContaining({ token: "test-token" }),
    );

    await waitFor(() => {
      expect(screen.getByText("Connection successful!")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText("Connected")).toBeInTheDocument();
    });
  });

  it("calls onTestConnection and shows failure", async () => {
    mockOnTestConnection.mockResolvedValue(false);
    renderForm();

    await userEvent.click(screen.getByRole("button", { name: "Test Connection" }));

    expect(mockOnTestConnection).toHaveBeenCalledWith(
      expect.objectContaining({ token: "test-token" }),
    );

    await waitFor(() => {
      expect(screen.getByText(/Connection failed/)).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText("Connection Error")).toBeInTheDocument();
    });
  });
});
