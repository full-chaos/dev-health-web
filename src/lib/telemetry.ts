import { apiClient } from "@/lib/apiClient";
import { isServer } from "@/lib/env";
import { logger } from "@/lib/logger";

type TelemetryPayload = Record<string, string | number | boolean | null>;

export const trackTelemetryEvent = (
  event: string,
  payload: TelemetryPayload = {}
) => {
  if (isServer) {
    return;
  }
  const body = JSON.stringify({
    event,
    payload,
    ts: new Date().toISOString(),
  });
  if (apiClient.sendBeacon("/api/v1/telemetry", body)) {
    return;
  }
  apiClient
    .request("/api/v1/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    })
    .catch((err: unknown) => {
      // Telemetry is non-critical fire-and-forget; log at debug level only.
      logger.debug({ err, event }, "Telemetry beacon fallback failed");
    });
};
