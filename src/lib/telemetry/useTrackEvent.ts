"use client";

import { useCallback } from "react";

import { trackTelemetryEvent } from "@/lib/telemetry";
import type { TelemetryEventName, TelemetryPayloadByName } from "./types";

const TELEMETRY_INTERACTION_EVENT = "devhealth:telemetry-interaction";

export function useTrackEvent() {
  return useCallback(<Name extends TelemetryEventName>(name: Name, payload: TelemetryPayloadByName[Name]) => {
    window.dispatchEvent(new Event(TELEMETRY_INTERACTION_EVENT));
    trackTelemetryEvent(name, payload);
  }, []);
}
