/**
 * Custom urql exchanges for dev-health-web.
 *
 * errorExchange   — captures GraphQL errors to Sentry and logs them.
 * timingExchange  — records per-operation wall-clock time to Sentry measurements.
 */

import { mapExchange, type Operation, type OperationResult } from "@urql/core";
import { logger } from "@/lib/logger";

/**
 * Build a human-readable label for an operation.
 */
function operationLabel(operation: Operation): string {
  const name =
    (operation.query as unknown as { definitions?: Array<{ name?: { value?: string } }> })
      .definitions?.[0]?.name?.value ?? "anonymous";
  return `${operation.kind}:${name}`;
}

/**
 * errorExchange — reports GraphQL errors to Sentry and structured log.
 *
 * Captures:
 * - Network errors (fetch failures, non-200 responses)
 * - GraphQL protocol errors in the `errors` array
 */
export const errorExchange = mapExchange({
  onError(error: OperationResult["error"], operation: Operation) {
    if (!error) return;

    const label = operationLabel(operation);

    if (error.networkError) {
      logger.error(
        { err: error.networkError, operation: label },
        "urql: network error"
      );
      try {
        const Sentry = require("@sentry/nextjs");
        Sentry.captureException(error.networkError, {
          tags: { "urql.operation": label },
        });
      } catch {
        // Sentry not available.
      }
    }

    if (error.graphQLErrors?.length) {
      logger.warn(
        { graphQLErrors: error.graphQLErrors, operation: label },
        "urql: GraphQL errors"
      );
      // Only report to Sentry for server-side or unexpected GraphQL errors.
      const criticalErrors = error.graphQLErrors.filter(
        (e) =>
          !(e.extensions?.code === "UNAUTHENTICATED" ||
            e.extensions?.code === "FORBIDDEN")
      );
      if (criticalErrors.length) {
        try {
          const Sentry = require("@sentry/nextjs");
          Sentry.captureException(new Error(`GraphQL: ${criticalErrors.map((e) => e.message).join("; ")}`), {
            tags: { "urql.operation": label },
            extra: { graphQLErrors: criticalErrors },
          });
        } catch {
          // Sentry not available.
        }
      }
    }
  },
});

/**
 * timingExchange — records per-operation wall-clock time.
 *
 * Uses performance.now() to measure request round-trips and emits
 * Sentry measurements for slow operations (> 2 s).
 */

const SLOW_THRESHOLD_MS = 2000;

// Store start times keyed by operation key.
const startTimes = new Map<number, number>();

export const timingExchange = mapExchange({
  onOperation(operation: Operation) {
    startTimes.set(operation.key, performance.now());
    return operation;
  },
  onResult(result: OperationResult) {
    const start = startTimes.get(result.operation.key);
    if (start === undefined) return result;

    startTimes.delete(result.operation.key);
    const durationMs = performance.now() - start;
    const label = operationLabel(result.operation);

    if (durationMs > SLOW_THRESHOLD_MS) {
      logger.warn(
        { operation: label, durationMs: Math.round(durationMs) },
        "urql: slow GraphQL operation"
      );
      try {
        const Sentry = require("@sentry/nextjs");
        Sentry.captureEvent({
          type: "transaction",
          transaction: `graphql.${label}`,
          measurements: {
            graphql_duration: { value: durationMs, unit: "millisecond" },
          },
          tags: { "urql.operation": label, "urql.slow": "true" },
        });
      } catch {
        // Sentry not available.
      }
    } else {
      logger.debug(
        { operation: label, durationMs: Math.round(durationMs) },
        "urql: operation timing"
      );
    }

    return result;
  },
});
