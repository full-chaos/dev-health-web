import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ONBOARDING_TELEMETRY_EVENT, emitOnboardingEvent } from "../telemetry";

const ORIGINAL_TELEMETRY_ENABLED = process.env.NEXT_PUBLIC_TELEMETRY_ENABLED;

describe("emitOnboardingEvent (CHAOS-2683)", () => {
    beforeEach(() => {
        delete process.env.NEXT_PUBLIC_TELEMETRY_ENABLED;
        // Clear any persisted opt-out without assuming a localStorage shim.
        try {
            window.localStorage?.clear();
        } catch {
            /* localStorage unavailable in this environment */
        }
    });

    afterEach(() => {
        if (ORIGINAL_TELEMETRY_ENABLED === undefined) {
            delete process.env.NEXT_PUBLIC_TELEMETRY_ENABLED;
        } else {
            process.env.NEXT_PUBLIC_TELEMETRY_ENABLED = ORIGINAL_TELEMETRY_ENABLED;
        }
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("dispatches the funnel event on the window bus when telemetry is enabled", () => {
        const detail = vi.fn();
        window.addEventListener(ONBOARDING_TELEMETRY_EVENT, (event) => {
            detail((event as CustomEvent).detail);
        });

        const emitted = emitOnboardingEvent("dashboard_viewed_without_integration", {
            orgId: "org-1",
        });

        expect(emitted).toBe(true);
        expect(detail).toHaveBeenCalledWith({
            name: "dashboard_viewed_without_integration",
            payload: { orgId: "org-1" },
        });
    });

    it("defaults the payload to an empty object", () => {
        const detail = vi.fn();
        window.addEventListener(ONBOARDING_TELEMETRY_EVENT, (event) => {
            detail((event as CustomEvent).detail);
        });

        expect(emitOnboardingEvent("github_app_connected")).toBe(true);
        expect(detail).toHaveBeenCalledWith({
            name: "github_app_connected",
            payload: {},
        });
    });

    it("is a no-op when NEXT_PUBLIC_TELEMETRY_ENABLED is false", () => {
        process.env.NEXT_PUBLIC_TELEMETRY_ENABLED = "false";
        const spy = vi.spyOn(window, "dispatchEvent");

        const emitted = emitOnboardingEvent("first_sync_started");

        expect(emitted).toBe(false);
        expect(spy).not.toHaveBeenCalled();
    });

    it("is a no-op on the server (no window)", () => {
        vi.stubGlobal("window", undefined);
        expect(emitOnboardingEvent("onboarding_completed")).toBe(false);
    });
});
