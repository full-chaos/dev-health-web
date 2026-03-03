import * as Sentry from "@sentry/nextjs";

// Session replay is only supported by Sentry SaaS/self-hosted, not GlitchTip.
// Disable by default so GlitchTip works out of the box; opt in via env var.
const replayEnabled =
  process.env.NEXT_PUBLIC_SENTRY_REPLAY_ENABLED === "true";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  ...(replayEnabled && {
    replaysSessionSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    replaysOnErrorSampleRate: 1.0,
    integrations: [Sentry.replayIntegration()],
  }),
});
