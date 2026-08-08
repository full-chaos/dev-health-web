import * as Sentry from "@sentry/nextjs";

import { verifyRateLimitConfig } from "@/lib/rate-limit";

export async function register() {
    if (process.env.NEXT_RUNTIME === "nodejs") {
        await import("./sentry.server.config");

        // Refuse to boot a production server that cannot rate limit. Deferred to
        // the nodejs runtime because it reads server-only env (CHAOS-3589).
        verifyRateLimitConfig();
    }

    if (process.env.NEXT_RUNTIME === "edge") {
        await import("./sentry.edge.config");
    }
}

// Capture errors from Server Components, middleware, and proxies
export const onRequestError = Sentry.captureRequestError;
