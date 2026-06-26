import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const redirectMock = vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
});
const authMock = vi.fn();
const guidedOnboardingMock = vi.fn();

vi.mock("next/navigation", () => ({
    redirect: (url: string) => redirectMock(url),
}));

vi.mock("@/lib/auth", () => ({
    auth: () => authMock(),
}));

vi.mock("@/lib/runtimeConfig", () => ({
    runtimeConfig: {
        guidedOnboarding: () => guidedOnboardingMock(),
    },
}));

import OnboardCompletePage from "./page";

async function renderPage(params: Record<string, string> = {}) {
    return OnboardCompletePage({ searchParams: Promise.resolve(params) });
}

describe("OnboardCompletePage", () => {
    beforeEach(() => {
        authMock.mockResolvedValue({ user: { org_id: "org-1", needs_onboarding: false } });
        guidedOnboardingMock.mockReturnValue(true);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("redirects to sign-in when unauthenticated", async () => {
        authMock.mockResolvedValue(null);

        await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT:/auth/signin");
    });

    it("redirects to the onboarding entry when the guided flag is off", async () => {
        guidedOnboardingMock.mockReturnValue(false);

        await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT:/auth/onboard");
    });

    it("confirms completion and links to the dashboard", async () => {
        const ui = await renderPage();
        render(ui as React.ReactElement);

        expect(screen.getByRole("heading", { name: "You're all set" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Go to dashboard" })).toHaveAttribute(
            "href",
            "/dashboard",
        );
    });

    it("links to checkout when team-trial intent carried through", async () => {
        const ui = await renderPage({ plan: "team", trial: "true" });
        render(ui as React.ReactElement);

        expect(screen.getByRole("link", { name: "Continue to checkout" })).toHaveAttribute(
            "href",
            "/auth/trial-checkout?plan=team&trial=true",
        );
    });
});
