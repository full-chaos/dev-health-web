/**
 * Rate limiter with Redis backend and in-memory fallback.
 *
 * Mirrors the graceful-fallback pattern from dev-health-ops
 * (`api/middleware/rate_limit.py` — Redis when available, memory when not).
 *
 * Redis strategy: fixed-window counter via INCR + EXPIRE.
 * In-memory strategy: sliding-window timestamp array (matches the original
 * feedback route implementation).
 *
 * Usage:
 *   import { isRateLimited, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS } from "@/lib/rate-limit";
 *   if (await isRateLimited(key)) { return 429; }
 */

import { logger } from "@/lib/logger";
import { getRedis } from "@/lib/redis";

/** Window length in milliseconds (1 hour). */
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

/** Maximum requests allowed per window. */
export const RATE_LIMIT_MAX_REQUESTS = 5;

// ---------------------------------------------------------------------------
// In-memory fallback (per-process, resets on restart)
// ---------------------------------------------------------------------------

const memoryStore = new Map<string, number[]>();

function isRateLimitedInMemory(key: string): boolean {
  const now = Date.now();
  const requests = memoryStore.get(key) ?? [];
  const recent = requests.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);

  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    memoryStore.set(key, recent);
    return true;
  }

  recent.push(now);
  memoryStore.set(key, recent);
  return false;
}

// ---------------------------------------------------------------------------
// Redis backend (shared across instances)
// ---------------------------------------------------------------------------

async function isRateLimitedRedis(key: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return isRateLimitedInMemory(key);

  const redisKey = `rate_limit:${key}`;
  const windowSeconds = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);

  try {
    const count = await redis.incr(redisKey);

    // Set TTL on first request in the window
    if (count === 1) {
      await redis.expire(redisKey, windowSeconds);
    }

    return count > RATE_LIMIT_MAX_REQUESTS;
  } catch (err) {
    logger.warn({ err, key }, "Redis rate-limit check failed — falling back to in-memory");
    return isRateLimitedInMemory(key);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether `key` has exceeded the rate limit.
 *
 * Uses Redis when available, falls back to an in-memory sliding window.
 * Always resolves (never rejects) — errors are logged and treated as "not limited"
 * via the in-memory fallback.
 */
export async function isRateLimited(key: string): Promise<boolean> {
  return isRateLimitedRedis(key);
}

/**
 * Reset the in-memory store (for testing only).
 * @internal
 */
export function _resetMemoryStore(): void {
  memoryStore.clear();
}
