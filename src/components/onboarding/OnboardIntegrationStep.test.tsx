import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, userEvent, waitFor } from "@/test/utils";

const mockTrack = vi.fn();
let locationHref = "";

beforeEach(() => {
    locationHref = "";
    Object.defineProperty(window, "location", {
        value: { ...window.location, href: "" },
        writable: true,
        configurable: true,
    });
    Object.defineProperty(window.location, "href", {
        set: (v: string) => {
            locationHref = v;
        },
        get: () => locationHref || "http://localhost:3000/",
        configurable: true,
    });
});

vi.mock("next-auth/react", () => ({
    useSession: () => ({
        data: { access_token: "test-token" },
        status: "authenticated",
    }),
}));

vi.mock("@/lib/origin", () => ({
    resolveOrigin: () => "http://localhost:8000",
}));

vi.mock("@/lib/onboarding/track", () => ({
    trackOnboardingEvent: (...args: unknown[]) => mockTrack(...args),
}));

import { OnboardIntegrationStep } from "./OnboardIntegrationStep";

describe("OnboardIntegrationStep", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        mockTrack.mockReset();
    });

    it("emits integration_step_viewed on mount with the org id", () => {
        render(<OnboardIntegrationStep orgId="org-123" />);

        expect(mockTrack).toHaveBeenCalledWith("integration_step_viewed", { orgId: "org-123" });
    });

    it("leads with the GitHub App CTA carrying a return_to back to this step", () => {
        render(<OnboardIntegrationStep orgId="org-123" />);

        const cta = screen.getByRole("link", { name: "Connect GitHub App" });
        expect(cta).toHaveAttribute(
            "href",
            "/org/admin/integrations/github-app/install?return_to=%2Fauth%2Fonboard%2Fintegration",
        );
    });

    it("explains integrations power PR, review, delivery, and engineering-health metrics", () => {
        render(<OnboardIntegrationStep orgId="org-123" />);

        expect(
            screen.getByText(/pull-request flow, review\s+load, delivery, and engineering-health/i),
        ).toBeInTheDocument();
    });

    it("offers secondary providers and a manual token option", () => {
        render(<OnboardIntegrationStep orgId="org-123" />);

        expect(screen.getByRole("link", { name: /Connect GitLab/ })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Connect Jira/ })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Connect Linear/ })).toBeInTheDocument();
        expect(
            screen.getByRole("link", { name: /Use a personal access token/ }),
        ).toBeInTheDocument();
    });

    it("emits github_app_install_started when the GitHub App CTA is activated", async () => {
        render(<OnboardIntegrationStep orgId="org-123" />);
        const user = userEvent.setup();

        await user.click(screen.getByRole("link", { name: "Connect GitHub App" }));
        expect(mockTrack).toHaveBeenCalledWith("github_app_install_started", { orgId: "org-123" });
    });

    it("skips: emits integration_skipped, persists via the API, and advances to completion", async () => {
        const fetchSpy = vi.spyOn(global, "fetch");
        fetchSpy.mockResolvedValue(new Response("{}", { status: 200 }));

        render(<OnboardIntegrationStep orgId="org-123" />);
        const user = userEvent.setup();

        await user.click(screen.getByRole("button", { name: "Skip for now" }));

        await waitFor(() => {
            expect(mockTrack).toHaveBeenCalledWith("integration_skipped", { orgId: "org-123" });
            expect(locationHref).toBe("/auth/onboard/complete");
        });

        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toContain("/auth/onboarding/skip-integration");
        expect(init.method).toBe("POST");
        expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
    });

    it("surfaces an error when the skip request fails and stays on the step", async () => {
        const fetchSpy = vi.spyOn(global, "fetch");
        fetchSpy.mockResolvedValue(new Response("nope", { status: 500 }));

        render(<OnboardIntegrationStep orgId="org-123" />);
        const user = userEvent.setup();

        await user.click(screen.getByRole("button", { name: "Skip for now" }));

        await waitFor(() => {
            expect(screen.getByRole("alert")).toHaveTextContent(/couldn't skip/i);
        });
        expect(locationHref).toBe("");
    });

    it("renders the connected state with a continue action and no skip", () => {
        render(<OnboardIntegrationStep orgId="org-123" connected />);

        expect(screen.getByRole("status")).toHaveTextContent(/first integration is connected/i);
        expect(screen.getByRole("link", { name: "Continue" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Skip for now" })).not.toBeInTheDocument();
    });

    it("renders the skipped state with a continue action", () => {
        render(<OnboardIntegrationStep orgId="org-123" skipped />);

        expect(screen.getByText(/You skipped this earlier/i)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Continue" })).toBeInTheDocument();
    });

    it("preserves trial intent in the completion link", () => {
        render(<OnboardIntegrationStep orgId="org-123" connected trialIntent />);

        expect(screen.getByRole("link", { name: "Continue" })).toHaveAttribute(
            "href",
            "/auth/onboard/complete?plan=team&trial=true",
        );
    });
});
