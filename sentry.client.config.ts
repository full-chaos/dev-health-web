import { publicEnv } from "@/lib/config";
import { getReplayRoutePrefixes, shouldLoadReplayForPath } from "@/lib/sentry/replay";
import { attachBeforeSend, scrubReplayRecordingEvent } from "@/lib/sentry/scrubber";

import * as Sentry from "@sentry/nextjs";

/**
 * Sentry Replay gating — rationale
 * --------------------------------
 * Session Replay is ~40KB gzipped and runs a MutationObserver over the entire
 * DOM. Historically we initialized it unconditionally on every route, which
 * meant 100% of clients paid the bundle + runtime cost even though production
 * only samples 10% of sessions.
 *
 * We now lazy-load Replay via `Sentry.lazyLoadIntegration()` so the Replay SDK
 * is fetched from the Sentry CDN on-demand and is NOT part of the initial
 * client bundle for non-admin routes. Error reporting (Sentry.init) remains
 * active on every route — gating Replay does not change the error-capture
 * path, nor does it affect `replaysSessionSampleRate` /
 * `replaysOnErrorSampleRate` (those only apply once Replay is loaded).
 *
 * Default gate: `/org/admin`, legacy `/admin`, and `/superadmin` — problem-finding
 * value is highest on operator/administrator surfaces where session context is diagnostic.
 *
 * Override via `NEXT_PUBLIC_SENTRY_REPLAY_ROUTES` (comma-separated path
 * prefixes). Examples:
 *   NEXT_PUBLIC_SENTRY_REPLAY_ROUTES="/org/admin,/superadmin,/reports"
 *   NEXT_PUBLIC_SENTRY_REPLAY_ROUTES=""       // disables Replay everywhere
 */
function shouldLoadReplay(): boolean {
    if (typeof window === "undefined") return false;
    if (window.location.pathname.endsWith("/callback")) return false;
    return shouldLoadReplayForPath(
        window.location.pathname,
        getReplayRoutePrefixes(process.env.NEXT_PUBLIC_SENTRY_REPLAY_ROUTES),
    );
}

Sentry.init(
    attachBeforeSend({
        dsn: publicEnv.NEXT_PUBLIC_SENTRY_DSN,
        environment: process.env.NODE_ENV,
        tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
        replaysSessionSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
        replaysOnErrorSampleRate: 1.0,
        sendDefaultPii: false,
    }),
);

if (shouldLoadReplay()) {
    void Sentry.lazyLoadIntegration("replayIntegration")
        .then((replayIntegration) => {
            if (replayIntegration) {
                Sentry.addIntegration(
                    replayIntegration({ beforeAddRecordingEvent: scrubReplayRecordingEvent }),
                );
            }
        })
        .catch((error) => {
            console.warn("[sentry] Failed to lazy-load Replay integration", error);
        });
}
