import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiClientMock = vi.hoisted(() => ({
    request: vi.fn().mockResolvedValue(new Response(null, { status: 202 })),
    sendBeacon: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/apiClient", () => ({ apiClient: apiClientMock }));

vi.mock("@/lib/env", () => ({
    getLocalStorage: () => ({
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
    }),
    getWindow: () => ({
        navigator: { doNotTrack: "0" },
        location: { pathname: "/metrics" },
        dispatchEvent: () => true,
    }),
    isServer: false,
}));

// Not an e-mail shape on purpose: the log scrubber would hide an address, so this proves the call site never passes the value.
const REJECTED_VALUE = "Countess Lovelace of Ockham";
const LEVELS = ["debug", "log", "info", "warn", "error"] as const;

// The browser logger binds console.* when its module loads, so the spies go in before the
// modules are imported fresh.
async function withFreshModules() {
    vi.resetModules();
    const spies = LEVELS.map((level) =>
        vi.spyOn(console, level).mockImplementation(() => undefined),
    );
    const telemetry = await import("../../telemetry");
    const onboarding = await import("@/lib/onboarding/track");
    return { spies, telemetry, onboarding };
}

// Fresh module graphs are imported inside each test: allow for a loaded CI host.
const IMPORT_TIMEOUT_MS = 30_000;

describe("a rejected telemetry value never reaches a log sink", () => {
    beforeEach(() => {
        vi.stubEnv("NEXT_PUBLIC_TELEMETRY_ENABLED", "true");
        apiClientMock.sendBeacon.mockClear();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it(
        "typed events: the debug line carries the event name and the key only",
        async () => {
            const { spies, telemetry } = await withFreshModules();
            telemetry.configureTelemetry({
                adapters: [],
                maxBatchSize: 1,
                flushIntervalMs: 60_000,
            });

            telemetry.trackTelemetryEvent("filter_changed", {
                view: REJECTED_VALUE,
                filterKey: "scope",
                valueCount: 1,
                isCustomDateRange: null,
            });

            const calls = spies.flatMap((spy) => spy.mock.calls);
            const text = JSON.stringify(calls);
            expect(text).not.toContain("Lovelace");
            expect(text).not.toContain("Countess");
            expect(text).toContain("filter_changed");
            expect(text).toContain("view");
            expect(calls).toHaveLength(1);
        },
        IMPORT_TIMEOUT_MS,
    );

    it(
        "onboarding events: nothing is sent and the debug line carries the event name and the key only",
        async () => {
            const { spies, onboarding } = await withFreshModules();

            onboarding.trackOnboardingEvent("workspace_created", { step: REJECTED_VALUE });

            expect(apiClientMock.sendBeacon).not.toHaveBeenCalled();
            const calls = spies.flatMap((spy) => spy.mock.calls);
            const text = JSON.stringify(calls);
            expect(text).not.toContain("Lovelace");
            expect(text).not.toContain("Countess");
            expect(text).toContain("workspace_created");
            expect(text).toContain("step");
            expect(calls).toHaveLength(1);
        },
        IMPORT_TIMEOUT_MS,
    );
});
