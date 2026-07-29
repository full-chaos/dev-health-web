import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { renderWithToaster, screen, userEvent, waitFor, cleanup } from "@/test/utils";

const { mockSignIn, mockGetSession } = vi.hoisted(() => ({
    mockSignIn: vi.fn(),
    mockGetSession: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
    signIn: mockSignIn,
    getSession: mockGetSession,
}));

import { LoginForm } from "@/components/auth/LoginForm";

const locationAssign = vi.fn();

describe("LoginForm", () => {
    beforeEach(() => {
        Object.defineProperty(window, "location", {
            configurable: true,
            writable: true,
            value: { ...window.location, assign: locationAssign },
        });
    });

    afterEach(() => {
        cleanup();
        locationAssign.mockReset();
        mockSignIn.mockReset();
        mockGetSession.mockReset();
    });

    test("renders email and password fields", () => {
        renderWithToaster(<LoginForm />);
        expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    });

    test("renders submit button", () => {
        renderWithToaster(<LoginForm />);
        expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    });

    test('shows "Invalid email or password" toast on generic signIn error', async () => {
        mockSignIn.mockResolvedValue({
            error: "CredentialsSignin",
            code: "credentials",
            status: 401,
            ok: false,
            url: null,
        });
        mockGetSession.mockResolvedValue(null);
        renderWithToaster(<LoginForm />);

        await userEvent.type(screen.getByLabelText(/email/i), "tester@example.com");
        await userEvent.type(screen.getByLabelText(/password/i), "password");
        await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

        await waitFor(() => {
            expect(mockSignIn).toHaveBeenCalled();
        });

        await waitFor(() => {
            expect(screen.getByText(/Invalid email or password/i)).toBeInTheDocument();
        });
        expect(locationAssign).not.toHaveBeenCalled();
    });

    test('shows verify-email banner when result.code === "email_verification_required"', async () => {
        mockSignIn.mockResolvedValue({
            error: "CredentialsSignin",
            code: "email_verification_required",
            status: 401,
            ok: false,
            url: null,
        });
        mockGetSession.mockResolvedValue(null);
        renderWithToaster(<LoginForm />);

        await userEvent.type(screen.getByLabelText(/email/i), "tester@example.com");
        await userEvent.type(screen.getByLabelText(/password/i), "password");
        await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

        await waitFor(() => {
            expect(screen.getByText(/Please verify your email/i)).toBeVisible();
        });
        expect(locationAssign).not.toHaveBeenCalled();
    });

    test("hard-navigates to /dashboard on successful login (no onboarding needed)", async () => {
        mockSignIn.mockResolvedValue({
            error: undefined,
            code: undefined,
            status: 200,
            ok: true,
            url: null,
        });
        mockGetSession.mockResolvedValue({ user: { needs_onboarding: false } });
        renderWithToaster(<LoginForm />);

        await userEvent.type(screen.getByLabelText(/email/i), "tester@example.com");
        await userEvent.type(screen.getByLabelText(/password/i), "password");
        await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

        await waitFor(() => {
            expect(locationAssign).toHaveBeenCalledWith("/dashboard");
        });
    });

    test("hard-navigates to the callbackUrl on successful login when one is provided", async () => {
        mockSignIn.mockResolvedValue({
            error: undefined,
            code: undefined,
            status: 200,
            ok: true,
            url: null,
        });
        mockGetSession.mockResolvedValue({ user: { needs_onboarding: false } });
        renderWithToaster(<LoginForm callbackUrl="/acr/device" />);

        await userEvent.type(screen.getByLabelText(/email/i), "tester@example.com");
        await userEvent.type(screen.getByLabelText(/password/i), "password");
        await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

        await waitFor(() => {
            expect(locationAssign).toHaveBeenCalledWith("/acr/device");
        });
    });

    test("submits when Enter is pressed in the email field", async () => {
        mockSignIn.mockResolvedValue({
            error: "CredentialsSignin",
            code: "credentials",
            status: 401,
            ok: false,
            url: null,
        });
        renderWithToaster(<LoginForm />);

        await userEvent.type(screen.getByLabelText(/email/i), "tester@example.com");
        await userEvent.type(screen.getByLabelText(/password/i), "password");
        await userEvent.click(screen.getByLabelText(/email/i));
        await userEvent.keyboard("{Enter}");

        await waitFor(() => {
            expect(mockSignIn).toHaveBeenCalledWith("credentials", {
                email: "tester@example.com",
                password: "password",
                redirect: false,
            });
        });
    });

    test("submits when Enter is pressed in the password field", async () => {
        mockSignIn.mockResolvedValue({
            error: "CredentialsSignin",
            code: "credentials",
            status: 401,
            ok: false,
            url: null,
        });
        renderWithToaster(<LoginForm />);

        await userEvent.type(screen.getByLabelText(/email/i), "tester@example.com");
        await userEvent.type(screen.getByLabelText(/password/i), "password{Enter}");

        await waitFor(() => {
            expect(mockSignIn).toHaveBeenCalledWith("credentials", {
                email: "tester@example.com",
                password: "password",
                redirect: false,
            });
        });
    });

    test("hard-navigates to /auth/onboard when session.user.needs_onboarding is true", async () => {
        mockSignIn.mockResolvedValue({
            error: undefined,
            code: undefined,
            status: 200,
            ok: true,
            url: null,
        });
        mockGetSession.mockResolvedValue({ user: { needs_onboarding: true } });
        renderWithToaster(<LoginForm />);

        await userEvent.type(screen.getByLabelText(/email/i), "tester@example.com");
        await userEvent.type(screen.getByLabelText(/password/i), "password");
        await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

        await waitFor(() => {
            expect(locationAssign).toHaveBeenCalledWith("/auth/onboard");
        });
    });

    test("does not let callbackUrl bypass required onboarding", async () => {
        mockSignIn.mockResolvedValue({
            error: undefined,
            code: undefined,
            status: 200,
            ok: true,
            url: null,
        });
        mockGetSession.mockResolvedValue({ user: { needs_onboarding: true } });
        renderWithToaster(<LoginForm callbackUrl="/acr/device" />);

        await userEvent.type(screen.getByLabelText(/email/i), "tester@example.com");
        await userEvent.type(screen.getByLabelText(/password/i), "password");
        await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

        await waitFor(() => {
            expect(locationAssign).toHaveBeenCalledWith("/auth/onboard");
        });
    });

    test("preserves team trial intent when redirecting to onboarding", async () => {
        mockSignIn.mockResolvedValue({
            error: undefined,
            code: undefined,
            status: 200,
            ok: true,
            url: null,
        });
        mockGetSession.mockResolvedValue({ user: { needs_onboarding: true } });
        renderWithToaster(<LoginForm plan="team" trialIntent />);

        await userEvent.type(screen.getByLabelText(/email/i), "tester@example.com");
        await userEvent.type(screen.getByLabelText(/password/i), "password");
        await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

        await waitFor(() => {
            expect(locationAssign).toHaveBeenCalledWith("/auth/onboard?plan=team&trial=true");
        });
    });

    test("falls back to /dashboard when getSession returns null after retry", async () => {
        mockSignIn.mockResolvedValue({
            error: undefined,
            code: undefined,
            status: 200,
            ok: true,
            url: null,
        });
        mockGetSession.mockResolvedValue(null);
        renderWithToaster(<LoginForm />);

        await userEvent.type(screen.getByLabelText(/email/i), "tester@example.com");
        await userEvent.type(screen.getByLabelText(/password/i), "password");
        await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

        await waitFor(() => {
            expect(locationAssign).toHaveBeenCalledWith("/dashboard");
        });
        expect(mockGetSession).toHaveBeenCalledTimes(2);
    });

    test("shows generic error toast on network failure", async () => {
        mockSignIn.mockRejectedValue(new Error("Network error"));
        renderWithToaster(<LoginForm />);

        await userEvent.type(screen.getByLabelText(/email/i), "tester@example.com");
        await userEvent.type(screen.getByLabelText(/password/i), "password");
        await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

        await waitFor(() => {
            expect(screen.getByText(/An error occurred/i)).toBeInTheDocument();
        });
        expect(locationAssign).not.toHaveBeenCalled();
    });

    test('shows account locked message when result.code is "account_locked"', async () => {
        mockSignIn.mockResolvedValue({
            error: "CredentialsSignin",
            code: "account_locked",
            status: 401,
            ok: false,
            url: null,
        });
        renderWithToaster(<LoginForm />);

        await userEvent.type(screen.getByLabelText(/email/i), "tester@example.com");
        await userEvent.type(screen.getByLabelText(/password/i), "password");
        await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

        await waitFor(() => {
            expect(screen.getByText(/Too many failed login attempts/i)).toBeInTheDocument();
        });
        expect(locationAssign).not.toHaveBeenCalled();
    });

    test('shows rate limit message when result.code is "rate_limited"', async () => {
        mockSignIn.mockResolvedValue({
            error: "CredentialsSignin",
            code: "rate_limited",
            status: 401,
            ok: false,
            url: null,
        });
        renderWithToaster(<LoginForm />);

        await userEvent.type(screen.getByLabelText(/email/i), "tester@example.com");
        await userEvent.type(screen.getByLabelText(/password/i), "password");
        await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

        await waitFor(() => {
            expect(screen.getByText(/Too many login attempts/i)).toBeInTheDocument();
        });
        expect(locationAssign).not.toHaveBeenCalled();
    });
});
