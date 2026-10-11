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

export type TelemetryQueue = {
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
        flushPromise = Promise.all(
            adapters
                .filter((adapter) => adapter.enabled())
                .map((adapter) =>
                    adapter.send(batch).catch((err: unknown) => {
                        dropped += batch.length;
                        // Loud once, then quiet: a dead endpoint must not flood the log.
                        if (!failureLogged) {
                            failureLogged = true;
                            logger.warn(
                                { err, adapter: adapter.name },
                                "Product telemetry send failed; events dropped (no retry)",
                            );
                        }
                    }),
                ),
        ).then(() => undefined);
        try {
            await flushPromise;
        } finally {
            flushPromise = null;
        }
    }

    return {
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
