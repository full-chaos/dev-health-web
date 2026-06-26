/**
 * CHAOS-2683 onboarding funnel event vocabulary (frozen, lead-owned).
 *
 * The guided-onboarding surfaces (CHAOS-2674/2675/2678/2681) import these
 * constants and emit each event exactly once at the matching step. Emission is
 * gated by `NEXT_PUBLIC_TELEMETRY_ENABLED` (see `lib/telemetry/config.ts`).
 * Payloads carry org/user identifiers only where safe.
 */

export const ONBOARDING_EVENTS = [
    "signup_completed",
    "workspace_setup_started",
    "workspace_created",
    "integration_step_viewed",
    "github_app_install_started",
    "github_app_connected",
    "integration_skipped",
    "first_sync_started",
    "onboarding_completed",
    "dashboard_viewed_without_integration",
] as const;

export type OnboardingEventName = (typeof ONBOARDING_EVENTS)[number];

/** Identifiers safe to attach to a funnel event. */
export interface OnboardingEventIdentity {
    orgId?: string | null;
    userId?: string | null;
}

/** Base payload shared by every onboarding funnel event. */
export type OnboardingEventPayload = OnboardingEventIdentity & {
    [key: string]: string | number | boolean | null | undefined;
};

/** Type guard: is `name` a known onboarding funnel event? */
export function isOnboardingEvent(name: string): name is OnboardingEventName {
    return (ONBOARDING_EVENTS as readonly string[]).includes(name);
}
