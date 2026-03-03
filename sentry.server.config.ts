import * as Sentry from "@sentry/nextjs";

// Compatible with GlitchTip (Sentry-protocol compatible) and Sentry SaaS/self-hosted.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
});
