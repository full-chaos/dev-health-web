"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { setTelemetryContext, trackTelemetryEvent } from "@/lib/telemetry";
import { routePatternForPathname } from "@/lib/telemetry/routePatterns";

type TelemetryProviderProps = {
  children: ReactNode;
  orgId?: string | null;
  userId?: string | null;
};

const TELEMETRY_INTERACTION_EVENT = "devhealth:telemetry-interaction";

function fallbackHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

async function hashIdentifier(input: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    return fallbackHash(input);
  }
  const encoded = new TextEncoder().encode(input);
  const digest = await subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function anonymousFallbackId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function TelemetryProvider({ children, orgId, userId }: TelemetryProviderProps) {
  const pathname = usePathname();
  const sessionStartMsRef = useRef<number>(performance.now());
  const pagesViewedRef = useRef(0);
  const interactionsRef = useRef(0);
  const sessionStartedRef = useRef(false);
  const previousRoutePatternRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function applyIdentity() {
      const [anonymousUserId, orgIdHash] = await Promise.all([
        hashIdentifier(userId || anonymousFallbackId()),
        orgId ? hashIdentifier(orgId) : Promise.resolve(null),
      ]);
      if (!cancelled) {
        setTelemetryContext({ anonymousUserId, orgIdHash });
      }
    }
    void applyIdentity();
    return () => {
      cancelled = true;
    };
  }, [orgId, userId]);

  useEffect(() => {
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
    pagesViewedRef.current += 1;
    previousRoutePatternRef.current = routePattern;
  }, [pathname]);

  useEffect(() => {
    const recordInteraction = () => {
      interactionsRef.current += 1;
    };
    const endSession = () => {
      trackTelemetryEvent("session_ended", {
        durationMs: Math.max(0, Math.round(performance.now() - sessionStartMsRef.current)),
        pagesViewed: pagesViewedRef.current,
        interactions: interactionsRef.current,
      });
    };
    const endWhenHidden = () => {
      if (document.visibilityState === "hidden") {
        endSession();
      }
    };
    window.addEventListener(TELEMETRY_INTERACTION_EVENT, recordInteraction);
    window.addEventListener("pagehide", endSession);
    document.addEventListener("visibilitychange", endWhenHidden);
    return () => {
      window.removeEventListener(TELEMETRY_INTERACTION_EVENT, recordInteraction);
      window.removeEventListener("pagehide", endSession);
      document.removeEventListener("visibilitychange", endWhenHidden);
    };
  }, []);

  return <>{children}</>;
}
