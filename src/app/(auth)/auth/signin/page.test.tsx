import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const redirectMock = vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
});
const authMock = vi.fn();
const providersMock = vi.fn();

vi.mock("next/navigation", () => ({
    redirect: (url: string) => redirectMock(url),
}));

vi.mock("@/lib/auth", () => ({
    auth: () => authMock(),
    getAvailableSocialProviders: () => providersMock(),
}));

vi.mock("@/components/auth/LoginForm", () => ({
    LoginForm: (props: { callbackUrl?: string; plan?: string; trialIntent?: boolean }) => (
        <div
            data-testid="login-form"
            data-callback-url={props.callbackUrl ?? ""}
            data-plan={props.plan ?? ""}
            data-trial-intent={props.trialIntent ? "true" : "false"}
        />
    ),
}));

vi.mock("@/components/auth/AuthCard", () => ({
    AuthCard: ({
        children,
        callbackUrl,
        signUpHref,
    }: {
        callbackUrl?: string;
        children: React.ReactNode;
        signUpHref?: string;
    }) => (
        <section
            data-testid="auth-card"
            data-callback-url={callbackUrl ?? ""}
            data-signup-href={signUpHref ?? ""}
        >
            {children}
        </section>
    ),
}));

vi.mock("@/components/auth/SocialLoginError", () => ({
    SocialLoginError: ({ error }: { error: string }) => <span>{error}</span>,
}));

import SignInPage from "./page";

async function renderPage(params: Record<string, string> = {}) {
    return SignInPage({ searchParams: Promise.resolve(params) });
}

describe("SignInPage", () => {
    beforeEach(() => {
        authMock.mockResolvedValue(null);
        providersMock.mockReturnValue(["github"]);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("passes the callbackUrl to the login form and auth card", async () => {
        const ui = await renderPage({ callbackUrl: "/acr/device" });
        render(ui as React.ReactElement);

        expect(screen.getByTestId("auth-card")).toHaveAttribute("data-callback-url", "/acr/device");
        expect(screen.getByTestId("auth-card")).toHaveAttribute(
            "data-signup-href",
            "/auth/signup?callbackUrl=%2Facr%2Fdevice",
        );
        expect(screen.getByTestId("login-form")).toHaveAttribute(
            "data-callback-url",
            "/acr/device",
        );
    });

    it("redirects an already-authenticated user to the callbackUrl", async () => {
        authMock.mockResolvedValue({
            user: { needs_onboarding: false },
        });

        await expect(renderPage({ callbackUrl: "/acr/device" })).rejects.toThrow(
            "NEXT_REDIRECT:/acr/device",
        );
    });

    it("keeps required onboarding ahead of the callbackUrl", async () => {
        authMock.mockResolvedValue({
            user: { needs_onboarding: true },
        });

        await expect(renderPage({ callbackUrl: "/acr/device" })).rejects.toThrow(
            "NEXT_REDIRECT:/auth/onboard",
        );
    });

    it("ignores auth-page callback targets and falls back to the dashboard", async () => {
        const ui = await renderPage({ callbackUrl: "/auth/signin" });
        render(ui as React.ReactElement);

        expect(screen.getByTestId("login-form")).toHaveAttribute("data-callback-url", "");
        expect(screen.getByTestId("auth-card")).toHaveAttribute("data-signup-href", "/auth/signup");
    });
});
