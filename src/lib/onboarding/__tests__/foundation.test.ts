import { describe, expect, it, afterEach, vi } from "vitest";
import { runtimeConfig } from "../../runtimeConfig";
import { ONBOARDING_EVENTS, isOnboardingEvent } from "../events";

const captureEnv = () => ({
    NEXT_PUBLIC_GUIDED_ONBOARDING: process.env.NEXT_PUBLIC_GUIDED_ONBOARDING,
});

const restoreEnv = (snapshot: ReturnType<typeof captureEnv>) => {
    for (const [key, value] of Object.entries(snapshot)) {
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("runtimeConfig.guidedOnboarding (CHAOS-2682)", () => {
    it("defaults to false when the flag is unset", () => {
        const original = captureEnv();
        vi.stubGlobal("window", undefined);
        delete process.env.NEXT_PUBLIC_GUIDED_ONBOARDING;
        try {
            expect(runtimeConfig.guidedOnboarding()).toBe(false);
        } finally {
            restoreEnv(original);
        }
    });

    it.each(["true", "1"])("is enabled when set to %s", (value) => {
        const original = captureEnv();
        vi.stubGlobal("window", undefined);
        process.env.NEXT_PUBLIC_GUIDED_ONBOARDING = value;
        try {
            expect(runtimeConfig.guidedOnboarding()).toBe(true);
        } finally {
            restoreEnv(original);
        }
    });

    it.each(["false", "0", "", "yes", "on"])(
        "stays disabled for non-canonical value %s",
        (value) => {
            const original = captureEnv();
            vi.stubGlobal("window", undefined);
            process.env.NEXT_PUBLIC_GUIDED_ONBOARDING = value;
            try {
                expect(runtimeConfig.guidedOnboarding()).toBe(false);
            } finally {
                restoreEnv(original);
            }
        },
    );

    it("prefers the injected runtime config over process.env", () => {
        const original = captureEnv();
        delete process.env.NEXT_PUBLIC_GUIDED_ONBOARDING;
        vi.stubGlobal("window", {
            __DEV_HEALTH_RUNTIME__: {
                publicEnv: { NEXT_PUBLIC_GUIDED_ONBOARDING: "true" },
            },
        });
        try {
            expect(runtimeConfig.guidedOnboarding()).toBe(true);
        } finally {
            restoreEnv(original);
        }
    });
});

describe("onboarding funnel event vocabulary (CHAOS-2683)", () => {
    it("freezes the ten funnel event names", () => {
        expect(ONBOARDING_EVENTS).toEqual([
            "signup_completed",
            "workspace_setup_started",
            "workspace_created",
            "integration_step_viewed",
            "github_app_install_started",
            "github_app_connected",
            "integration_skipped",
            "first_sync_started",
            "onboarding_completed",
            "dashboard_viewed_without_integration",
        ]);
    });

    it("recognizes known events and rejects unknown ones", () => {
        expect(isOnboardingEvent("workspace_created")).toBe(true);
        expect(isOnboardingEvent("page_viewed")).toBe(false);
    });
});
