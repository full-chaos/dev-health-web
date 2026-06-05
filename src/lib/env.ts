/**
 * Environment detection utilities.
 *
 * Centralizes SSR detection logic that was previously scattered
 * across 18+ files with `typeof window === "undefined"` checks.
 */

/**
 * True when running on the server (SSR, API routes, build time).
 */
export const isServer = typeof window === "undefined";

/**
 * True when running in the browser.
 */
export const isBrowser = !isServer;

/**
 * Safe wrapper for browser-only operations.
 * Returns undefined on server, or the result of the callback on client.
 *
 * @example
 * const stored = runOnClient(() => localStorage.getItem("key"));
 */
export function runOnClient<T>(callback: () => T): T | undefined {
    if (isServer) {
        return undefined;
    }
    return callback();
}

/**
 * Get window object if available, undefined on server.
 */
export function getWindow(): Window | undefined {
    return isBrowser ? window : undefined;
}

/**
 * Get document object if available, undefined on server.
 */
export function getDocument(): Document | undefined {
    return isBrowser ? document : undefined;
}

/**
 * Get localStorage if available, undefined on server.
 */
export function getLocalStorage(): Storage | undefined {
    return runOnClient(() => localStorage);
}
