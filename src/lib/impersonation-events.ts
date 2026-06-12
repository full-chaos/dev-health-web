/**
 * Cross-tab impersonation event plumbing (CHAOS-2347).
 *
 * Impersonation state is per ADMIN USER on the server (DB session + shared
 * cookie), so a start/stop in one tab changes the effective org in EVERY tab
 * of the browser. Without a push signal, other tabs only notice on their next
 * 30s-throttled session poll. A BroadcastChannel lets every tab force the
 * server-verified re-poll (`update({ impersonationChanged: true })`) the
 * moment any tab starts or stops impersonating.
 *
 * Client-only: every export guards on BroadcastChannel availability so the
 * module is safe to import from shared code paths.
 */

export const IMPERSONATION_CHANNEL = "dev-health:impersonation";

/**
 * `window.name` marker for the tab opened by the Impersonate buttons.
 * Identifies the tab that should self-close when impersonation stops —
 * without it, any tab that happens to have an opener would close.
 */
export const IMPERSONATION_WINDOW_NAME = "dev-health-impersonation";

export type ImpersonationEvent = { type: "started" } | { type: "stopped" };

export function broadcastImpersonationEvent(event: ImpersonationEvent): void {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(IMPERSONATION_CHANNEL);
    channel.postMessage(event);
    channel.close();
}

/**
 * Subscribe to impersonation events from OTHER tabs. Returns an unsubscribe
 * callback (no-op when BroadcastChannel is unavailable, e.g. jsdom).
 */
export function onImpersonationEvent(handler: (event: ImpersonationEvent) => void): () => void {
    if (typeof BroadcastChannel === "undefined") return () => {};
    const channel = new BroadcastChannel(IMPERSONATION_CHANNEL);
    channel.onmessage = (message: MessageEvent) => {
        const data = message.data as ImpersonationEvent | undefined;
        if (data?.type === "started" || data?.type === "stopped") {
            handler(data);
        }
    };
    return () => channel.close();
}

/** True when this tab is the impersonation tab opened by an Impersonate button. */
export function isImpersonationWindow(): boolean {
    return typeof window !== "undefined" && window.name === IMPERSONATION_WINDOW_NAME;
}

/**
 * Open (or reuse) the impersonation tab synchronously — MUST be called inside
 * the click handler, before any `await`, or popup blockers may eat it: the
 * user-gesture context does not reliably survive a network round-trip.
 * Returns null when blocked; callers fall back to same-tab navigation.
 */
export function openImpersonationWindow(): Window | null {
    if (typeof window === "undefined") return null;
    return window.open("", IMPERSONATION_WINDOW_NAME);
}
