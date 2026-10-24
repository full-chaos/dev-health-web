import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    configureTelemetry,
    flushTelemetryEvents,
    resetTelemetryForTests,
    TELEMETRY_SESSION_IDLE_MS,
    trackTelemetryEvent,
} from "../../telemetry";
import type { TelemetryEvent } from "../types";

const envMock = vi.hoisted(() => {
    const values = new Map<string, string>();
    const storage = {
        throws: false,
        values,
        getItem(key: string) {
            if (storage.throws) throw new Error("denied");
            return values.get(key) ?? null;
        },
        setItem(key: string, value: string) {
            if (storage.throws) throw new Error("denied");
            values.set(key, value);
        },
    };
    return {
        storage,
        window: {
            navigator: { doNotTrack: "0" },
            location: { pathname: "/metrics" },
            dispatchEvent: vi.fn(),
        },
    };
});

vi.mock("@/lib/apiClient", () => ({
    apiClient: { request: vi.fn(), sendBeacon: vi.fn() },
}));

vi.mock("@/lib/env", () => ({
    getLocalStorage: () => envMock.storage,
    getWindow: () => envMock.window,
    isServer: false,
}));

const SESSION_KEY = "devhealth-product-telemetry-session-id";
const ACTIVITY_KEY = "devhealth-product-telemetry-session-last-activity";

describe("product telemetry session id idle timeout", () => {
    let sent: TelemetryEvent[];

    const track = async () => {
        trackTelemetryEvent("feature_viewed", {
            feature: "metrics",
            surface: "route",
            routePattern: "/metrics",
        });
        await flushTelemetryEvents();
    };
    const configure = () => {
        sent = [];
        configureTelemetry({
            adapters: [
                {
                    name: "test",
                    enabled: () => true,
                    send: async (events) => {
                        sent.push(...events);
                    },
                },
            ],
            maxBatchSize: 100,
            flushIntervalMs: 60_000,
        });
    };

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-11T10:00:00.000Z"));
        vi.stubEnv("NEXT_PUBLIC_TELEMETRY_ENABLED", "true");
        envMock.storage.values.clear();
        envMock.storage.throws = false;
        resetTelemetryForTests();
        configure();
    });

    afterEach(() => {
        resetTelemetryForTests();
        vi.useRealTimers();
        vi.unstubAllEnvs();
    });

    it("keeps the id inside the idle window, counting each event as activity", async () => {
        await track();
        vi.advanceTimersByTime(TELEMETRY_SESSION_IDLE_MS - 1000);
        await track();
        vi.advanceTimersByTime(TELEMETRY_SESSION_IDLE_MS - 1000);
        await track();
        expect(new Set(sent.map((e) => e.sessionId)).size).toBe(1);
    });

    it("makes a new id after more than 30 minutes idle", async () => {
        await track();
        vi.advanceTimersByTime(TELEMETRY_SESSION_IDLE_MS + 1);
        await track();
        expect(sent[1]?.sessionId).not.toBe(sent[0]?.sessionId);
        expect(envMock.storage.values.get(SESSION_KEY)).toBe(sent[1]?.sessionId);
    });

    it("shares the id between two tabs and rotates for both", async () => {
        await track();
        const first = sent[0]!.sessionId;

        // Second tab: fresh module state, same localStorage.
        resetTelemetryForTests();
        configure();
        vi.advanceTimersByTime(60_000);
        await track();
        expect(sent[0]!.sessionId).toBe(first);

        vi.advanceTimersByTime(TELEMETRY_SESSION_IDLE_MS + 1);
        await track();
        const rotated = sent[1]!.sessionId;
        expect(rotated).not.toBe(first);

        resetTelemetryForTests();
        configure();
        await track();
        expect(sent[0]!.sessionId).toBe(rotated);
    });

    it("keeps an id that has no stored activity time (written before this change)", async () => {
        envMock.storage.values.set(SESSION_KEY, "11111111-1111-4111-8111-111111111111");
        await track();
        expect(sent[0]?.sessionId).toBe("11111111-1111-4111-8111-111111111111");
        expect(envMock.storage.values.get(ACTIVITY_KEY)).toBeDefined();
    });

    it("still sends, with a stable id that rotates on idle, when storage throws", async () => {
        envMock.storage.throws = true;
        await track();
        await track();
        expect(sent).toHaveLength(2);
        expect(sent[0]?.sessionId).toBeTruthy();
        expect(sent[1]?.sessionId).toBe(sent[0]?.sessionId);

        vi.advanceTimersByTime(TELEMETRY_SESSION_IDLE_MS + 1);
        await track();
        expect(sent[2]?.sessionId).not.toBe(sent[0]?.sessionId);
    });
});
