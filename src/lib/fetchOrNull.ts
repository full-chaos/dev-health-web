/**
 * Graceful data-fetch helper for server components.
 *
 * Awaits a promise and returns its value on success, or `null` on failure.
 * Failures are logged at warn level (not silently swallowed) so they appear
 * in structured logs and Sentry breadcrumbs.
 *
 * Replaces the widespread `.catch(() => null)` pattern in page components.
 *
 * Usage:
 *   const data = await fetchOrNull(getHomeData(filters), "home-data");
 */
import { logger } from "@/lib/logger";

export async function fetchOrNull<T>(promise: Promise<T>, label: string): Promise<T | null> {
    try {
        return await promise;
    } catch (err: unknown) {
        logger.warn({ err, label }, `fetchOrNull: ${label} failed, returning null`);
        return null;
    }
}
