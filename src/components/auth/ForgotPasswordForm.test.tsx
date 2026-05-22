import { afterEach, describe, expect, test, vi } from "vitest";
import { renderWithToaster, screen, userEvent, waitFor, cleanup } from "@/test/utils";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("ForgotPasswordForm", () => {
  afterEach(() => {
    cleanup();
    mockFetch.mockReset();
  });

  test("renders email input and submit button", () => {
    renderWithToaster(<ForgotPasswordForm />);
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send reset link/i })).toBeInTheDocument();
  });

  test("shows success message after successful submission", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    renderWithToaster(<ForgotPasswordForm />);

    await userEvent.type(screen.getByLabelText(/email address/i), "tester@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/v1/auth/forgot-password"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ email: "tester@example.com" }),
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/If an account exists with that email/i)).toBeInTheDocument();
    });
  });

  test("success screen back-to-signin link includes ?from=reset (CHAOS-1769)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });

    renderWithToaster(<ForgotPasswordForm />);
    await userEvent.type(screen.getByLabelText(/email address/i), "tester@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    const backLink = await screen.findByRole("link", { name: /back to sign in/i });
    expect(backLink).toHaveAttribute("href", "/auth/signin?from=reset");
  });

  test("shows 429 rate limit error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({}),
    });

    renderWithToaster(<ForgotPasswordForm />);

    await userEvent.type(screen.getByLabelText(/email address/i), "tester@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText(/Too many requests/i)).toBeInTheDocument();
    });
  });

  test("shows generic error on failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ detail: "Server error" }),
    });

    renderWithToaster(<ForgotPasswordForm />);

    await userEvent.type(screen.getByLabelText(/email address/i), "tester@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText(/Server error/i)).toBeInTheDocument();
    });
  });

  test("shows fallback error message if detail is missing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    renderWithToaster(<ForgotPasswordForm />);

    await userEvent.type(screen.getByLabelText(/email address/i), "tester@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText(/Failed to send reset link/i)).toBeInTheDocument();
    });
  });
});
