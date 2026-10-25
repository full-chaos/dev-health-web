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
import {
    digestGeneration,
    digestOnce,
    getCachedDigest,
    resetDigestCacheForTests,
} from "@/lib/telemetry/digestCache";
import { sanitizeTelemetryPayload } from "@/lib/telemetry/sanitize";
import { closeTelemetryEvent } from "@/lib/telemetry/schema";

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

type SendWithOrg = (orgIdHash: string | null) => void;
type QueuedSend = { seq: number; send: SendWithOrg };

/** Events waiting for an org's digest, in call order; one digest per org is in flight at a time. */
const pendingSends = new Map<string, { sends: QueuedSend[]; flushed: boolean }>();
let callSeq = 0;

/**
 * The page is going away (a full-page navigation such as the GitHub App install redirect, or a
 * tab close): events still waiting for a digest are sent now, in call order, without an org
 * value, so none is lost. They are marked flushed, so a digest that resolves later never
 * sends them again.
 */
function flushPendingForPageExit(): void {
    const queued: QueuedSend[] = [];
    for (const [orgId, entry] of [...pendingSends]) {
        entry.flushed = true;
        pendingSends.delete(orgId);
        queued.push(...entry.sends);
    }
    // Global call order, across orgs.
    for (const { send } of queued.sort((x, y) => x.seq - y.seq)) send(null);
}

let exitListeners: { win: Window; onHide: () => void; onVisibility: () => void } | null = null;
function installExitListeners(): void {
    if (exitListeners) return;
    const win = getWindow();
    if (!win) return;
    const onVisibility = (): void => {
        if (win.document.visibilityState === "hidden") flushPendingForPageExit();
    };
    exitListeners = { win, onHide: flushPendingForPageExit, onVisibility };
    win.addEventListener("pagehide", flushPendingForPageExit);
    win.document.addEventListener("visibilitychange", onVisibility);
}

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
        const funnelEvent = closeTelemetryEvent({
            name: "feature_viewed" as const,
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
        });
        if (!funnelEvent) {
            logger.debug(
                { event: name },
                "Onboarding event dropped: an envelope value is outside its closed set",
            );
            return;
        }
        const body = JSON.stringify({
            source: "dev-health-web",
            orgIdHash: funnelEvent.orgIdHash,
            events: [funnelEvent],
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
    const waiting = pendingSends.get(orgId);
    if (waiting !== undefined) {
        // A digest for this org is in flight: queue behind the earlier events so the send
        // order is the call order.
        waiting.sends.push({ seq: callSeq++, send });
        return;
    }
    const cached = getCachedDigest(orgId);
    if (cached !== undefined) {
        send(cached);
        return;
    }
    const entry = { sends: [{ seq: callSeq++, send }] as QueuedSend[], flushed: false };
    pendingSends.set(orgId, entry);
    installExitListeners();
    const startedIn = digestGeneration();
    const settle = (digest: string | null): void => {
        if (startedIn !== digestGeneration() || entry.flushed) return;
        pendingSends.delete(orgId);
        for (const queued of entry.sends) queued.send(digest);
    };
    digestOnce(orgId).then(settle, () => {
        // A failed digest is not cached and its waiting events are dropped: never sent with a
        // weaker value or the raw id. The next event for the org tries the digest again.
        if (startedIn === digestGeneration() && !entry.flushed) pendingSends.delete(orgId);
    });
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
    resetDigestCacheForTests();
    pendingSends.clear();
    if (exitListeners) {
        exitListeners.win.removeEventListener("pagehide", exitListeners.onHide);
        exitListeners.win.document.removeEventListener(
            "visibilitychange",
            exitListeners.onVisibility,
        );
        exitListeners = null;
    }
}
