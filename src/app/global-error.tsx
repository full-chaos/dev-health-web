"use client";
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";

/**
 * Global error boundary — catches errors that bubble past all route-level
 * boundaries, including errors in the root layout itself.
 *
 * This replaces the entire <html>…</html> shell, so we must render our own.
 * Reports to Sentry when available.
 */
import { useEffect } from "react";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    // Capture error to Sentry and log to console as fallback
    Sentry.captureException(error);
    logger.error({ err: error }, "[GlobalError] Unhandled global error");
  }, [error]);

  return (
    <html lang="en" data-theme="dark" style={{ colorScheme: "dark" }}>
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0f",
          color: "#e2e8f0",
          fontFamily: "system-ui, sans-serif",
          margin: 0,
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: 480, textAlign: "center" }}>
          <p
            style={{
              fontSize: "0.7rem",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "#94a3b8",
              marginBottom: "0.75rem",
            }}
          >
            Unexpected error
          </p>
          <h1
            style={{
              fontSize: "1.75rem",
              fontWeight: 600,
              marginBottom: "1rem",
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              fontSize: "0.875rem",
              color: "#94a3b8",
              marginBottom: "2rem",
              lineHeight: 1.6,
            }}
          >
            An unexpected error occurred. If the problem persists, please contact{" "}
            <a href="mailto:support@fullchaos.studio" style={{ color: "#cbd5e1", textDecoration: "underline" }}>
              support@fullchaos.studio
            </a>
            .
            {error.digest && (
              <span
                style={{
                  display: "block",
                  marginTop: "0.5rem",
                  fontSize: "0.75rem",
                  fontFamily: "monospace",
                  color: "#64748b",
                }}
              >
                Error ID: {error.digest}
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "0.625rem 1.5rem",
              borderRadius: 9999,
              border: "1px solid #334155",
              background: "transparent",
              color: "#e2e8f0",
              fontSize: "0.75rem",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
