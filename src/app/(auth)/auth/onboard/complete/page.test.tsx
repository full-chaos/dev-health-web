import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import type { OnboardingNextStep, OnboardingState } from "@/lib/onboarding/types";

const redirectMock = vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
});
const authMock = vi.fn();
const guidedOnboardingMock = vi.fn();
const getJsonMock = vi.fn();

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

vi.mock("@/lib/apiClient", () => ({
    apiClient: {
        getJson: (...args: unknown[]) => getJsonMock(...args),
    },
}));

import OnboardCompletePage from "./page";

async function renderPage(params: Record<string, string> = {}) {
    return OnboardCompletePage({ searchParams: Promise.resolve(params) });
}

function state(nextStep: OnboardingNextStep): OnboardingState {
    return {
        needs_onboarding: nextStep !== "dashboard",
        org_created: nextStep !== "workspace",
        org_id: nextStep === "workspace" ? null : "org-1",
        org_name: nextStep === "workspace" ? null : "Acme",
        first_integration_connected: nextStep === "complete" || nextStep === "dashboard",
        integration_skipped: false,
        recommended_provider: "github",
        next_step: nextStep,
        blocker: null,
    };
}

describe("OnboardCompletePage", () => {
    beforeEach(() => {
        authMock.mockResolvedValue({ user: { org_id: "org-1", needs_onboarding: false } });
        guidedOnboardingMock.mockReturnValue(true);
        getJsonMock.mockResolvedValue(state("complete"));
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

    it("redirects to the aligned step when C1 says setup is unfinished", async () => {
        getJsonMock.mockResolvedValue(state("integration"));

        await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT:/auth/onboard/integration");
        expect(getJsonMock).toHaveBeenCalledWith("/api/v1/auth/onboarding/state");
    });

    it("renders completion best-effort when C1 fails but the session is already onboarded path-safe", async () => {
        // C1 failure with an onboarded session redirects to the product rather
        // than rendering — never stranding the user mid-flow.
        getJsonMock.mockRejectedValue(new Error("backend down"));

        await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    });
});
