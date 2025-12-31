import { API_BASE } from "@/lib/api";

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
  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon(`${API_BASE}/api/v1/telemetry`, blob);
    return;
  }
  fetch(`${API_BASE}/api/v1/telemetry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => null);
};
