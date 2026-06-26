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

vi.mock("@/components/auth/OnboardForm", () => ({
    OnboardForm: ({ guided }: { guided?: boolean }) => (
        <div data-testid="onboard-form" data-guided={guided ? "true" : "false"}>
            OnboardForm stub
        </div>
    ),
}));

import OnboardPage from "./page";

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

async function renderPage(params: Record<string, string> = {}) {
    return OnboardPage({ searchParams: Promise.resolve(params) });
}

describe("OnboardPage (guided routing — CHAOS-2674)", () => {
    beforeEach(() => {
        authMock.mockResolvedValue({ user: { org_id: undefined, needs_onboarding: true } });
        guidedOnboardingMock.mockReturnValue(true);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it("redirects unauthenticated users to sign-in", async () => {
        authMock.mockResolvedValue(null);

        await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT:/auth/signin");
    });

    it.each([
        ["workspace", "/auth/onboard/workspace"],
        ["integration", "/auth/onboard/integration"],
        ["complete", "/auth/onboard/complete"],
    ] as const)("routes next_step=%s to %s", async (nextStep, target) => {
        getJsonMock.mockResolvedValue(state(nextStep));

        await expect(renderPage()).rejects.toThrow(`NEXT_REDIRECT:${target}`);
        expect(getJsonMock).toHaveBeenCalledWith("/api/v1/auth/onboarding/state");
    });

    it("routes next_step=dashboard to the dashboard", async () => {
        getJsonMock.mockResolvedValue(state("dashboard"));

        await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    });

    it("threads team-trial intent through the step redirect", async () => {
        getJsonMock.mockResolvedValue(state("integration"));

        await expect(renderPage({ plan: "team", trial: "true" })).rejects.toThrow(
            "NEXT_REDIRECT:/auth/onboard/integration?plan=team&trial=true",
        );
    });

    it("surfaces a retry instead of defaulting to workspace when C1 fails for a non-onboarded user", async () => {
        getJsonMock.mockRejectedValue(new Error("backend down"));

        const ui = await renderPage();
        render(ui as React.ReactElement);

        expect(screen.getByRole("alert")).toHaveTextContent(/couldn't load your onboarding/i);
        expect(screen.getByRole("link", { name: "Retry" })).toHaveAttribute(
            "href",
            "/auth/onboard",
        );
        expect(redirectMock).not.toHaveBeenCalled();
    });

    it("sends an already-onboarded user to the dashboard when C1 fails (never strands on workspace)", async () => {
        authMock.mockResolvedValue({ user: { org_id: "org-1", needs_onboarding: false } });
        getJsonMock.mockRejectedValue(new Error("backend down"));

        await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    });

    it("preserves team-trial intent for an onboarded user when C1 fails", async () => {
        authMock.mockResolvedValue({ user: { org_id: "org-1", needs_onboarding: false } });
        getJsonMock.mockRejectedValue(new Error("backend down"));

        await expect(renderPage({ plan: "team", trial: "true" })).rejects.toThrow(
            "NEXT_REDIRECT:/auth/trial-checkout?plan=team&trial=true",
        );
    });

    it("renders the legacy single page (no state read) when the flag is off", async () => {
        guidedOnboardingMock.mockReturnValue(false);

        const ui = await renderPage();
        render(ui as React.ReactElement);

        expect(screen.getByRole("heading", { name: "Set up your workspace" })).toBeInTheDocument();
        expect(screen.getByTestId("onboard-form")).toHaveAttribute("data-guided", "false");
        expect(getJsonMock).not.toHaveBeenCalled();
        expect(redirectMock).not.toHaveBeenCalled();
    });

    it("legacy flow sends already-onboarded users to the dashboard", async () => {
        guidedOnboardingMock.mockReturnValue(false);
        authMock.mockResolvedValue({ user: { org_id: "org-1", needs_onboarding: false } });

        await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    });
});
