import { afterEach, describe, expect, it, vi } from "vitest";

import { render, screen, userEvent } from "@/test/utils";
import { CTA_LABELS } from "@/lib/design/cta";
import {
    GITHUB_INTEGRATION_PATH,
    connectGitHubHref,
} from "@/lib/onboarding/setupSurface";
import type { SetupStatus } from "@/lib/onboarding/types";

const emitOnboardingEvent = vi.fn();
vi.mock("@/lib/onboarding/telemetry", () => ({
    emitOnboardingEvent: (...args: unknown[]) => emitOnboardingEvent(...args),
}));

import { FirstRunSync } from "./FirstRunSync";

const baseStatus: SetupStatus = {
    has_integration: true,
    providers: ["github"],
    has_sync_config: true,
    sync_config_id: "sync-1",
    first_sync_started: false,
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
});

describe("FirstRunSync (CHAOS-2681 / CHAOS-2683)", () => {
    it("emits github_app_connected once on a connected arrival", () => {
        render(<FirstRunSync status={status({})} arrival="connected" orgId="org-1" />);
        expect(emitOnboardingEvent).toHaveBeenCalledWith("github_app_connected", {
            orgId: "org-1",
        });
        expect(
            emitOnboardingEvent.mock.calls.filter((c) => c[0] === "github_app_connected"),
        ).toHaveLength(1);
    });

    it("ready-to-sync → Start sync emits first_sync_started only after the click, then shows syncing", async () => {
        const user = userEvent.setup();
        render(<FirstRunSync status={status({})} orgId="org-1" />);

        expect(screen.getByTestId("first-run-sync")).toHaveAttribute("data-phase", "ready-to-sync");
        // Not emitted before explicit confirmation.
        expect(
            emitOnboardingEvent.mock.calls.some((c) => c[0] === "first_sync_started"),
        ).toBe(false);

        await user.click(screen.getByTestId("first-run-sync-start"));

        expect(emitOnboardingEvent).toHaveBeenCalledWith("first_sync_started", {
            orgId: "org-1",
        });
        expect(screen.getByTestId("first-run-sync")).toHaveAttribute("data-phase", "syncing");
    });

    it("select-repos → routes to repository selection, not a dead credential page", () => {
        render(
            <FirstRunSync
                status={status({ next_action: "select_repositories", can_start_sync: false })}
            />,
        );
        const link = screen.getByRole("link", { name: CTA_LABELS.selectRepositories });
        expect(link).toHaveAttribute("href", GITHUB_INTEGRATION_PATH);
    });

    it("running sync renders the syncing state", () => {
        render(<FirstRunSync status={status({ sync_status: "running", first_sync_started: true })} />);
        expect(screen.getByTestId("first-run-sync")).toHaveAttribute("data-phase", "syncing");
    });

    it("failed → shows the precise blocker and offers a recoverable retry", async () => {
        const user = userEvent.setup();
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
        expect(
            screen.getByText("GitHub rate limit hit during initial sync."),
        ).toBeInTheDocument();

        await user.click(screen.getByTestId("first-run-sync-retry"));
        expect(emitOnboardingEvent).toHaveBeenCalledWith("first_sync_started", {
            orgId: "org-1",
        });
    });

    it("complete → emits onboarding_completed and offers a return to the cockpit", () => {
        render(
            <FirstRunSync
                status={status({ sync_status: "complete", next_action: "complete" })}
                orgId="org-1"
            />,
        );
        expect(screen.getByTestId("first-run-sync")).toHaveAttribute("data-phase", "complete");
        expect(emitOnboardingEvent).toHaveBeenCalledWith("onboarding_completed", {
            orgId: "org-1",
        });
        expect(screen.getByRole("link", { name: CTA_LABELS.backToCockpit })).toHaveAttribute(
            "href",
            "/dashboard",
        );
    });

    it("arrival error → recoverable connect prompt without restarting onboarding", () => {
        render(<FirstRunSync status={status({ has_integration: false })} arrival="error" />);
        expect(screen.getByTestId("first-run-sync")).toHaveAttribute(
            "data-phase",
            "connect-error",
        );
        expect(screen.getByRole("link", { name: CTA_LABELS.connectGitHubApp })).toHaveAttribute(
            "href",
            connectGitHubHref(),
        );
        // No funnel completion emitted on an error arrival.
        expect(
            emitOnboardingEvent.mock.calls.some((c) => c[0] === "onboarding_completed"),
        ).toBe(false);
    });

    it("no integration → connect prompt", () => {
        render(<FirstRunSync status={status({ has_integration: false, sync_status: "none" })} />);
        expect(screen.getByTestId("first-run-sync")).toHaveAttribute("data-phase", "connect");
    });
});
