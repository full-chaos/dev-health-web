"use client";

/**
 * Route-level error boundary for the root segment.
 *
 * Catches errors from layouts and pages rendered inside the root layout.
 * Reports to Sentry and provides a retry button to attempt recovery.
 */
import { useEffect } from "react";
import { logger } from "@/lib/logger";
import { trackTelemetryEvent } from "@/lib/telemetry";
import { routePatternForPathname } from "@/lib/telemetry/routePatterns";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RouteError({ error, reset }: ErrorProps) {
  useEffect(() => {
    logger.error({ err: error, digest: error.digest }, "Unhandled route error");
    trackTelemetryEvent("client_error", {
      boundary: "route",
      digest: error.digest ?? null,
      errorClass: error.name || "Error",
      routePattern: typeof window === "undefined" ? null : routePatternForPathname(window.location.pathname),
    });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="max-w-md px-6 text-center">
        <p className="text-xs uppercase tracking-[0.15em] text-(--ink-muted) mb-3">Error</p>
        <h1 className="font-(--font-display) text-3xl mb-4">Something went wrong</h1>
        <p className="text-sm text-(--ink-muted) leading-relaxed mb-8">
          An unexpected error occurred while rendering this page.
          {error.digest && (
            <span className="block mt-2 font-mono text-xs text-(--ink-subtle)">
              Error ID: {error.digest}
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={reset}
          className="rounded-full border border-(--card-stroke) px-6 py-2.5 text-xs uppercase tracking-[0.2em] hover:border-(--accent) transition"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
