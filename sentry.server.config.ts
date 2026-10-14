import * as Sentry from "@sentry/nextjs";
import { publicEnv } from "@/lib/config";
import { attachBeforeSend } from "@/lib/sentry/scrubber";

Sentry.init(
    attachBeforeSend({
        dsn: publicEnv.NEXT_PUBLIC_SENTRY_DSN,
        environment: process.env.NODE_ENV,
        integrations: [Sentry.httpIntegration({ maxRequestBodySize: "none" })],
        tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    }),
);
