import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const providersMock = vi.fn();

vi.mock("@/lib/auth", () => ({
    getAvailableSocialProviders: () => providersMock(),
}));

vi.mock("@/components/auth/SignupForm", () => ({
    SignupForm: (props: { callbackUrl?: string; plan?: string; trialIntent?: boolean }) => (
        <div
            data-testid="signup-form"
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
        signInHref,
    }: {
        callbackUrl?: string;
        children: React.ReactNode;
        signInHref?: string;
    }) => (
        <section
            data-testid="auth-card"
            data-callback-url={callbackUrl ?? ""}
            data-signin-href={signInHref ?? ""}
        >
            {children}
        </section>
    ),
}));

import SignUpPage from "./page";

async function renderPage(params: Record<string, string> = {}) {
    return SignUpPage({ searchParams: Promise.resolve(params) });
}

describe("SignUpPage", () => {
    beforeEach(() => {
        providersMock.mockReturnValue(["github"]);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("threads callbackUrl through the sign-in tab target", async () => {
        const ui = await renderPage({ callbackUrl: "/dashboard" });
        render(ui as React.ReactElement);

        expect(screen.getByTestId("auth-card")).toHaveAttribute("data-callback-url", "/dashboard");
        expect(screen.getByTestId("auth-card")).toHaveAttribute(
            "data-signin-href",
            "/auth/signin?callbackUrl=%2Fdashboard",
        );
        expect(screen.getByTestId("signup-form")).toHaveAttribute(
            "data-callback-url",
            "/dashboard",
        );
    });

    it("preserves callbackUrl alongside team-trial intent", async () => {
        const ui = await renderPage({ callbackUrl: "/dashboard", plan: "team", trial: "true" });
        render(ui as React.ReactElement);

        expect(screen.getByTestId("auth-card")).toHaveAttribute(
            "data-signin-href",
            "/auth/signin?plan=team&trial=true&callbackUrl=%2Fdashboard",
        );
        expect(screen.getByTestId("signup-form")).toHaveAttribute("data-trial-intent", "true");
    });
});
