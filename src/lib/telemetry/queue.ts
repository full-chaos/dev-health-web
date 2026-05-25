import { logger } from "@/lib/logger";

import type { TelemetryAdapter } from "./adapters";
import type { TelemetryEvent } from "./types";

type TelemetryQueueOptions = {
  adapters: TelemetryAdapter[];
  maxBatchSize: number;
  flushIntervalMs: number;
};

export type TelemetryQueue = {
  enqueue(event: TelemetryEvent): void;
  flush(): Promise<void>;
  dispose(): void;
};

export function createTelemetryQueue({ adapters, maxBatchSize, flushIntervalMs }: TelemetryQueueOptions): TelemetryQueue {
  let events: TelemetryEvent[] = [];
  let flushPromise: Promise<void> | null = null;
  const timer = flushIntervalMs > 0 ? globalThis.setInterval(() => void flush(), flushIntervalMs) : null;

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
            logger.debug({ err, adapter: adapter.name }, "Product telemetry adapter send failed");
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
      if (events.length >= maxBatchSize) {
        void flush();
      }
    },
    flush,
    dispose() {
      if (timer) {
        globalThis.clearInterval(timer);
      }
    },
  };
}
