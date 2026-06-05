import { afterEach, describe, expect, test, vi } from "vitest";
import { renderWithToaster, screen, fireEvent, userEvent, waitFor, cleanup } from "@/test/utils";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("ResetPasswordForm", () => {
    afterEach(() => {
        cleanup();
        mockFetch.mockReset();
    });

    test("renders password fields and submit button", () => {
        renderWithToaster(<ResetPasswordForm token="test-token" />);
        expect(screen.getByLabelText(/^new password/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /reset password/i })).toBeInTheDocument();
    });

    test("validates password match", async () => {
        renderWithToaster(<ResetPasswordForm token="test-token" />);

        await userEvent.type(screen.getByLabelText(/^new password/i), "Valid1Password!");
        await userEvent.type(screen.getByLabelText(/confirm new password/i), "Different1Password!");
        await userEvent.click(screen.getByRole("button", { name: /reset password/i }));

        await waitFor(() => {
            expect(screen.getByText(/Passwords do not match/i)).toBeInTheDocument();
        });
        expect(mockFetch).not.toHaveBeenCalled();
    });

    test("rejects password under minimum length without fetch", async () => {
        renderWithToaster(<ResetPasswordForm token="test-token" />);

        await userEvent.type(screen.getByLabelText(/^new password/i), "Ab12345");
        await userEvent.type(screen.getByLabelText(/confirm new password/i), "Ab12345");
        await userEvent.click(screen.getByRole("button", { name: /reset password/i }));

        await waitFor(() => {
            expect(screen.getByText(/Password must be at least 8 characters/i)).toBeInTheDocument();
        });
        expect(mockFetch).not.toHaveBeenCalled();
    });

    test("inputs have minLength and maxLength bounds preventing over-max at input level", () => {
        renderWithToaster(<ResetPasswordForm token="test-token" />);
        const newPwInput = screen.getByLabelText(/^new password/i);
        const confirmPwInput = screen.getByLabelText(/confirm new password/i);
        expect(newPwInput).toHaveAttribute("minLength", "8");
        expect(newPwInput).toHaveAttribute("maxLength", "128");
        expect(confirmPwInput).toHaveAttribute("minLength", "8");
        expect(confirmPwInput).toHaveAttribute("maxLength", "128");
    });

    test("rejects password over 128 characters without fetch", async () => {
        renderWithToaster(<ResetPasswordForm token="test-token" />);
        const newPwInput = screen.getByLabelText(/^new password/i);
        const confirmPwInput = screen.getByLabelText(/confirm new password/i);
        // Bypass HTML maxLength using fireEvent to test the JS guard
        const longPassword = "Aa1" + "x".repeat(127); // 130 chars
        fireEvent.change(newPwInput, { target: { value: longPassword } });
        fireEvent.change(confirmPwInput, { target: { value: longPassword } });
        await userEvent.click(screen.getByRole("button", { name: /reset password/i }));

        await waitFor(() => {
            expect(
                screen.getByText(/Password must be at most 128 characters/i),
            ).toBeInTheDocument();
        });
        expect(mockFetch).not.toHaveBeenCalled();
    });

    test("validates contains letter", async () => {
        renderWithToaster(<ResetPasswordForm token="test-token" />);

        await userEvent.type(screen.getByLabelText(/^new password/i), "1234567890123");
        await userEvent.type(screen.getByLabelText(/confirm new password/i), "1234567890123");
        await userEvent.click(screen.getByRole("button", { name: /reset password/i }));

        await waitFor(() => {
            expect(
                screen.getByText(/Password must contain at least one letter/i),
            ).toBeInTheDocument();
        });
        expect(mockFetch).not.toHaveBeenCalled();
    });

    test("validates contains number", async () => {
        renderWithToaster(<ResetPasswordForm token="test-token" />);

        await userEvent.type(screen.getByLabelText(/^new password/i), "PasswordStringHere");
        await userEvent.type(screen.getByLabelText(/confirm new password/i), "PasswordStringHere");
        await userEvent.click(screen.getByRole("button", { name: /reset password/i }));

        await waitFor(() => {
            expect(
                screen.getByText(/Password must contain at least one number/i),
            ).toBeInTheDocument();
        });
        expect(mockFetch).not.toHaveBeenCalled();
    });

    test("shows success message on successful reset", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({}),
        });

        renderWithToaster(<ResetPasswordForm token="test-token" />);

        await userEvent.type(screen.getByLabelText(/^new password/i), "Valid1Password!");
        await userEvent.type(screen.getByLabelText(/confirm new password/i), "Valid1Password!");
        await userEvent.click(screen.getByRole("button", { name: /reset password/i }));

        await waitFor(() => {
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining("/api/v1/auth/reset-password"),
                expect.objectContaining({
                    method: "POST",
                    body: JSON.stringify({ token: "test-token", new_password: "Valid1Password!" }),
                }),
            );
        });

        await waitFor(() => {
            expect(
                screen.getByText(/Your password has been reset successfully/i),
            ).toBeInTheDocument();
        });
    });

    test("shows 400 invalid token error", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 400,
            json: async () => ({}),
        });

        renderWithToaster(<ResetPasswordForm token="invalid-token" />);

        await userEvent.type(screen.getByLabelText(/^new password/i), "Valid1Password!");
        await userEvent.type(screen.getByLabelText(/confirm new password/i), "Valid1Password!");
        await userEvent.click(screen.getByRole("button", { name: /reset password/i }));

        await waitFor(() => {
            expect(screen.getByText(/Invalid or expired token/i)).toBeInTheDocument();
        });
    });

    test("shows generic error on failure", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: async () => ({ detail: "Server error" }),
        });

        renderWithToaster(<ResetPasswordForm token="test-token" />);

        await userEvent.type(screen.getByLabelText(/^new password/i), "Valid1Password!");
        await userEvent.type(screen.getByLabelText(/confirm new password/i), "Valid1Password!");
        await userEvent.click(screen.getByRole("button", { name: /reset password/i }));

        await waitFor(() => {
            expect(screen.getByText(/Server error/i)).toBeInTheDocument();
        });
    });
});
