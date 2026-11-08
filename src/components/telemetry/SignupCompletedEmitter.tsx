"use client";

import { useEffect } from "react";

import { getLocalStorage } from "@/lib/env";
import { trackOnboardingEvent } from "@/lib/onboarding/track";
import { hashIdentifier } from "@/lib/telemetry/hash";

const STORAGE_KEY_PREFIX = "devhealth-signup-completed:";
// Domain separation: the digest cannot be joined to orgIdHash or the anonymous id.
const HASH_DOMAIN = "devhealth:signup-completed:v1:";
// Second marker, a first-party functional cookie: it survives a cleared localStorage while the
// session token still says the account is new (CHAOS-11104). One year outlasts the session.
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
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

function hasCookieMarker(key: string): boolean {
    if (typeof document === "undefined") return false;
    return document.cookie.split(";").some((part) => part.trim().startsWith(`${key}=`));
}

function writeCookieMarker(key: string): void {
    if (typeof document === "undefined") return;
    const secure =
        typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${key}=1; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
}

/**
 * True when this tab should send the event: no marker (storage or cookie) was stored yet, and
 * the markers are now written. Any storage failure answers true: a failure leans toward one duplicate, never a
 * lost first event.
 */
async function claim(key: string): Promise<boolean> {
    try {
        const storage = getLocalStorage();
        if (!storage) return true;
        if (storage.getItem(key) !== null || hasCookieMarker(key)) return false;
        await afterRead();
        storage.setItem(key, "1");
        try {
            writeCookieMarker(key);
        } catch {
            // The cookie is a second guard only; a failed write keeps the first marker.
        }
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
        const digest = await hashIdentifier(HASH_DOMAIN + userId);
        if (digest !== null && !(await claimExclusively(STORAGE_KEY_PREFIX + digest))) return;
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
