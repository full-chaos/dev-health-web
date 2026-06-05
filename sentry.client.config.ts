import { publicEnv } from "@/lib/config";
import { attachBeforeSend } from "@/lib/sentry/scrubber";

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
 * Default gate: `/admin` and `/superadmin` — problem-finding value is highest
 * on operator/administrator surfaces where session context is diagnostic.
 *
 * Override via `NEXT_PUBLIC_SENTRY_REPLAY_ROUTES` (comma-separated path
 * prefixes). Examples:
 *   NEXT_PUBLIC_SENTRY_REPLAY_ROUTES="/admin,/superadmin,/reports"
 *   NEXT_PUBLIC_SENTRY_REPLAY_ROUTES=""       // disables Replay everywhere
 */
const DEFAULT_REPLAY_ROUTE_PREFIXES = ["/admin", "/superadmin"] as const;

function getReplayRoutePrefixes(): readonly string[] {
    const raw = process.env.NEXT_PUBLIC_SENTRY_REPLAY_ROUTES;
    if (raw === undefined) return DEFAULT_REPLAY_ROUTE_PREFIXES;
    return raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

function shouldLoadReplay(): boolean {
    if (typeof window === "undefined") return false;
    const prefixes = getReplayRoutePrefixes();
    if (prefixes.length === 0) return false;
    const path = window.location.pathname;
    return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
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
                Sentry.addIntegration(replayIntegration());
            }
        })
        .catch((error) => {
            console.warn("[sentry] Failed to lazy-load Replay integration", error);
        });
}
