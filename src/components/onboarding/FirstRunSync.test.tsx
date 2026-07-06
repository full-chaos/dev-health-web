import { afterEach, describe, expect, it, vi } from "vitest";

import { render, screen, userEvent, waitFor } from "@/test/utils";
import { CTA_LABELS } from "@/lib/design/cta";
import { connectGitHubHref, repoSelectionHref } from "@/lib/onboarding/setupSurface";
import type { SetupStatus } from "@/lib/onboarding/types";

const emitOnboardingEvent = vi.fn();
const emitOnboardingEventOnce = vi.fn();
vi.mock("@/lib/onboarding/telemetry", () => ({
    emitOnboardingEvent: (...args: unknown[]) => emitOnboardingEvent(...args),
    emitOnboardingEventOnce: (...args: unknown[]) => emitOnboardingEventOnce(...args),
}));

const triggerSync = vi.fn();
vi.mock("@/lib/admin/server", () => ({
    triggerSync: (...args: unknown[]) => triggerSync(...args),
}));

import { FirstRunSync } from "./FirstRunSync";

const baseStatus: SetupStatus = {
    has_integration: true,
    providers: ["github"],
    has_sync_config: true,
    sync_config_id: "sync-1",
    first_sync_started: false,
    first_sync_completed: false,
    sync_status: "pending",
    selected_repositories_count: 3,
    last_sync_error: null,
    can_start_sync: true,
    next_action: "start_sync",
    blocker: null,
};

const status = (overrides: Partial<SetupStatus>): SetupStatus => ({
    ...baseStatus,
    ...overrides,
});

afterEach(() => {
    emitOnboardingEvent.mockClear();
    emitOnboardingEventOnce.mockClear();
    triggerSync.mockReset();
});

