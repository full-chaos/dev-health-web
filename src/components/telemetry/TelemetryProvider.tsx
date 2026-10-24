"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import {
    flushTelemetryEventsOnHide,
    setTelemetryContext,
    trackTelemetryEvent,
} from "@/lib/telemetry";
import { TELEMETRY_INTERACTION_EVENT } from "@/lib/telemetry/interaction";
import { emitClientError, emitFeatureViewed } from "@/lib/telemetry/emitters";
import { hashIdentifier } from "@/lib/telemetry/hash";
import { routePatternForPathname } from "@/lib/telemetry/routePatterns";

type TelemetryProviderProps = {
    children: ReactNode;
    orgId?: string | null;
    userId?: string | null;
};

function anonymousFallbackId(): string {
    return (
        globalThis.crypto?.randomUUID?.() ??
        `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    );
}

export function TelemetryProvider({ children, orgId, userId }: TelemetryProviderProps) {
    const pathname = usePathname();
    const sessionStartMsRef = useRef<number | null>(null);
    const pagesViewedRef = useRef(0);
    const interactionsRef = useRef(0);
    const sessionStartedRef = useRef(false);
    const previousRoutePatternRef = useRef<string | null>(null);
    // Events of one page life must carry one identity: hold the mount events until it is set.
    const [identityReady, setIdentityReady] = useState(false);
    useEffect(() => {
        let cancelled = false;
        async function applyIdentity() {
            const [anonymousUserId, orgIdHash] = await Promise.all([
                hashIdentifier(userId || anonymousFallbackId()),
                orgId ? hashIdentifier(orgId) : Promise.resolve(null),
            ]);
            if (!cancelled) {
                // No SubtleCrypto: no digest is made. The id then falls back to the stored random
                // one (derived from nothing) and the org stays absent.
                setTelemetryContext({ anonymousUserId: anonymousUserId ?? undefined, orgIdHash });
                setIdentityReady(true);
            }
        }
        applyIdentity().catch(() => {
            // Hashing failed: go on with the stored fallback identity rather than send nothing.
            if (!cancelled) {
                setIdentityReady(true);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [orgId, userId]);

    useEffect(() => {
        if (!identityReady) {
            return;
        }
        const routePattern = routePatternForPathname(pathname || "/");
        const previousRoutePattern = previousRoutePatternRef.current;
        if (previousRoutePattern === routePattern && sessionStartedRef.current) {
            return;
        }

        setTelemetryContext({ routePattern });
        if (!sessionStartedRef.current) {
            trackTelemetryEvent("session_started", { entryRoutePattern: routePattern });
            sessionStartedRef.current = true;
        }
        trackTelemetryEvent("page_viewed", {
            routePattern,
            page: routePattern,
            referrerRoutePattern: previousRoutePattern,
        });
        emitFeatureViewed(routePattern);
        pagesViewedRef.current += 1;
        previousRoutePatternRef.current = routePattern;
    }, [pathname, identityReady]);

    useEffect(() => {
        sessionStartMsRef.current ??= performance.now();
        const recordInteraction = () => {
            interactionsRef.current += 1;
        };
        // One session_ended per visible period: hidden then pagehide (a tab close)
        // is one hide. Re-armed when the page is visible again or restored from bfcache.
        let endedThisPeriod = false;
        const endSession = () => {
            if (endedThisPeriod) {
                flushTelemetryEventsOnHide();
                return;
            }
            endedThisPeriod = true;
            const startedAt = sessionStartMsRef.current ?? performance.now();
            trackTelemetryEvent("session_ended", {
                durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
                pagesViewed: pagesViewedRef.current,
                interactions: interactionsRef.current,
            });
            flushTelemetryEventsOnHide();
        };
        const endWhenHidden = () => {
            if (document.visibilityState === "hidden") {
                endSession();
            } else {
                endedThisPeriod = false;
            }
        };
        const onPageShow = (event: PageTransitionEvent) => {
            if (event.persisted) {
                endedThisPeriod = false;
            }
        };
        const onWindowError = (event: ErrorEvent) => emitClientError("global", event.error);
        const onRejection = (event: PromiseRejectionEvent) =>
            emitClientError("global", event.reason);
        window.addEventListener("error", onWindowError);
        window.addEventListener("unhandledrejection", onRejection);
        window.addEventListener(TELEMETRY_INTERACTION_EVENT, recordInteraction);
        window.addEventListener("pagehide", endSession);
        window.addEventListener("pageshow", onPageShow);
        document.addEventListener("visibilitychange", endWhenHidden);
        return () => {
            window.removeEventListener("error", onWindowError);
            window.removeEventListener("unhandledrejection", onRejection);
            window.removeEventListener(TELEMETRY_INTERACTION_EVENT, recordInteraction);
            window.removeEventListener("pagehide", endSession);
            window.removeEventListener("pageshow", onPageShow);
            document.removeEventListener("visibilitychange", endWhenHidden);
        };
    }, []);

    return <>{children}</>;
}
