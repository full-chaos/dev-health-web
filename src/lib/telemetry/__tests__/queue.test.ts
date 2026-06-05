import { afterEach, describe, expect, it, vi } from "vitest";

import { createTelemetryQueue } from "../queue";
import type { TelemetryAdapter } from "../adapters";
import type { TelemetryEvent } from "../types";

const event = (eventId: string): TelemetryEvent<"feature_viewed"> => ({
    name: "feature_viewed",
    schemaVersion: "2026-05-telemetry-v1",
    eventId,
    ts: "2026-05-25T00:00:00.000Z",
    sessionId: "session-1",
    anonymousUserId: "user-1",
    orgIdHash: "org-1",
    routePattern: "/dashboard",
    payload: { feature: "dashboard", surface: "dashboard", routePattern: "/dashboard" },
});

describe("createTelemetryQueue", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("flushes enabled adapters when batch size is reached", async () => {
        const send = vi.fn<TelemetryAdapter["send"]>().mockResolvedValue(undefined);
        const disabledSend = vi.fn<TelemetryAdapter["send"]>().mockResolvedValue(undefined);
        const queue = createTelemetryQueue({
            adapters: [
                { name: "enabled", enabled: () => true, send },
                { name: "disabled", enabled: () => false, send: disabledSend },
            ],
            maxBatchSize: 2,
            flushIntervalMs: 60_000,
        });

        queue.enqueue(event("event-1"));
        queue.enqueue(event("event-2"));
        await queue.flush();

        expect(send).toHaveBeenCalledTimes(1);
        expect(send).toHaveBeenCalledWith([event("event-1"), event("event-2")]);
        expect(disabledSend).not.toHaveBeenCalled();
    });

    it("flushes remaining events exactly once", async () => {
        const send = vi.fn<TelemetryAdapter["send"]>().mockResolvedValue(undefined);
        const queue = createTelemetryQueue({
            adapters: [{ name: "enabled", enabled: () => true, send }],
            maxBatchSize: 10,
            flushIntervalMs: 60_000,
        });

        queue.enqueue(event("event-1"));
        await queue.flush();
        await queue.flush();

        expect(send).toHaveBeenCalledTimes(1);
        expect(send).toHaveBeenCalledWith([event("event-1")]);
    });

    it("flushes on interval", async () => {
        vi.useFakeTimers();
        const send = vi.fn<TelemetryAdapter["send"]>().mockResolvedValue(undefined);
        const queue = createTelemetryQueue({
            adapters: [{ name: "enabled", enabled: () => true, send }],
            maxBatchSize: 10,
            flushIntervalMs: 1_000,
        });

        queue.enqueue(event("event-1"));
        await vi.advanceTimersByTimeAsync(1_000);

        expect(send).toHaveBeenCalledTimes(1);
        queue.dispose();
    });
});
