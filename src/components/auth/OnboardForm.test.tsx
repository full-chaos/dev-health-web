import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithToaster, screen, userEvent, waitFor } from "@/test/utils";

const mockUpdate = vi.fn();
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
        update: mockUpdate,
    }),
}));

vi.mock("@/lib/origin", () => ({
    resolveOrigin: () => "http://localhost:8000",
}));

const mockTrack = vi.fn();
vi.mock("@/lib/onboarding/track", () => {
    const emitted = new Set<string>();
    return {
        trackOnboardingEvent: (...args: unknown[]) => mockTrack(...args),
        trackOnboardingEventOnce: (name: string, payload?: { orgId?: string | null }) => {
            const key = `${name}:${payload?.orgId ?? ""}`;
            if (emitted.has(key)) return;
            emitted.add(key);
            if (payload === undefined) {
                mockTrack(name);
            } else {
                mockTrack(name, payload);
            }
        },
        resetOnboardingOnceTracking: () => emitted.clear(),
    };
});

import { resetOnboardingOnceTracking } from "@/lib/onboarding/track";
import { OnboardForm } from "./OnboardForm";

describe("OnboardForm", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        mockUpdate.mockReset();
        mockTrack.mockReset();
        resetOnboardingOnceTracking();
    });

    it("renders org name field and submit button", () => {
        renderWithToaster(<OnboardForm />);

        expect(screen.getByLabelText("Organization Name")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Create Workspace" })).toBeInTheDocument();
    });

    it("renders placeholder text without the removed default-name hint", () => {
        renderWithToaster(<OnboardForm />);

        expect(screen.getByPlaceholderText("My Company")).toBeInTheDocument();
        expect(screen.queryByText(/Leave blank to use/i)).not.toBeInTheDocument();
    });

    it("does not emit funnel events in legacy (non-guided) mode", () => {
        renderWithToaster(<OnboardForm />);

        expect(mockTrack).not.toHaveBeenCalled();
    });

    it("submits with org name and redirects", async () => {
        mockUpdate.mockResolvedValue({ user: { org_id: "org-123" } });
        const fetchSpy = vi.spyOn(global, "fetch");
        fetchSpy.mockResolvedValue(
            new Response(
                JSON.stringify({
                    access_token: "new-access-token",
                    refresh_token: "new-refresh-token",
                    org_id: "org-123",
                    role: "owner",
                    expires_in: 3600,
                }),
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                },
            ),
        );

        renderWithToaster(<OnboardForm />);
        const user = userEvent.setup();

        await user.type(screen.getByLabelText("Organization Name"), "Test Org");
        await user.click(screen.getByRole("button", { name: "Create Workspace" }));

        await waitFor(() => {
            expect(mockUpdate).toHaveBeenCalledWith({
                onboardComplete: {
                    access_token: "new-access-token",
                    refresh_token: "new-refresh-token",
                    org_id: "org-123",
                    role: "owner",
                    expires_in: 3600,
                },
            });
            expect(locationHref).toBe("/dashboard");
        });
    });

    it("redirects to trial checkout when team trial intent is present", async () => {
        mockUpdate.mockResolvedValue({ user: { org_id: "org-123" } });
        const fetchSpy = vi.spyOn(global, "fetch");
        fetchSpy.mockResolvedValue(
            new Response(
                JSON.stringify({
                    access_token: "new-access-token",
                    refresh_token: "new-refresh-token",
                    org_id: "org-123",
                    role: "owner",
                    expires_in: 3600,
                }),
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                },
            ),
        );

        renderWithToaster(<OnboardForm plan="team" trialIntent />);
        const user = userEvent.setup();

        await user.type(screen.getByLabelText("Organization Name"), "Trial Org");
        await user.click(screen.getByRole("button", { name: "Create Workspace" }));

        await waitFor(() => {
            expect(locationHref).toBe("/auth/trial-checkout?plan=team&trial=true");
        });
    });

    it("submits blank name (uses default)", async () => {
        mockUpdate.mockResolvedValue({ user: { org_id: "org-123" } });
        const fetchSpy = vi.spyOn(global, "fetch");
        fetchSpy.mockResolvedValue(
            new Response(
                JSON.stringify({
                    access_token: "new-access-token",
                    refresh_token: "new-refresh-token",
                    org_id: "org-123",
                    role: "owner",
                    expires_in: 3600,
                }),
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                },
            ),
        );

        renderWithToaster(<OnboardForm />);
        const user = userEvent.setup();
        await user.click(screen.getByRole("button", { name: "Create Workspace" }));

        await waitFor(() => {
            expect(fetchSpy).toHaveBeenCalledTimes(1);
        });

        const options = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
        const body = options?.body;
        const parsedBody =
            typeof body === "string"
                ? (JSON.parse(body) as { org_name?: string; action: string })
                : null;

        expect(parsedBody).toEqual({ action: "create_org" });
        expect(parsedBody?.org_name).toBeUndefined();
    });

    it("shows server error", async () => {
        const fetchSpy = vi.spyOn(global, "fetch");
        fetchSpy.mockResolvedValue(
            new Response(JSON.stringify({ detail: "Org limit reached" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            }),
        );

        renderWithToaster(<OnboardForm />);
        const user = userEvent.setup();

        await user.click(screen.getByRole("button", { name: "Create Workspace" }));

        await waitFor(() => {
            expect(screen.getByText("Org limit reached")).toBeInTheDocument();
        });
    });

    it("shows generic error on network failure", async () => {
        const fetchSpy = vi.spyOn(global, "fetch");
        fetchSpy.mockRejectedValue(new Error("Network error"));

        renderWithToaster(<OnboardForm />);
        const user = userEvent.setup();

        await user.click(screen.getByRole("button", { name: "Create Workspace" }));

        await waitFor(() => {
            expect(screen.getByText("An error occurred. Please try again.")).toBeInTheDocument();
        });
    });

    it("shows rate limit message on 429", async () => {
        const fetchSpy = vi.spyOn(global, "fetch");
        fetchSpy.mockResolvedValue(
            new Response("Rate limit exceeded", {
                status: 429,
                headers: { "Content-Type": "text/plain" },
            }),
        );

        renderWithToaster(<OnboardForm />);
        const user = userEvent.setup();

        await user.click(screen.getByRole("button", { name: "Create Workspace" }));

        await waitFor(() => {
            expect(
                screen.getByText("Too many requests. Please try again later."),
            ).toBeInTheDocument();
        });
    });

    it("handles non-JSON error body", async () => {
        const fetchSpy = vi.spyOn(global, "fetch");
        fetchSpy.mockResolvedValue(
            new Response("Internal Server Error", {
                status: 500,
                headers: { "Content-Type": "text/plain" },
            }),
        );

        renderWithToaster(<OnboardForm />);
        const user = userEvent.setup();

        await user.click(screen.getByRole("button", { name: "Create Workspace" }));

        await waitFor(() => {
            expect(screen.getByText("Failed to create workspace")).toBeInTheDocument();
        });
    });

    it("emits workspace_setup_started on mount in guided mode", () => {
        renderWithToaster(<OnboardForm guided />);

        expect(mockTrack).toHaveBeenCalledWith("workspace_setup_started");
    });

    it("emits workspace_created and routes to the integration step in guided mode", async () => {
        mockUpdate.mockResolvedValue({ user: { org_id: "org-123" } });
        const fetchSpy = vi.spyOn(global, "fetch");
        fetchSpy.mockResolvedValue(
            new Response(
                JSON.stringify({
                    access_token: "new-access-token",
                    refresh_token: "new-refresh-token",
                    org_id: "org-123",
                    role: "owner",
                    expires_in: 3600,
                }),
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                },
            ),
        );

        renderWithToaster(<OnboardForm guided />);
        const user = userEvent.setup();
        await user.click(screen.getByRole("button", { name: "Create Workspace" }));

        await waitFor(() => {
            expect(mockTrack).toHaveBeenCalledWith("workspace_created", { orgId: "org-123" });
            expect(locationHref).toBe("/auth/onboard/integration");
        });
    });

    it("routes guided team trials through the integration step (trial intent preserved)", async () => {
        mockUpdate.mockResolvedValue({ user: { org_id: "org-123" } });
        const fetchSpy = vi.spyOn(global, "fetch");
        fetchSpy.mockResolvedValue(
            new Response(
                JSON.stringify({
                    access_token: "new-access-token",
                    refresh_token: "new-refresh-token",
                    org_id: "org-123",
                    role: "owner",
                    expires_in: 3600,
                }),
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                },
            ),
        );

        renderWithToaster(<OnboardForm plan="team" trialIntent guided />);
        const user = userEvent.setup();
        await user.click(screen.getByRole("button", { name: "Create Workspace" }));

        await waitFor(() => {
            // Guided onboarding must NOT bypass the integration step: the trial
            // intent rides along as query params and is resolved at completion.
            expect(locationHref).toBe("/auth/onboard/integration?plan=team&trial=true");
        });
    });
});
