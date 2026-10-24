"use client";

import { useEffect } from "react";

import { getLocalStorage } from "@/lib/env";
import { trackOnboardingEvent } from "@/lib/onboarding/track";
import { hashIdentifier } from "@/lib/telemetry/hash";

const STORAGE_KEY_PREFIX = "devhealth-signup-completed:";
// Domain separation: the digest cannot be joined to orgIdHash or the anonymous id.
const HASH_DOMAIN = "devhealth:signup-completed:v1:";
// Raw ids, in memory only and set before the async hash: a remount or StrictMode re-run
// cannot start a second emission, and it is the only guard when storage cannot be used.
const handledThisPage = new Set<string>();

let afterRead: () => Promise<void> | void = () => undefined;

/** Test seam: forget what this page life already handled. */
export function resetSignupCompletedForTests(): void {
    handledThisPage.clear();
    afterRead = () => undefined;
}

/** Test seam: run something between the marker read and the marker write (models another tab). */
export function setAfterReadForTests(hook: () => Promise<void> | void): void {
    afterRead = hook;
}

/**
 * True when this tab should send the event: no marker was stored yet, and the marker is now
 * written. Any storage failure answers true: a failure leans toward one duplicate, never a
 * lost first event.
 */
async function claim(key: string): Promise<boolean> {
    try {
        const storage = getLocalStorage();
        if (!storage) return true;
        if (storage.getItem(key) !== null) return false;
        await afterRead();
        storage.setItem(key, "1");
        return true;
    } catch {
        return true;
    }
}

async function claimExclusively(key: string): Promise<boolean> {
    const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
    if (!locks?.request) return claim(key);
    try {
        // The read happens inside the lock, so a second tab sees the first tab's marker.
        return await locks.request(key, { mode: "exclusive" }, () => claim(key));
    } catch {
        return claim(key);
    }
}

async function emitOnce(userId: string): Promise<void> {
    // Without SubtleCrypto no identifier-derived string is made or stored: the in-memory
    // guard alone keeps this page life to one event.
    if (globalThis.crypto?.subtle) {
        const key = STORAGE_KEY_PREFIX + (await hashIdentifier(HASH_DOMAIN + userId));
        if (!(await claimExclusively(key))) return;
    }
    trackOnboardingEvent("signup_completed");
}

/**
 * Counts a social sign-up in the funnel: the sign-in that created the account carries
 * `isNewUser`, and the event goes out once per browser and user. Storage holds only a
 * SHA-256 digest of the user id, never the id or an e-mail.
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
