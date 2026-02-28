/**
 * Sentry client-side configuration.
 *
 * This file is loaded in the browser automatically by @sentry/nextjs.
 * Configure client-side error tracking, replay, and performance here.
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Capture 10% of transactions for performance monitoring in production.
  // Increase in staging / dev as needed.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Replay 1% of sessions and 100% of sessions with errors.
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 1.0,

  // Enable session replay only in production to avoid noise.
  integrations:
    process.env.NODE_ENV === "production"
      ? [
          Sentry.replayIntegration({
            maskAllText: true,
            blockAllMedia: true,
          }),
        ]
      : [],

  environment: process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV ?? "development",

  // Reduce noise from browser extensions and non-app errors.
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    /^Loading chunk \d+ failed/,
  ],

  beforeSend(event) {
    // Never send events in test mode.
    if (
      process.env.NEXT_PUBLIC_DEV_HEALTH_TEST_MODE === "true" ||
      process.env.DEV_HEALTH_TEST_MODE === "true"
    ) {
      return null;
    }
    return event;
  },
});
