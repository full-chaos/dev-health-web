import { apiClient } from "@/lib/apiClient";
import { logger } from "@/lib/logger";

import { closeTelemetryEvent } from "./schema";
import type { TelemetryEvent } from "./types";

export type TelemetryAdapter = {
    name: string;
    enabled(): boolean;
    send(events: TelemetryEvent[]): Promise<void>;
    flush?(): Promise<void>;
};

export const firstPartyTelemetryAdapter: TelemetryAdapter = {
    name: "first-party",
    enabled: () => true,
    async send(input) {
        // The sink closes every event itself, so a caller that skips trackTelemetryEvent cannot send an unknown key or path.
        const events = input.flatMap((event) => closeTelemetryEvent(event) ?? []);
        if (events.length === 0) return;
        const body = JSON.stringify({
            source: "dev-health-web",
            orgIdHash: events[0]?.orgIdHash ?? null,
            events,
        });
        if (apiClient.sendBeacon("/api/v1/product-telemetry/events", body)) return;
        await apiClient.request("/api/v1/product-telemetry/events", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            keepalive: true,
        });
    },
};

export const consoleTelemetryAdapter: TelemetryAdapter = {
    name: "console",
    enabled: () => process.env.NODE_ENV !== "production",
    async send(events) {
        logger.debug({ events }, "Product telemetry events");
    },
};
