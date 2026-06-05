import { apiClient } from "@/lib/apiClient";
import { logger } from "@/lib/logger";

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
    async send(events) {
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
