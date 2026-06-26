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

vi.mock("@/components/auth/OnboardForm", () => ({
    OnboardForm: ({ guided }: { guided?: boolean }) => (
        <div data-testid="onboard-form" data-guided={guided ? "true" : "false"}>
            OnboardForm stub
        </div>
    ),
}));

import OnboardWorkspacePage from "./page";

async function renderPage(params: Record<string, string> = {}) {
    return OnboardWorkspacePage({ searchParams: Promise.resolve(params) });
}

describe("OnboardWorkspacePage", () => {
    beforeEach(() => {
        authMock.mockResolvedValue({ user: { org_id: undefined, needs_onboarding: true } });
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

    it("renders the workspace step with the guided OnboardForm", async () => {
        const ui = await renderPage();
        render(ui as React.ReactElement);

        expect(screen.getByRole("heading", { name: "Set up your workspace" })).toBeInTheDocument();
        expect(screen.getByTestId("onboard-form")).toHaveAttribute("data-guided", "true");
    });
});
