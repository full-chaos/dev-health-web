"use client";

import { useEffect } from "react";

import { getLocalStorage } from "@/lib/env";
import { trackOnboardingEvent } from "@/lib/onboarding/track";
import { hashIdentifier } from "@/lib/telemetry/hash";

const STORAGE_KEY_PREFIX = "devhealth-signup-completed:";
// Domain separation: the digest cannot be joined to orgIdHash or the anonymous id.
const HASH_DOMAIN = "devhealth:signup-completed:v1:";
// Raw ids, in memory only and set before the async hash: a remount or StrictMode re-run
// cannot start a second emission, and it is the fallback when storage throws.
const handledThisPage = new Set<string>();

/** Test seam: forget what this page life already handled. */
export function resetSignupCompletedForTests(): void {
    handledThisPage.clear();
}

async function emitOnce(userId: string): Promise<void> {
    const key = STORAGE_KEY_PREFIX + (await hashIdentifier(HASH_DOMAIN + userId));
    try {
        const storage = getLocalStorage();
        if (storage) {
            if (storage.getItem(key) !== null) return;
            storage.setItem(key, "1");
        }
    } catch {
        // The in-memory set still holds for this page life.
    }
    trackOnboardingEvent("signup_completed");
}

/**
 * Counts a social sign-up in the funnel: the sign-in that created the account carries
 * `isNewUser`, and the event goes out once per browser and user. Storage holds only a
 * hash of the user id, never the id or an e-mail.
 */
export function SignupCompletedEmitter({
    isNewUser,
    userId,
}: {
    readonly isNewUser: boolean;
    readonly userId?: string | null;
}) {
    useEffect(() => {
        if (!isNewUser || !userId || handledThisPage.has(userId)) return;
        handledThisPage.add(userId);
        emitOnce(userId).catch(() => undefined);
    }, [isNewUser, userId]);
    return null;
}
