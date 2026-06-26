import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test/utils";
import {
    ONBOARDING_TELEMETRY_EVENT,
    resetOnboardingTelemetryDedup,
} from "@/lib/onboarding/telemetry";
import type { SetupStatus } from "@/lib/onboarding/types";

import { SetupBanner } from "./SetupBanner";

// Intentionally does NOT mock telemetry — exercises the real module-level dedup
// so a StrictMode double-mount can't double-fire the funnel event (CHAOS-2683).

const ORIGINAL_TELEMETRY_ENABLED = process.env.NEXT_PUBLIC_TELEMETRY_ENABLED;

const noIntegration: SetupStatus = {
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

describe("SetupBanner telemetry under React StrictMode (CHAOS-2683)", () => {
    beforeEach(() => {
        delete process.env.NEXT_PUBLIC_TELEMETRY_ENABLED;
        resetOnboardingTelemetryDedup();
    });

    afterEach(() => {
        if (ORIGINAL_TELEMETRY_ENABLED === undefined) {
            delete process.env.NEXT_PUBLIC_TELEMETRY_ENABLED;
        } else {
            process.env.NEXT_PUBLIC_TELEMETRY_ENABLED = ORIGINAL_TELEMETRY_ENABLED;
        }
        vi.restoreAllMocks();
        resetOnboardingTelemetryDedup();
    });

    it("emits dashboard_viewed_without_integration exactly once across a StrictMode remount", () => {
        const spy = vi.spyOn(window, "dispatchEvent");

        render(
            <StrictMode>
                <SetupBanner status={noIntegration} orgId="org-1" />
            </StrictMode>,
        );

        const onboardingDispatches = spy.mock.calls.filter(
            ([event]) =>
                (event as Event).type === ONBOARDING_TELEMETRY_EVENT &&
                (event as CustomEvent).detail?.name === "dashboard_viewed_without_integration",
        );
        expect(onboardingDispatches).toHaveLength(1);
    });
});
