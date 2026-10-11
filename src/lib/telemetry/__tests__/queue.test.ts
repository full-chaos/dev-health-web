import { afterEach, describe, expect, it, vi } from "vitest";

const loggerMock = vi.hoisted(() => ({
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ logger: loggerMock }));

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

describe("createTelemetryQueue failure handling", () => {
    it("counts dropped events and logs a failed send once", async () => {
        const warn = loggerMock.warn;
        warn.mockClear();
        const send = vi.fn<TelemetryAdapter["send"]>().mockRejectedValue(new Error("down"));
        const queue = createTelemetryQueue({
            adapters: [{ name: "x", enabled: () => true, send }],
            maxBatchSize: 100,
            flushIntervalMs: 0,
        });
        queue.enqueue(event("1"));
        await queue.flush();
        queue.enqueue(event("2"));
        await queue.flush();
        expect(queue.droppedCount()).toBe(2);
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it("bounds the buffer", async () => {
        const send = vi.fn<TelemetryAdapter["send"]>().mockResolvedValue(undefined);
        const queue = createTelemetryQueue({
            adapters: [{ name: "x", enabled: () => true, send }],
            maxBatchSize: 100_000,
            flushIntervalMs: 0,
        });
        for (let i = 0; i < 250; i += 1) queue.enqueue(event(String(i)));
        await queue.flush();
        expect(send.mock.calls[0][0]).toHaveLength(200);
        expect(queue.droppedCount()).toBe(50);
    });
});
