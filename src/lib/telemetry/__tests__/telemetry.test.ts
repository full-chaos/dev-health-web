import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { firstPartyTelemetryAdapter } from "../adapters";
import { TELEMETRY_OPT_OUT_KEY } from "../config";
import {
    configureTelemetry,
    resetTelemetryForTests,
    setTelemetryContext,
    trackTelemetryEvent,
} from "../../telemetry";
import type { TelemetryAdapter } from "../adapters";
import type { TelemetryEvent, TelemetryPayloadByName } from "../types";

const apiClientMock = vi.hoisted(() => ({
    request: vi.fn().mockResolvedValue(new Response(null, { status: 202 })),
    sendBeacon: vi.fn().mockReturnValue(false),
}));

const envMock = vi.hoisted(() => {
    const values = new Map<string, string>();
    const storage = {
        clear: vi.fn(() => values.clear()),
        getItem: vi.fn((key: string) => values.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => values.set(key, value)),
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
    apiClient: apiClientMock,
}));

vi.mock("@/lib/env", () => ({
    getLocalStorage: () => envMock.storage,
    getWindow: () => envMock.window,
    isServer: false,
}));

const originalRandomUUID = crypto.randomUUID;

describe("product telemetry", () => {
    beforeEach(() => {
        envMock.storage.clear();
        envMock.window.navigator.doNotTrack = "0";
        vi.stubEnv("NEXT_PUBLIC_TELEMETRY_ENABLED", "true");
        vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");
        setTelemetryContext({
            sessionId: "session-1",
            anonymousUserId: "anon-1",
            orgIdHash: "org-hash-1",
            routePattern: "/metrics",
        });
    });

    afterEach(() => {
        Object.defineProperty(crypto, "randomUUID", {
            configurable: true,
            value: originalRandomUUID,
        });
        resetTelemetryForTests();
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    it("sends first-party batches to the product telemetry endpoint", async () => {
        await firstPartyTelemetryAdapter.send([
            {
                name: "feature_viewed",
                schemaVersion: "2026-05-telemetry-v1",
                eventId: "event-1",
                ts: "2026-05-25T00:00:00.000Z",
                sessionId: "session-1",
                anonymousUserId: "anon-1",
                orgIdHash: "org-hash-1",
                routePattern: "/metrics",
                payload: { feature: "metrics", surface: "metrics", routePattern: "/metrics" },
            },
        ]);

        expect(apiClientMock.sendBeacon).toHaveBeenCalledWith(
            "/api/v1/product-telemetry/events",
            expect.stringContaining('"source":"dev-health-web"'),
        );
        expect(apiClientMock.request).toHaveBeenCalledWith(
            "/api/v1/product-telemetry/events",
            expect.objectContaining({ method: "POST", keepalive: true }),
        );
    });

    it("builds typed sanitized events and enqueues them", async () => {
        const sent: TelemetryEvent[] = [];
        const adapter: TelemetryAdapter = {
            name: "test",
            enabled: () => true,
            send: async (events) => {
                sent.push(...events);
            },
        };
        configureTelemetry({ adapters: [adapter], maxBatchSize: 1, flushIntervalMs: 60_000 });

        const unsafePayload = {
            chart: "quadrant",
            action: "overlay_toggled",
            surface: "metrics",
            scope: "team",
            message: "must be dropped",
        } as TelemetryPayloadByName["chart_interacted"];
        trackTelemetryEvent("chart_interacted", unsafePayload);

        await vi.waitFor(() => expect(sent).toHaveLength(1));
        expect(sent[0]).toMatchObject({
            name: "chart_interacted",
            schemaVersion: "2026-05-telemetry-v1",
            eventId: "00000000-0000-4000-8000-000000000001",
            sessionId: "session-1",
            anonymousUserId: "anon-1",
            orgIdHash: "org-hash-1",
            routePattern: "/metrics",
            payload: {
                chart: "quadrant",
                action: "overlay_toggled",
                surface: "metrics",
                scope: "team",
            },
        });
        expect(sent[0]?.payload).not.toHaveProperty("message");
    });

    it("uses crypto-backed fallback ids when randomUUID is unavailable", async () => {
        vi.restoreAllMocks();
        Object.defineProperty(crypto, "randomUUID", { configurable: true, value: undefined });
        vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => {
            if (array instanceof Uint8Array) {
                array.fill(0xab);
            }
            return array;
        });
        vi.spyOn(Math, "random").mockImplementation(() => {
            throw new Error("Math.random must not be used for telemetry identifiers");
        });
        const sent: TelemetryEvent[] = [];
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
            maxBatchSize: 1,
            flushIntervalMs: 60_000,
        });

        trackTelemetryEvent("feature_viewed", {
            feature: "metrics",
            surface: "metrics",
            routePattern: "/metrics",
        });

        await vi.waitFor(() => expect(sent).toHaveLength(1));
        expect(sent[0]?.eventId).toBe("abababab-abab-4bab-abab-abababababab");
    });

    it("does not track when DNT, local opt-out, or env disablement applies", async () => {
        const send = vi.fn<TelemetryAdapter["send"]>().mockResolvedValue(undefined);
        configureTelemetry({
            adapters: [{ name: "test", enabled: () => true, send }],
            maxBatchSize: 1,
            flushIntervalMs: 60_000,
        });

        envMock.storage.setItem(TELEMETRY_OPT_OUT_KEY, "true");
        trackTelemetryEvent("feature_viewed", {
            feature: "metrics",
            surface: "metrics",
            routePattern: "/metrics",
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(send).not.toHaveBeenCalled();
    });
});
