import { afterEach, describe, expect, it, vi } from "vitest";

import { render, screen } from "@/test/utils";
import { CTA_LABELS } from "@/lib/design/cta";
import {
    FIRST_RUN_SYNC_PATH,
    connectGitHubHref,
} from "@/lib/onboarding/setupSurface";
import type { SetupStatus } from "@/lib/onboarding/types";

const emitOnboardingEvent = vi.fn();
vi.mock("@/lib/onboarding/telemetry", () => ({
    emitOnboardingEvent: (...args: unknown[]) => emitOnboardingEvent(...args),
}));

import { SetupBanner } from "./SetupBanner";

const baseStatus: SetupStatus = {
    has_integration: false,
    providers: [],
    has_sync_config: false,
    sync_config_id: null,
    first_sync_started: false,
    sync_status: "none",
    selected_repositories_count: 0,
    last_sync_error: null,
    can_start_sync: false,
    next_action: "connect_integration",
    blocker: null,
};

const status = (overrides: Partial<SetupStatus>): SetupStatus => ({
    ...baseStatus,
    ...overrides,
});

afterEach(() => {
    emitOnboardingEvent.mockClear();
});

describe("SetupBanner (CHAOS-2678, four C2 states)", () => {
    it("no integration → setup empty state, connect CTA, emits dashboard_viewed_without_integration", () => {
        render(<SetupBanner status={status({ next_action: "connect_integration" })} orgId="org-1" />);

        const banner = screen.getByTestId("setup-banner");
        expect(banner).toHaveAttribute("data-variant", "no-integration");

        const cta = screen.getByTestId("setup-banner-cta");
        expect(cta).toHaveTextContent(CTA_LABELS.connectGitHubApp);
        expect(cta).toHaveAttribute("href", connectGitHubHref());

        expect(emitOnboardingEvent).toHaveBeenCalledWith("dashboard_viewed_without_integration", {
            orgId: "org-1",
        });
    });

    it("skipped → non-blocking banner with connect CTA, no funnel emit", () => {
        render(<SetupBanner status={status({ next_action: "complete" })} orgId="org-1" />);

        const banner = screen.getByTestId("setup-banner");
        expect(banner).toHaveAttribute("data-variant", "skipped");
        expect(banner).toHaveAttribute("role", "status");
        expect(screen.getByText(/setup skipped/i)).toBeInTheDocument();

        const cta = screen.getByTestId("setup-banner-cta");
        expect(cta).toHaveTextContent(CTA_LABELS.connectGitHubApp);
        expect(cta).toHaveAttribute("href", connectGitHubHref());

        expect(emitOnboardingEvent).not.toHaveBeenCalled();
    });

    it("connected but unsynced → distinct sync-pending banner with continue CTA to the sync surface", () => {
        render(
            <SetupBanner
                status={status({
                    has_integration: true,
                    providers: ["github"],
                    sync_status: "pending",
                    next_action: "start_sync",
                })}
            />,
        );

        const banner = screen.getByTestId("setup-banner");
        expect(banner).toHaveAttribute("data-variant", "sync-pending");
        expect(screen.getByText(/first sync pending/i)).toBeInTheDocument();

        const cta = screen.getByTestId("setup-banner-cta");
        expect(cta).toHaveTextContent(CTA_LABELS.continueSetup);
        expect(cta).toHaveAttribute("href", FIRST_RUN_SYNC_PATH);

        expect(emitOnboardingEvent).not.toHaveBeenCalled();
    });

    it("failed → precise blocker from C2 with retry CTA to the sync surface", () => {
        render(
            <SetupBanner
                status={status({
                    has_integration: true,
                    sync_status: "failed",
                    blocker: "GitHub installation token expired.",
                    last_sync_error: "401 from GitHub",
                })}
            />,
        );

        const banner = screen.getByTestId("setup-banner");
        expect(banner).toHaveAttribute("data-variant", "sync-failed");
        // Blocker is preferred over last_sync_error.
        expect(screen.getByText("GitHub installation token expired.")).toBeInTheDocument();

        const cta = screen.getByTestId("setup-banner-cta");
        expect(cta).toHaveTextContent(CTA_LABELS.retry);
        expect(cta).toHaveAttribute("href", FIRST_RUN_SYNC_PATH);
    });

    it("falls back to last_sync_error when no blocker is present", () => {
        render(
            <SetupBanner
                status={status({
                    has_integration: true,
                    sync_status: "failed",
                    blocker: null,
                    last_sync_error: "Rate limited by GitHub",
                })}
            />,
        );
        expect(screen.getByText("Rate limited by GitHub")).toBeInTheDocument();
    });

    it("ready → renders nothing", () => {
        const { container } = render(
            <SetupBanner
                status={status({
                    has_integration: true,
                    sync_status: "complete",
                    next_action: "complete",
                })}
            />,
        );
        expect(screen.queryByTestId("setup-banner")).not.toBeInTheDocument();
        expect(container).toBeEmptyDOMElement();
    });
});
