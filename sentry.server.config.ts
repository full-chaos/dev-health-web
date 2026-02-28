/**
 * Sentry server-side configuration.
 *
 * This file is loaded by Next.js server runtime automatically.
 * Configure server-side error tracking and performance here.
 */
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Capture 10% of server-side transactions in production.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",

  // Don't report errors from test/CI runs.
  beforeSend(event) {
    if (process.env.DEV_HEALTH_TEST_MODE === "true") {
      return null;
    }
    return event;
  },
});
