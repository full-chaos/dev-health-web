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

vi.mock("@/components/auth/OnboardForm", () => ({
    OnboardForm: ({ guided }: { guided?: boolean }) => (
        <div data-testid="onboard-form" data-guided={guided ? "true" : "false"}>
            OnboardForm stub
        </div>
    ),
}));

vi.mock("@/lib/apiClient", () => ({
    apiClient: {
        getJson: (...args: unknown[]) => getJsonMock(...args),
    },
}));

import OnboardWorkspacePage from "./page";

async function renderPage(params: Record<string, string> = {}) {
    return OnboardWorkspacePage({ searchParams: Promise.resolve(params) });
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

describe("OnboardWorkspacePage", () => {
    beforeEach(() => {
        authMock.mockResolvedValue({ user: { org_id: undefined, needs_onboarding: true } });
        guidedOnboardingMock.mockReturnValue(true);
        getJsonMock.mockResolvedValue(state("workspace"));
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

    it("redirects to the aligned step when C1 says the user is further along", async () => {
        getJsonMock.mockResolvedValue(state("integration"));

        await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT:/auth/onboard/integration");
        expect(getJsonMock).toHaveBeenCalledWith("/api/v1/auth/onboarding/state");
    });

    it("threads team-trial intent through an alignment redirect", async () => {
        getJsonMock.mockResolvedValue(state("complete"));

        await expect(renderPage({ plan: "team", trial: "true" })).rejects.toThrow(
            "NEXT_REDIRECT:/auth/onboard/complete?plan=team&trial=true",
        );
    });

    it("sends an already-onboarded user to the dashboard when C1 fails (never strands on workspace)", async () => {
        authMock.mockResolvedValue({ user: { org_id: "org-1", needs_onboarding: false } });
        getJsonMock.mockRejectedValue(new Error("backend down"));

        await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    });

    it("renders the workspace step best-effort when C1 fails for a non-onboarded user", async () => {
        getJsonMock.mockRejectedValue(new Error("backend down"));

        const ui = await renderPage();
        render(ui as React.ReactElement);

        expect(screen.getByTestId("onboard-form")).toHaveAttribute("data-guided", "true");
        expect(redirectMock).not.toHaveBeenCalled();
    });
});
