/**
 * CHAOS-2683 onboarding funnel emit bus (dashboard surfaces).
 *
 * Thin client-side emitter for the frozen funnel vocabulary in `./events`.
 * Emission is gated by `NEXT_PUBLIC_TELEMETRY_ENABLED` (via
 * `canTrackProductTelemetry`) plus Do-Not-Track / opt-out, mirroring the
 * product-telemetry pipeline. Rather than widening the strongly-typed
 * `trackTelemetryEvent` schema, onboarding events are dispatched on a window
 * CustomEvent bus (the same idiom `useTrackEvent` uses for interaction pings),
 * so a telemetry bridge can forward them without coupling the frozen
 * `events.ts`/`telemetry/types.ts` shapes.
 *
 * Each funnel surface (CHAOS-2674/2675/2678/2681) emits each event exactly once
 * at the matching step. This module owns ONLY the dashboard-surface emits.
 */
import { getWindow } from "@/lib/env";
import { canTrackProductTelemetry } from "@/lib/telemetry/config";

import type { OnboardingEventName, OnboardingEventPayload } from "./events";

/** Window CustomEvent name carrying a single onboarding funnel event. */
export const ONBOARDING_TELEMETRY_EVENT = "devhealth:onboarding-event";

/** Detail shape dispatched on {@link ONBOARDING_TELEMETRY_EVENT}. */
export type OnboardingTelemetryDetail = {
    name: OnboardingEventName;
    payload: OnboardingEventPayload;
};

/**
 * Emit a single onboarding funnel event.
 *
 * No-op (returns `false`) on the server, when telemetry is disabled via
 * `NEXT_PUBLIC_TELEMETRY_ENABLED=false`, or when the user has opted out / has
 * Do-Not-Track enabled. Returns `true` when the event was dispatched.
 */
export function emitOnboardingEvent(
    name: OnboardingEventName,
    payload: OnboardingEventPayload = {},
): boolean {
    const win = getWindow();
    if (!win || !canTrackProductTelemetry()) {
        return false;
    }
    win.dispatchEvent(
        new CustomEvent<OnboardingTelemetryDetail>(ONBOARDING_TELEMETRY_EVENT, {
            detail: { name, payload },
        }),
    );
    return true;
}
