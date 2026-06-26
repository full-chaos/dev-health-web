"use client";

/**
 * CHAOS-2683 onboarding funnel emitter.
 *
 * The guided-onboarding surfaces (CHAOS-2674/2675) call `trackOnboardingEvent`
 * at the documented funnel points. Emission reuses the product-telemetry
 * pipeline: the same `canTrackProductTelemetry()` gate (which honours
 * `NEXT_PUBLIC_TELEMETRY_ENABLED`, Do-Not-Track, and the local opt-out) and the
 * same first-party ingest endpoint + `apiClient` transport the batched adapter
 * uses. Funnel events live in their own frozen vocabulary
 * (`lib/onboarding/events.ts`) rather than the strongly-typed product-telemetry
 * union, so they post directly instead of going through `trackTelemetryEvent`.
 */

import { apiClient } from "@/lib/apiClient";
import { getWindow } from "@/lib/env";
import { logger } from "@/lib/logger";
import { canTrackProductTelemetry } from "@/lib/telemetry/config";

import { isOnboardingEvent, type OnboardingEventName, type OnboardingEventPayload } from "./events";

const TELEMETRY_ENDPOINT = "/api/v1/product-telemetry/events";
const SCHEMA_VERSION = "2026-05-telemetry-v1";

/**
 * Emit a single onboarding funnel event.
 *
 * No-ops on the server, when product telemetry is disabled/opted-out, or when
 * `name` is not a recognised funnel event. Best-effort: prefers `sendBeacon`
 * (so the event survives a full-page navigation such as the GitHub App install
 * redirect) and falls back to a keep-alive POST.
 */
export function trackOnboardingEvent(
    name: OnboardingEventName,
    payload: OnboardingEventPayload = {},
): void {
    const win = getWindow();
    if (!win || !canTrackProductTelemetry() || !isOnboardingEvent(name)) {
        return;
    }

    const body = JSON.stringify({
        source: "dev-health-web",
        orgIdHash: payload.orgId ?? null,
        events: [
            {
                name,
                schemaVersion: SCHEMA_VERSION,
                ts: new Date().toISOString(),
                payload,
            },
        ],
    });

    try {
        if (apiClient.sendBeacon(TELEMETRY_ENDPOINT, body)) {
            return;
        }
        void apiClient
            .request(TELEMETRY_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body,
                keepalive: true,
            })
            .catch((err: unknown) => {
                logger.debug({ err, event: name }, "Onboarding funnel event send failed");
            });
    } catch (err) {
        logger.debug({ err, event: name }, "Onboarding funnel event send failed");
    }
}
