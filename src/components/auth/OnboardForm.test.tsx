import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithToaster, screen, userEvent, waitFor } from "@/test/utils";

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

// The page session carries no token (CHAOS-12088); the form never needs one.
vi.mock("next-auth/react", () => ({
    useSession: () => ({ data: { user: { id: "user-1" } }, status: "authenticated" }),
}));

const mockCreateWorkspace = vi.fn();
vi.mock("@/lib/onboarding/actions", () => ({
    createWorkspace: (...args: unknown[]) => mockCreateWorkspace(...args),
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

const created = { ok: true, orgId: "org-123" } as const;

describe("OnboardForm", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        mockCreateWorkspace.mockReset();
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

    it("creates the workspace through the server action and redirects, with no browser call", async () => {
        mockCreateWorkspace.mockResolvedValue(created);
        const fetchSpy = vi.spyOn(global, "fetch");

        renderWithToaster(<OnboardForm />);
        const user = userEvent.setup();

        await user.type(screen.getByLabelText("Organization Name"), "Test Org");
        await user.click(screen.getByRole("button", { name: "Create Workspace" }));

        await waitFor(() => {
            expect(mockCreateWorkspace).toHaveBeenCalledWith("Test Org");
            expect(locationHref).toBe("/dashboard");
        });
        // CHAOS-12088: no request from the page carries a token; the action holds it.
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("redirects to trial checkout when team trial intent is present", async () => {
        mockCreateWorkspace.mockResolvedValue(created);

        renderWithToaster(<OnboardForm plan="team" trialIntent />);
        const user = userEvent.setup();

        await user.type(screen.getByLabelText("Organization Name"), "Trial Org");
        await user.click(screen.getByRole("button", { name: "Create Workspace" }));

        await waitFor(() => {
            expect(locationHref).toBe("/auth/trial-checkout?plan=team&trial=true");
        });
    });

    it("submits a blank name as blank (the backend picks the default)", async () => {
        mockCreateWorkspace.mockResolvedValue(created);

        renderWithToaster(<OnboardForm />);
        const user = userEvent.setup();
        await user.click(screen.getByRole("button", { name: "Create Workspace" }));

        await waitFor(() => {
            expect(mockCreateWorkspace).toHaveBeenCalledTimes(1);
        });
        expect(mockCreateWorkspace).toHaveBeenCalledWith("");
    });

    it("shows the validation detail of a refusal", async () => {
        mockCreateWorkspace.mockResolvedValue({
            ok: false,
            status: 400,
            detail: "Org limit reached",
        });

        renderWithToaster(<OnboardForm />);
        const user = userEvent.setup();

        await user.click(screen.getByRole("button", { name: "Create Workspace" }));

        await waitFor(() => {
            expect(screen.getByText("Org limit reached")).toBeInTheDocument();
        });
        expect(locationHref).toBe("");
    });

    it("shows generic error when the action call fails", async () => {
        mockCreateWorkspace.mockRejectedValue(new Error("Network error"));

        renderWithToaster(<OnboardForm />);
        const user = userEvent.setup();

        await user.click(screen.getByRole("button", { name: "Create Workspace" }));

        await waitFor(() => {
            expect(screen.getByText("An error occurred. Please try again.")).toBeInTheDocument();
        });
    });

    it("shows rate limit message on 429", async () => {
        mockCreateWorkspace.mockResolvedValue({ ok: false, status: 429 });

        renderWithToaster(<OnboardForm />);
        const user = userEvent.setup();

        await user.click(screen.getByRole("button", { name: "Create Workspace" }));

        await waitFor(() => {
            expect(
                screen.getByText("Too many requests. Please try again later."),
            ).toBeInTheDocument();
        });
    });

    it("shows the generic failure when no answer or a server error came back", async () => {
        mockCreateWorkspace.mockResolvedValue({ ok: false, status: null });

        renderWithToaster(<OnboardForm />);
        const user = userEvent.setup();

        await user.click(screen.getByRole("button", { name: "Create Workspace" }));

        await waitFor(() => {
            expect(screen.getByText("Failed to create workspace")).toBeInTheDocument();
        });
    });

    it("never shows the detail of a non-validation refusal", async () => {
        mockCreateWorkspace.mockResolvedValue({ ok: false, status: 500, detail: "stack trace" });

        renderWithToaster(<OnboardForm />);
        const user = userEvent.setup();

        await user.click(screen.getByRole("button", { name: "Create Workspace" }));

        await waitFor(() => {
            expect(screen.getByText("Failed to create workspace")).toBeInTheDocument();
        });
        expect(screen.queryByText("stack trace")).not.toBeInTheDocument();
    });

    it("emits workspace_setup_started on mount in guided mode", () => {
        renderWithToaster(<OnboardForm guided />);

        expect(mockTrack).toHaveBeenCalledWith("workspace_setup_started");
    });

    it("emits workspace_created and routes to the integration step in guided mode", async () => {
        mockCreateWorkspace.mockResolvedValue(created);

        renderWithToaster(<OnboardForm guided />);
        const user = userEvent.setup();
        await user.click(screen.getByRole("button", { name: "Create Workspace" }));

        await waitFor(() => {
            expect(mockTrack).toHaveBeenCalledWith("workspace_created", { orgId: "org-123" });
            expect(locationHref).toBe("/auth/onboard/integration");
        });
    });

    it("routes guided team trials through the integration step (trial intent preserved)", async () => {
        mockCreateWorkspace.mockResolvedValue(created);

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
