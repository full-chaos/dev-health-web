import { logger } from "@/lib/logger";

import type { TelemetryAdapter } from "./adapters";
import type { TelemetryEvent } from "./types";

type TelemetryQueueOptions = {
    adapters: TelemetryAdapter[];
    maxBatchSize: number;
    flushIntervalMs: number;
};

/** Upper bound on buffered events; the oldest are dropped (and counted) past it. */
export const MAX_QUEUED_EVENTS = 200;

/**
 * Byte budget for what one page-hide flush may hand to the browser. keepalive
 * fetch and sendBeacon share a ~64 KB in-flight quota; stay below it and leave
 * room for the batch envelope.
 */
export const HIDE_FLUSH_BYTE_BUDGET = 56_000;

export type TelemetryQueue = {
    /**
     * Synchronous drain for page hide: hands the newest events that fit
     * HIDE_FLUSH_BYTE_BUDGET to the adapters at once. Older events that do not
     * fit stay queued (sent by the timer if the page survives, e.g. bfcache).
     */
    flushOnHide(): void;
    enqueue(event: TelemetryEvent): void;
    /** Count of events lost to a failed send or the buffer cap. */
    droppedCount(): number;
    flush(): Promise<void>;
    dispose(): void;
};

export function createTelemetryQueue({
    adapters,
    maxBatchSize,
    flushIntervalMs,
}: TelemetryQueueOptions): TelemetryQueue {
    let events: TelemetryEvent[] = [];
    let flushPromise: Promise<void> | null = null;
    let dropped = 0;
    let failureLogged = false;
    const timer =
        flushIntervalMs > 0 ? globalThis.setInterval(() => void flush(), flushIntervalMs) : null;

    async function flush(): Promise<void> {
        if (flushPromise) {
            return flushPromise;
        }
        if (events.length === 0) {
            return;
        }
        const batch = events;
        events = [];
        flushPromise = sendBatch(batch);
        try {
            await flushPromise;
        } finally {
            flushPromise = null;
        }
    }

    function sendBatch(batch: TelemetryEvent[]): Promise<void> {
        return Promise.all(
            adapters
                .filter((adapter) => adapter.enabled())
                .map((adapter) => {
                    try {
                        return adapter
                            .send(batch)
                            .catch((err: unknown) => reportFailure(err, adapter, batch));
                    } catch (err) {
                        reportFailure(err, adapter, batch);
                        return Promise.resolve();
                    }
                }),
        ).then(() => undefined);
    }

    function reportFailure(err: unknown, adapter: TelemetryAdapter, batch: TelemetryEvent[]): void {
        dropped += batch.length;
        // Loud once, then quiet: a dead endpoint must not flood the log.
        if (!failureLogged) {
            failureLogged = true;
            logger.warn(
                { err, adapter: adapter.name },
                "Product telemetry send failed; events dropped (no retry)",
            );
        }
    }

    function flushOnHide(): void {
        if (events.length === 0) {
            return;
        }
        const encoder = new TextEncoder();
        let used = 0;
        let start = events.length;
        while (start > 0) {
            const size = encoder.encode(JSON.stringify(events[start - 1])).length + 1;
            // Always send at least the newest event, even if it alone is oversized.
            if (used + size > HIDE_FLUSH_BYTE_BUDGET && start < events.length) {
                break;
            }
            used += size;
            start -= 1;
        }
        const batch = events.slice(start);
        events = events.slice(0, start);
        // Sent events leave the buffer here, so a later bfcache restore cannot resend them.
        void sendBatch(batch);
    }

    return {
        flushOnHide,
        enqueue(event) {
            events.push(event);
            if (events.length > MAX_QUEUED_EVENTS) {
                dropped += events.length - MAX_QUEUED_EVENTS;
                events = events.slice(-MAX_QUEUED_EVENTS);
            }
            if (events.length >= maxBatchSize) {
                void flush();
            }
        },
        droppedCount: () => dropped,
        flush,
        dispose() {
            if (timer) {
                globalThis.clearInterval(timer);
            }
        },
    };
}
