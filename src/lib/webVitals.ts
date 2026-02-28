/**
 * Web Vitals / RUM reporter for dev-health-web.
 *
 * Collects Core Web Vitals (LCP, INP, CLS, FCP, TTFB) and reports them via
 * structured logging and an optional `/api/v1/rum` endpoint.
 *
 * Usage — add to Next.js instrumentation or a layout component:
 *   import { initWebVitals } from "@/lib/webVitals";
 *   initWebVitals();
 */

import { logger } from "@/lib/logger";

export type WebVitalsMetric = {
  id: string;
  name: string;
  value: number;
  delta: number;
  rating: "good" | "needs-improvement" | "poor";
  navigationType: string;
};

/**
 * Report to a custom `/api/v1/rum` analytics endpoint when available.
 * Uses sendBeacon so it doesn't block page unload.
 */
function reportToEndpoint(metric: WebVitalsMetric): void {
  const endpoint = "/api/v1/rum";
  const body = JSON.stringify({
    name: metric.name,
    value: metric.value,
    delta: metric.delta,
    rating: metric.rating,
    id: metric.id,
    navigation_type: metric.navigationType,
    ts: Date.now(),
    url: typeof window !== "undefined" ? window.location.pathname : undefined,
  });

  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
  } else {
    fetch(endpoint, {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    }).catch((err: unknown) => {
      // Best-effort fire-and-forget; log but do not crash.
      logger.debug({ err }, "webVitals: RUM endpoint unreachable");
    });
  }
}

/**
 * Process a Web Vitals metric — called by Next.js or our own observer.
 */
export function onVital(metric: WebVitalsMetric): void {
  logger.info(
    { metric: metric.name, value: metric.value, rating: metric.rating },
    "web-vital"
  );

  if (process.env.NEXT_PUBLIC_RUM_ENDPOINT) {
    reportToEndpoint(metric);
  }
}

/**
 * Initialise Web Vitals collection using the web-vitals library.
 *
 * Call once from a Client Component or layout effect.
 * Safe to call multiple times (observers are only registered once).
 */
let _initialized = false;

export function initWebVitals(): void {
  if (typeof window === "undefined" || _initialized) return;
  _initialized = true;

  import("web-vitals").then(({ onCLS, onINP, onLCP, onFCP, onTTFB }) => {
    onCLS(onVital as Parameters<typeof onCLS>[0]);
    onINP(onVital as Parameters<typeof onINP>[0]);
    onLCP(onVital as Parameters<typeof onLCP>[0]);
    onFCP(onVital as Parameters<typeof onFCP>[0]);
    onTTFB(onVital as Parameters<typeof onTTFB>[0]);
  }).catch((err: unknown) => {
    // web-vitals failed to load (browser doesn't support it).
    logger.debug({ err }, "webVitals: web-vitals library failed to load");
  });
}
