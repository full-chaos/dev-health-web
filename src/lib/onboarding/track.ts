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
 *
 * Org/user identifiers are treated exactly like the main pipeline treats them:
 * the raw org id is never placed in the body. It is pseudonymised into the
 * top-level `orgIdHash` field and the per-event `payload` is run through the
 * shared {@link sanitizeTelemetryPayload} (which strips `orgId`/`userId` and any
 * other blocked PII keys). Hashing is synchronous (`fallbackHash`, the same
 * FNV-1a primitive the pipeline falls back to) because these events are emitted
 * from `sendBeacon` paths that must survive a full-page navigation (the GitHub
 * App install redirect) and therefore cannot await SubtleCrypto.
 */

import { apiClient } from "@/lib/apiClient";
import { getWindow } from "@/lib/env";
import { logger } from "@/lib/logger";
import { canTrackProductTelemetry } from "@/lib/telemetry/config";
import { fallbackHash } from "@/lib/telemetry/hash";
import { sanitizeTelemetryPayload } from "@/lib/telemetry/sanitize";

import { isOnboardingEvent, type OnboardingEventName, type OnboardingEventPayload } from "./events";

const TELEMETRY_ENDPOINT = "/api/v1/product-telemetry/events";
const SCHEMA_VERSION = "2026-05-telemetry-v1";

/**
 * One-shot dedupe set, keyed at module scope so it is stable across component
 * remounts and React StrictMode's double-invoked effects (which both reuse this
 * module instance) but resets on a real page navigation. Guarantees the
 * effect-fired funnel events emit at most once per page load.
 */
const emittedOnceKeys = new Set<string>();

/** Emit a single onboarding funnel event.
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

    const orgIdHash = payload.orgId ? fallbackHash(payload.orgId) : null;

    const body = JSON.stringify({
        source: "dev-health-web",
        orgIdHash,
        events: [
            {
                name,
                schemaVersion: SCHEMA_VERSION,
                ts: new Date().toISOString(),
                payload: sanitizeTelemetryPayload(payload),
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

/**
 * Emit an onboarding funnel event at most once per page load. Intended for the
 * effect-fired step-view events (`workspace_setup_started`,
 * `integration_step_viewed`) which would otherwise double-send under React
 * StrictMode or a component remount. The dedupe key combines the event name and
 * org id so distinct orgs each emit once.
 */
export function trackOnboardingEventOnce(
    name: OnboardingEventName,
    payload: OnboardingEventPayload = {},
): void {
    const key = `${name}:${payload.orgId ?? ""}`;
    if (emittedOnceKeys.has(key)) {
        return;
    }
    emittedOnceKeys.add(key);
    trackOnboardingEvent(name, payload);
}

/** Test seam: clear the module-scoped one-shot dedupe set. */
export function resetOnboardingOnceTracking(): void {
    emittedOnceKeys.clear();
}
