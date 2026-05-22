/**
 * Sentry PII scrubber — centralised `beforeSend` logic.
 *
 * Exports:
 *   scrubEvent(event)          — pure transformation; no side-effects.
 *   attachBeforeSend(config)   — merges `beforeSend` into a Sentry.init() options object.
 *
 * PII rules applied (in order):
 *   1. Remove request.cookies.
 *   2. Remove request.headers.authorization.
 *   3. Remove request.headers['x-csrf-token'].
 *   4. Drop request.data for events whose request.url matches /(auth|admin\/credentials)/.
 *   5. Strip event.user.ip_address in production unless SENTRY_INCLUDE_IP=true.
 */

import * as Sentry from "@sentry/nextjs";
import type { ErrorEvent, EventHint } from "@sentry/nextjs";

/** URLs that must have their POST body dropped entirely. */
const SENSITIVE_URL_PATTERN = /\/(auth|admin\/credentials)/;

/**
 * Scrub PII from a Sentry event.
 * Returns the mutated event (mutation-in-place is safe; Sentry always provides
 * a fresh object per call) or `null` to drop the event.
 */
export function scrubEvent(event: ErrorEvent, _hint?: EventHint): ErrorEvent | null {
  if (event.request) {
    // 1. Remove cookies
    delete event.request.cookies;

    // 2 & 3. Remove sensitive headers
    if (event.request.headers) {
      // Work on a shallow copy of headers to avoid mutating across references
      const headers = { ...event.request.headers } as Record<string, string>;
      delete headers["authorization"];
      delete headers["x-csrf-token"];
      event.request.headers = headers;
    }

    // 4. Drop body for auth / credential endpoints
    const url = event.request.url ?? "";
    if (SENSITIVE_URL_PATTERN.test(url)) {
      delete event.request.data;
    }
  }

  // 5. Strip IP in production unless opt-in flag is set
  const isProduction = process.env.NODE_ENV === "production";
  const includeIp = process.env.SENTRY_INCLUDE_IP === "true";
  if (isProduction && !includeIp && event.user) {
    delete event.user.ip_address;
  }

  return event;
}

type SentryInitOptions = Parameters<typeof Sentry.init>[0];

/**
 * Attach the `beforeSend` scrubber to an existing Sentry.init() options
 * object and return the merged configuration.
 *
 * If the caller has already supplied a `beforeSend`, the scrubber runs first;
 * if it returns null the caller's handler is skipped.
 *
 * @example
 *   Sentry.init(attachBeforeSend({ dsn: publicEnv.NEXT_PUBLIC_SENTRY_DSN }));
 */
export function attachBeforeSend(config: SentryInitOptions): SentryInitOptions {
  const existing = config?.beforeSend;
  return {
    ...config,
    beforeSend(event: ErrorEvent, hint: EventHint) {
      const scrubbed = scrubEvent(event, hint);
      if (scrubbed === null) return null;
      if (existing) return existing(scrubbed, hint);
      return scrubbed;
    },
  };
}
