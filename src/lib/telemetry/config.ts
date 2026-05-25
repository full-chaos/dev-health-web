import { getLocalStorage, getWindow } from "@/lib/env";

export const TELEMETRY_OPT_OUT_KEY = "devhealth-product-telemetry-opt-out";

export function isDoNotTrackEnabled(): boolean {
  const nav = getWindow()?.navigator;
  return nav?.doNotTrack === "1" || nav?.doNotTrack === "yes";
}

export function isTelemetryOptedOut(): boolean {
  return getLocalStorage()?.getItem(TELEMETRY_OPT_OUT_KEY) === "true";
}

export function setTelemetryOptOut(optedOut: boolean): void {
  getLocalStorage()?.setItem(TELEMETRY_OPT_OUT_KEY, optedOut ? "true" : "false");
  getWindow()?.dispatchEvent(new Event("storage"));
}

export function canTrackProductTelemetry(): boolean {
  return process.env.NEXT_PUBLIC_TELEMETRY_ENABLED !== "false" && !isDoNotTrackEnabled() && !isTelemetryOptedOut();
}
