import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import type { OnboardingState } from "@/lib/onboarding/types";

const redirectMock = vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
});
const authMock = vi.fn();
const guidedOnboardingMock = vi.fn();
const getJsonMock = vi.fn();
const stepProps = vi.fn();

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

vi.mock("@/components/onboarding/OnboardIntegrationStep", () => ({
    OnboardIntegrationStep: (props: Record<string, unknown>) => {
        stepProps(props);
        return <div data-testid="integration-step">integration step stub</div>;
    },
}));

import OnboardIntegrationPage from "./page";

function state(overrides: Partial<OnboardingState> = {}): OnboardingState {
    return {
        needs_onboarding: true,
        org_created: true,
        org_id: "org-1",
        org_name: "Acme",
        first_integration_connected: false,
        integration_skipped: false,
        recommended_provider: "github",
        next_step: "integration",
        blocker: null,
        ...overrides,
    };
}

async function renderPage(params: Record<string, string> = {}) {
    return OnboardIntegrationPage({ searchParams: Promise.resolve(params) });
}

describe("OnboardIntegrationPage", () => {
    beforeEach(() => {
        authMock.mockResolvedValue({ user: { org_id: "org-1", needs_onboarding: true } });
        guidedOnboardingMock.mockReturnValue(true);
        getJsonMock.mockResolvedValue(state());
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

    it("renders the integration step seeded from the onboarding state", async () => {
        getJsonMock.mockResolvedValue(
            state({ first_integration_connected: true, integration_skipped: false }),
        );

        const ui = await renderPage();
        render(ui as React.ReactElement);

        expect(screen.getByRole("heading", { name: "Connect your tools" })).toBeInTheDocument();
        expect(screen.getByTestId("integration-step")).toBeInTheDocument();
        expect(getJsonMock).toHaveBeenCalledWith("/api/v1/auth/onboarding/state");
        expect(stepProps).toHaveBeenCalledWith(
            expect.objectContaining({ connected: true, orgId: "org-1" }),
        );
    });

    it("passes the github_app callback result through to the step", async () => {
        const ui = await renderPage({ github_app: "error" });
        render(ui as React.ReactElement);

        expect(stepProps).toHaveBeenCalledWith(expect.objectContaining({ result: "error" }));
    });

    it("forwards trial intent to the step", async () => {
        const ui = await renderPage({ plan: "team", trial: "true" });
        render(ui as React.ReactElement);

        expect(stepProps).toHaveBeenCalledWith(expect.objectContaining({ trialIntent: true }));
    });

    it("redirects to the aligned step when C1 says the user is on a different step", async () => {
        getJsonMock.mockResolvedValue(state({ next_step: "complete" }));

        await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT:/auth/onboard/complete");
        expect(getJsonMock).toHaveBeenCalledWith("/api/v1/auth/onboarding/state");
    });

    it("sends an already-onboarded user to the dashboard when C1 fails", async () => {
        authMock.mockResolvedValue({ user: { org_id: "org-1", needs_onboarding: false } });
        getJsonMock.mockRejectedValue(new Error("backend down"));

        await expect(renderPage()).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    });
});
