"use client";

import { useEffect } from "react";

import { getLocalStorage } from "@/lib/env";
import { trackOnboardingEvent } from "@/lib/onboarding/track";

const STORAGE_KEY_PREFIX = "devhealth-signup-completed:";
// Fallback when storage is missing or throws: still once per page life.
const emittedThisPage = new Set<string>();

function alreadyEmitted(userId: string): boolean {
    if (emittedThisPage.has(userId)) return true;
    try {
        return getLocalStorage()?.getItem(STORAGE_KEY_PREFIX + userId) !== null;
    } catch {
        return false;
    }
}

function markEmitted(userId: string): void {
    emittedThisPage.add(userId);
    try {
        getLocalStorage()?.setItem(STORAGE_KEY_PREFIX + userId, "1");
    } catch {
        // The in-memory set still holds for this page life.
    }
}

/** Test seam: forget what this page life already emitted. */
export function resetSignupCompletedForTests(): void {
    emittedThisPage.clear();
}

/**
 * Counts a social sign-up in the funnel: the sign-in that created the account carries
 * `isNewUser`, and the event goes out once per browser and user. The key holds the opaque
 * user id only.
 */
export function SignupCompletedEmitter({
    isNewUser,
    userId,
}: {
    readonly isNewUser: boolean;
    readonly userId?: string | null;
}) {
    useEffect(() => {
        if (!isNewUser || !userId || alreadyEmitted(userId)) return;
        markEmitted(userId);
        trackOnboardingEvent("signup_completed");
    }, [isNewUser, userId]);
    return null;
}
