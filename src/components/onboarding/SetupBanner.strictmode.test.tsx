import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendBeacon = vi.fn();
vi.mock("@/lib/apiClient", () => ({
    apiClient: {
        sendBeacon: (...args: unknown[]) => sendBeacon(...args),
        request: vi.fn().mockResolvedValue(new Response("{}")),
    },
}));

import { render } from "@/test/utils";
import { resetOnboardingOnceTracking } from "@/lib/onboarding/track";
import { resetTelemetryForTests } from "@/lib/telemetry";
import type { SetupStatus } from "@/lib/onboarding/types";

import { SetupBanner } from "./SetupBanner";

// Intentionally does NOT mock track.ts: it exercises the real once-dedupe so a
// StrictMode double-mount cannot send the funnel event twice (CHAOS-2683).

const ORIGINAL_TELEMETRY_ENABLED = process.env.NEXT_PUBLIC_TELEMETRY_ENABLED;

const noIntegration: SetupStatus = {
    has_integration: false,
    providers: [],
    has_sync_config: false,
    sync_config_id: null,
    first_sync_started: false,
    first_sync_completed: false,
    sync_status: "none",
    selected_repositories_count: 0,
    last_sync_error: null,
    can_start_sync: false,
    next_action: "connect_integration",
    blocker: null,
};

describe("SetupBanner telemetry under React StrictMode (CHAOS-2683)", () => {
    beforeEach(() => {
        delete process.env.NEXT_PUBLIC_TELEMETRY_ENABLED;
        sendBeacon.mockReset().mockReturnValue(true);
        resetOnboardingOnceTracking();
        resetTelemetryForTests();
    });

    afterEach(() => {
        if (ORIGINAL_TELEMETRY_ENABLED === undefined) {
            delete process.env.NEXT_PUBLIC_TELEMETRY_ENABLED;
        } else {
            process.env.NEXT_PUBLIC_TELEMETRY_ENABLED = ORIGINAL_TELEMETRY_ENABLED;
        }
        vi.restoreAllMocks();
        resetOnboardingOnceTracking();
    });

    it("sends dashboard_viewed_without_integration exactly once across a StrictMode remount", () => {
        // This test environment does not double-invoke effects, so the remount that
        // StrictMode performs in development is done by hand: mount, unmount, mount.
        const tree = (
            <StrictMode>
                <SetupBanner status={noIntegration} orgId="org-1" />
            </StrictMode>
        );
        const first = render(tree);
        first.unmount();
        render(tree);

        expect(sendBeacon).toHaveBeenCalledTimes(1);
        const [url, raw] = sendBeacon.mock.calls[0] as [string, string];
        expect(url).toBe("/api/v1/product-telemetry/events");
        const body = JSON.parse(raw) as {
            orgIdHash: string | null;
            events: { name: string; payload: Record<string, unknown> }[];
        };
        expect(body.events).toHaveLength(1);
        expect(body.events[0].name).toBe("feature_viewed");
        expect(body.events[0].payload.surface).toBe("dashboard_viewed_without_integration");
        expect(body.orgIdHash).toMatch(/^fnv1a-[0-9a-f]{8}$/);
        expect(raw).not.toContain("org-1");
    });
});
