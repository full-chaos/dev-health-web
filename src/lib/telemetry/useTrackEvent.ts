"use client";

import { useCallback } from "react";

import { trackTelemetryEvent } from "@/lib/telemetry";
import type { TelemetryEventName, TelemetryPayloadByName } from "./types";

/** Interaction events (filter, chart, navigation, guide) are counted inside `trackTelemetryEvent`. */
export function useTrackEvent() {
    return useCallback(
        <Name extends TelemetryEventName>(name: Name, payload: TelemetryPayloadByName[Name]) => {
            trackTelemetryEvent(name, payload);
        },
        [],
    );
}
