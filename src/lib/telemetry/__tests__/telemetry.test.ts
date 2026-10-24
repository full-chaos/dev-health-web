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
            surface: "quadrant_panel",
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
                surface: "quadrant_panel",
                scope: "team",
            },
        });
        expect(sent[0]?.payload).not.toHaveProperty("message");
    });

    it("sends nothing for an event with an out-of-bounds string and drops the event", async () => {
        const sent: TelemetryEvent[] = [];
        const adapter: TelemetryAdapter = {
            name: "test",
            enabled: () => true,
            send: async (events) => {
                sent.push(...events);
            },
        };
        configureTelemetry({ adapters: [adapter], maxBatchSize: 1, flushIntervalMs: 60_000 });
        trackTelemetryEvent("filter_changed", {
            view: "ada@example.com",
            filterKey: "scope",
            valueCount: 1,
            isCustomDateRange: null,
        });
        trackTelemetryEvent("filter_changed", {
            view: "work",
            filterKey: "scope",
            valueCount: 1,
            isCustomDateRange: null,
        });

        await vi.waitFor(() => expect(sent).toHaveLength(1));
        expect(sent[0]?.payload).toMatchObject({ view: "work" });
    });

    it("sends nothing for an event whose required field is undefined", async () => {
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

        trackTelemetryEvent("filter_changed", {
            view: undefined,
            filterKey: "scope",
            valueCount: 1,
            isCustomDateRange: null,
        } as unknown as TelemetryPayloadByName["filter_changed"]);
        trackTelemetryEvent("session_started", { entryRoutePattern: "/" });

        await vi.waitFor(() => expect(sent).toHaveLength(1));
        expect(sent[0]?.name).toBe("session_started");
    });

    it("sends the fixed unmatched value as the envelope route when the route is not a known one", async () => {
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
        setTelemetryContext({ routePattern: "/people/ada@example.com" });
        trackTelemetryEvent("session_started", { entryRoutePattern: "/" });
        await vi.waitFor(() => expect(sent).toHaveLength(1));
        expect(sent[0]?.routePattern).toBe("/[unmatched]");
        expect(JSON.stringify(sent[0])).not.toContain("ada@example.com");
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
            surface: "route",
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
            surface: "route",
            routePattern: "/metrics",
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(send).not.toHaveBeenCalled();
    });

    it("pings the interaction counter for interaction events only", () => {
        configureTelemetry({ adapters: [], flushIntervalMs: 0 });
        envMock.window.dispatchEvent.mockClear();
        trackTelemetryEvent("page_viewed", {
            routePattern: "/a",
            page: "/a",
            referrerRoutePattern: null,
        });
        expect(envMock.window.dispatchEvent).not.toHaveBeenCalled();
        trackTelemetryEvent("filter_changed", {
            view: "metrics",
            filterKey: "repo",
            valueCount: 1,
            isCustomDateRange: null,
        });
        expect(envMock.window.dispatchEvent).toHaveBeenCalledTimes(1);
    });
});

describe("telemetryEnvelopeIdentity", () => {
    it("returns a fresh eventId and the shared session and anonymous ids", async () => {
        const { telemetryEnvelopeIdentity, resetTelemetryForTests } =
            await import("../../telemetry");
        resetTelemetryForTests();
        const a = telemetryEnvelopeIdentity(Date.now());
        const b = telemetryEnvelopeIdentity(Date.now());
        expect(a.eventId).not.toBe(b.eventId);
        expect(a.sessionId).toBe(b.sessionId);
        expect(a.anonymousUserId).toBe(b.anonymousUserId);
        expect(a.sessionId).toBeTruthy();
    });

    describe("closed value sets", () => {
        const collect = () => {
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
            return sent;
        };

        it('drops feature_viewed with surface "org-123" and sends the next valid event', async () => {
            const sent = collect();
            trackTelemetryEvent("feature_viewed", {
                feature: "metrics",
                surface: "org-123",
                routePattern: "/metrics",
            });
            trackTelemetryEvent("session_started", { entryRoutePattern: "/metrics" });
            await vi.waitFor(() => expect(sent).toHaveLength(1));
            expect(sent[0]?.name).toBe("session_started");
        });

        it("drops an extra ownerRef key and every non-schema key before the event is queued", async () => {
            const sent = collect();
            trackTelemetryEvent("session_started", {
                entryRoutePattern: "/metrics",
                ownerRef: "o-1",
                org_id: "org-123",
            } as TelemetryPayloadByName["session_started"]);
            await vi.waitFor(() => expect(sent).toHaveLength(1));
            expect(sent[0]?.payload).toEqual({ entryRoutePattern: "/metrics" });
            expect(JSON.stringify(sent[0])).not.toMatch(/ownerRef|o-1|org-123/);
        });

        it("drops usr_8f2a91c3b7d4 as a chart scope and keeps the event", async () => {
            const sent = collect();
            trackTelemetryEvent("chart_interacted", {
                chart: "quadrant",
                action: "zoom",
                surface: "quadrant_panel",
                scope: "usr_8f2a91c3b7d4",
            });
            await vi.waitFor(() => expect(sent).toHaveLength(1));
            expect(JSON.stringify(sent[0])).not.toContain("usr_8f2a91c3b7d4");
        });

        it("sends an id-shaped page route as the unmatched value", async () => {
            const sent = collect();
            trackTelemetryEvent("page_viewed", {
                routePattern: "/people/usr_8f2a91c3b7d4",
                page: "/people/usr_8f2a91c3b7d4",
                referrerRoutePattern: null,
            });
            await vi.waitFor(() => expect(sent).toHaveLength(1));
            expect(sent[0]?.payload).toMatchObject({
                routePattern: "/[unmatched]",
                page: "/[unmatched]",
            });
            expect(JSON.stringify(sent[0])).not.toContain("usr_8f2a91c3b7d4");
        });

        it("admits the onboarding funnel feature_viewed shape", async () => {
            const sent = collect();
            trackTelemetryEvent("feature_viewed", {
                feature: "onboarding_funnel",
                surface: "signup_completed",
                routePattern: "/auth/signup",
            });
            await vi.waitFor(() => expect(sent).toHaveLength(1));
            expect(sent[0]?.payload).toEqual({
                feature: "onboarding_funnel",
                surface: "signup_completed",
                routePattern: "/auth/signup",
            });
        });
    });
});
