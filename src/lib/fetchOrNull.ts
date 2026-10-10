/**
 * Graceful data-fetch helper for server components.
 *
 * Awaits a promise and returns its value on success, or `null` on failure.
 * A step that does not settle at the read deadline (+5 s) fails too. Failures are logged at warn level (not silently swallowed) so they appear
 * in structured logs and Sentry breadcrumbs.
 *
 * Replaces the widespread `.catch(() => null)` pattern in page components.
 *
 * Usage:
 *   const data = await fetchOrNull(getHomeData(filters), "home-data");
 */
import { logger } from "@/lib/logger";
import { withDeadline } from "@/lib/serverDeadline";

export async function fetchOrNull<T>(promise: Promise<T>, label: string): Promise<T | null> {
    try {
        // OUTER deadline (CHAOS-9114): the step is bounded whatever it waits on, and the line
        // names it by `label`. A deadline is a failure like any other: null.
        return await withDeadline(promise, { kind: "read", op: `step ${label}` });
    } catch (err: unknown) {
        logger.warn({ err, label }, `fetchOrNull: ${label} failed, returning null`);
        return null;
    }
}
