import { apiClient } from "@/lib/apiClient";

type TelemetryPayload = Record<string, string | number | boolean | null>;

export const trackTelemetryEvent = (
  event: string,
  payload: TelemetryPayload = {}
) => {
  if (typeof window === "undefined") {
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
    .catch(() => null);
};
