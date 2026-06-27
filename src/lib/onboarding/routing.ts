/**
 * CHAOS-2674 guided-onboarding routing helpers.
 *
 * Routing is derived from the C1 onboarding-state `next_step` alone (never the
 * feature flag), so the user always lands on the step the backend says they are
 * on. Centralised here so the entry page and the direct step routes
 * (workspace/integration/complete) share one alignment contract — a user
 * landing directly on the wrong step is redirected per `next_step`.
 */

import type { OnboardingNextStep } from "./types";

/** C1: `GET /api/v1/auth/onboarding/state`. Single source of truth for routing. */
export const ONBOARDING_STATE_ENDPOINT = "/api/v1/auth/onboarding/state";

/** Team-trial checkout entry, used once onboarding completes for that intent. */
export const TRIAL_CHECKOUT = "/auth/trial-checkout?plan=team&trial=true";

/** Append the team-trial query params to a guided step path when that intent is active. */
export function withTrial(path: string, trialIntent: boolean): string {
    if (!trialIntent) return path;
    return `${path}?plan=team&trial=true`;
}

/**
 * Map a C1 `next_step` to its concrete guided route (trial intent preserved).
 * `dashboard` means onboarding is finished, so we leave the guided flow.
 */
export function targetForNextStep(nextStep: OnboardingNextStep, trialIntent: boolean): string {
    switch (nextStep) {
        case "workspace":
            return withTrial("/auth/onboard/workspace", trialIntent);
        case "integration":
            return withTrial("/auth/onboard/integration", trialIntent);
        case "complete":
            return withTrial("/auth/onboard/complete", trialIntent);
        case "dashboard":
            return onboardedDestination(trialIntent);
    }
}

/**
 * Product destination for a user who has already finished onboarding. Never a
 * guided step — used as the safe fallback when C1 is unavailable but the
 * session already shows a completed org, so a transient failure can never
 * strand an onboarded user on a setup step.
 */
export function onboardedDestination(trialIntent: boolean): string {
    return trialIntent ? TRIAL_CHECKOUT : "/dashboard";
}