describe("FirstRunSync (CHAOS-2681 / CHAOS-2683)", () => {
    it("emits github_app_connected once (deduped) on a connected arrival", () => {
        render(<FirstRunSync status={status({})} arrival="connected" orgId="org-1" />);
        expect(emitOnboardingEventOnce).toHaveBeenCalledWith(
            "github_app_connected:org-1",
            "github_app_connected",
            { orgId: "org-1" },
        );
    });

    it("ready-to-sync → Start sync triggers the backend, then emits first_sync_started and shows syncing", async () => {
        const user = userEvent.setup();
        triggerSync.mockResolvedValue({ data: { status: "triggered", sync_run_id: "run-1" } });
        render(<FirstRunSync status={status({})} orgId="org-1" />);

        expect(screen.getByTestId("first-run-sync")).toHaveAttribute("data-phase", "ready-to-sync");
        // Not emitted before explicit confirmation.
        expect(emitOnboardingEvent.mock.calls.some((c) => c[0] === "first_sync_started")).toBe(
            false,
        );

        await user.click(screen.getByTestId("first-run-sync-start"));

        // The backend trigger is actually invoked with the sync config id.
        expect(triggerSync).toHaveBeenCalledWith("sync-1");
        await waitFor(() =>
            expect(emitOnboardingEvent).toHaveBeenCalledWith("first_sync_started", {
                orgId: "org-1",
            }),
        );
        await waitFor(() =>
            expect(screen.getByTestId("first-run-sync")).toHaveAttribute("data-phase", "syncing"),
        );
    });

    it("does NOT emit or navigate when the backend trigger fails — surfaces the error", async () => {
        const user = userEvent.setup();
        triggerSync.mockResolvedValue({ error: "Sync service unavailable" });
        render(<FirstRunSync status={status({})} orgId="org-1" />);

        await user.click(screen.getByTestId("first-run-sync-start"));

        expect(triggerSync).toHaveBeenCalledWith("sync-1");
        await screen.findByTestId("first-run-sync-submit-error");
        expect(screen.getByTestId("first-run-sync-submit-error")).toHaveTextContent(
            "Sync service unavailable",
        );
        expect(emitOnboardingEvent.mock.calls.some((c) => c[0] === "first_sync_started")).toBe(
            false,
        );
        // Stays on the ready-to-sync surface so the user can retry.
        expect(screen.getByTestId("first-run-sync")).toHaveAttribute("data-phase", "ready-to-sync");
    });

    it("guards Start sync when the backend says it is not startable yet", async () => {
        const user = userEvent.setup();
        render(<FirstRunSync status={status({ can_start_sync: false, sync_config_id: null })} />);

        // can_start_sync false + start_sync action still renders the start affordance.
        await user.click(screen.getByTestId("first-run-sync-start"));

        expect(triggerSync).not.toHaveBeenCalled();
        expect(await screen.findByTestId("first-run-sync-submit-error")).toBeInTheDocument();
        expect(emitOnboardingEvent.mock.calls.some((c) => c[0] === "first_sync_started")).toBe(
            false,
        );
    });

    it("select-repos → routes to the real sync-config/repo-selection flow, not a credential page", () => {
        render(
            <FirstRunSync
                status={status({ next_action: "select_repositories", can_start_sync: false })}
            />,
        );
        const link = screen.getByRole("link", { name: CTA_LABELS.selectRepositories });
        expect(link).toHaveAttribute("href", repoSelectionHref("sync-1"));
        expect(link).toHaveAttribute("href", "/org/admin/sync/sync-1/edit");
    });

    it("select-repos with no sync config routes to the new-config wizard", () => {
        render(
            <FirstRunSync
                status={status({
                    next_action: "select_repositories",
                    can_start_sync: false,
                    sync_config_id: null,
                    has_sync_config: false,
                })}
            />,
        );
        const link = screen.getByRole("link", { name: CTA_LABELS.selectRepositories });
        expect(link).toHaveAttribute("href", "/org/admin/sync/new");
    });

    it("running sync renders the syncing state", () => {
        render(
            <FirstRunSync status={status({ sync_status: "running", first_sync_started: true })} />,
        );
        expect(screen.getByTestId("first-run-sync")).toHaveAttribute("data-phase", "syncing");
    });

    it("failed → shows the precise blocker and offers a recoverable retry that re-triggers", async () => {
        const user = userEvent.setup();
        triggerSync.mockResolvedValue({ data: { status: "triggered", sync_run_id: "run-2" } });
        render(
            <FirstRunSync
                status={status({
                    sync_status: "failed",
                    blocker: "GitHub rate limit hit during initial sync.",
                })}
                orgId="org-1"
            />,
        );

        expect(screen.getByTestId("first-run-sync")).toHaveAttribute("data-phase", "failed");
        expect(screen.getByText("GitHub rate limit hit during initial sync.")).toBeInTheDocument();

        await user.click(screen.getByTestId("first-run-sync-retry"));
        expect(triggerSync).toHaveBeenCalledWith("sync-1");
        await waitFor(() =>
            expect(emitOnboardingEvent).toHaveBeenCalledWith("first_sync_started", {
                orgId: "org-1",
            }),
        );
    });

    it("complete → emits onboarding_completed once and offers a return to the cockpit", () => {
        render(
            <FirstRunSync
                status={status({
                    first_sync_completed: true,
                    sync_status: "complete",
                    next_action: "complete",
                })}
                orgId="org-1"
            />,
        );
        expect(screen.getByTestId("first-run-sync")).toHaveAttribute("data-phase", "complete");
        expect(emitOnboardingEventOnce).toHaveBeenCalledWith(
            "onboarding_completed:org-1",
            "onboarding_completed",
            { orgId: "org-1" },
        );
        expect(screen.getByRole("link", { name: CTA_LABELS.backToCockpit })).toHaveAttribute(
            "href",
            "/dashboard",
        );
    });

    it("later running sync stays complete after the first sync completed", () => {
        render(
            <FirstRunSync
                status={status({
                    first_sync_started: true,
                    first_sync_completed: true,
                    sync_status: "running",
                    next_action: "complete",
                })}
                orgId="org-1"
            />,
        );

        expect(screen.getByTestId("first-run-sync")).toHaveAttribute("data-phase", "complete");
    });

    it("arrival error → recoverable connect prompt without restarting onboarding", () => {
        render(<FirstRunSync status={status({ has_integration: false })} arrival="error" />);
        expect(screen.getByTestId("first-run-sync")).toHaveAttribute("data-phase", "connect-error");
        expect(screen.getByRole("link", { name: CTA_LABELS.connectGitHubApp })).toHaveAttribute(
            "href",
            connectGitHubHref(),
        );
        // No funnel completion emitted on an error arrival.
        expect(
            emitOnboardingEventOnce.mock.calls.some((c) => c[1] === "onboarding_completed"),
        ).toBe(false);
    });

    it("no integration → connect prompt", () => {
        render(<FirstRunSync status={status({ has_integration: false, sync_status: "none" })} />);
        expect(screen.getByTestId("first-run-sync")).toHaveAttribute("data-phase", "connect");
    });
});
