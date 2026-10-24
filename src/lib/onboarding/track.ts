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
 * other blocked PII keys). The digest is SHA-256, the same as the
 * other events carry and the read side joins on. A cached digest keeps the send
 * synchronous (the events fired just before a full-page navigation, such as the
 * GitHub App install redirect, need that); the first event for an org waits for the
 * digest. Without SubtleCrypto the org is left out: no weaker hash is made.
 */

import { apiClient } from "@/lib/apiClient";
import { getWindow } from "@/lib/env";
import { logger } from "@/lib/logger";
import { canTrackProductTelemetry } from "@/lib/telemetry/config";
import { telemetryEnvelopeIdentity } from "@/lib/telemetry";
import { hashIdentifier } from "@/lib/telemetry/hash";
import { sanitizeTelemetryPayload } from "@/lib/telemetry/sanitize";

import { isOnboardingEvent, type OnboardingEventName, type OnboardingEventPayload } from "./events";

const TELEMETRY_ENDPOINT = "/api/v1/product-telemetry/events";
const SCHEMA_VERSION = "2026-05-telemetry-v1";
const ONBOARDING_FEATURE = "onboarding_funnel";
/** Closed set of extra payload keys a funnel event may carry, each with a closed value rule; anything else is dropped, so no identifier leaves under any key or value. */
const STEP_MAX = 99;
function isAllowedExtra(key: string, value: unknown): boolean {
    return (
        key === "step" &&
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= 0 &&
        value <= STEP_MAX
    );
}
const ONBOARDING_ROUTE_FALLBACK = "/onboarding";

/**
 * One-shot dedupe set, keyed at module scope so it is stable across component
 * remounts and React StrictMode's double-invoked effects (which both reuse this
 * module instance) but resets on a real page navigation. Guarantees the
 * effect-fired funnel events emit at most once per page load.
 */
const emittedOnceKeys = new Set<string>();

/** SHA-256 digest per org id, so a repeat event for the same org can send synchronously. */
const orgHashes = new Map<string, string>();

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

    const allowed = Object.fromEntries(
        Object.entries(payload).filter(([key, value]) => isAllowedExtra(key, value)),
    );
    const sanitized = sanitizeTelemetryPayload(allowed);
    if (!sanitized.ok) {
        logger.debug(
            { event: name, key: sanitized.key },
            "Onboarding event dropped: a payload value is out of bounds",
        );
        return;
    }

    const now = Date.now();
    const identity = telemetryEnvelopeIdentity(now);
    const routePattern = identity.routePattern ?? ONBOARDING_ROUTE_FALLBACK;
    const extras = sanitized.payload;

    const send = (orgIdHash: string | null): void => {
        // The intake accepts a fixed set of event names: every funnel event goes out as
        // feature_viewed, with the funnel name as the surface.
        const body = JSON.stringify({
            source: "dev-health-web",
            orgIdHash,
            events: [
                {
                    name: "feature_viewed",
                    schemaVersion: SCHEMA_VERSION,
                    eventId: identity.eventId,
                    ts: new Date(now).toISOString(),
                    sessionId: identity.sessionId,
                    anonymousUserId: identity.anonymousUserId,
                    orgIdHash,
                    routePattern,
                    payload: {
                        ...extras,
                        feature: ONBOARDING_FEATURE,
                        surface: name,
                        routePattern,
                    },
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
    };

    // The org digest is SHA-256 like every other event's (the read side joins on it). A cached
    // digest keeps the send synchronous, which the pre-navigation events need; the first event
    // for an org waits for the digest and warms the cache. Without SubtleCrypto the org is
    // simply absent: no weaker hash is made.
    const orgId = typeof payload.orgId === "string" && payload.orgId ? payload.orgId : null;
    if (orgId === null) {
        send(null);
        return;
    }
    const cached = orgHashes.get(orgId);
    if (cached !== undefined) {
        send(cached);
        return;
    }
    hashIdentifier(orgId)
        .then((digest) => {
            if (digest !== null) orgHashes.set(orgId, digest);
            send(digest);
        })
        .catch(() => send(null));
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
    orgHashes.clear();
}
