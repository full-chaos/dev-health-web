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
 * ## Client IP trust model
 *
 * Rate-limit keys that incorporate a client IP MUST be derived via
 * `getClientIp()` from `@/lib/client-ip`, NOT by reading `x-forwarded-for`
 * directly. The helper enforces the following policy:
 *
 *   - `TRUST_PROXY=true`  → reads the leftmost `X-Forwarded-For` hop, then
 *     falls back to `X-Real-IP`. Use only when the app is deployed behind a
 *     known, trusted reverse proxy that strips/rewrites these headers.
 *   - `TRUST_PROXY=false` (default) → ignores `X-Forwarded-For` entirely to
 *     prevent IP spoofing. Falls back to platform-injected headers
 *     (`x-vercel-forwarded-for`, `cf-connecting-ip`) and then to an
 *     anonymous SHA-256 fingerprint of stable request headers.
 *
 * Never read `X-Forwarded-For` outside of `getClientIp()` in this module.
 *
 * Usage:
 *   import { isRateLimited, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS } from "@/lib/rate-limit";
 *   if (await isRateLimited(key)) { return 429; }
 */

import { createHash } from "node:crypto";

import * as Sentry from "@sentry/nextjs";

import { getServerEnv } from "@/lib/config";
import { logger } from "@/lib/logger";
import { getRedis } from "@/lib/redis";

/** Window length in milliseconds (1 hour). */
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

/** Maximum requests allowed per window. */
export const RATE_LIMIT_MAX_REQUESTS = 5;

// ---------------------------------------------------------------------------
// In-memory fallback (per-process, resets on restart)
// ---------------------------------------------------------------------------

export type RateLimitOptions = {
    failClosed?: boolean;
    windowMs?: number;
    maxRequests?: number;
    namespace?: string;
};

export type RateLimitResult = {
    limited: boolean;
    retryAfter: number;
};

const memoryStore = new Map<string, number[]>();

function windowMs(options: RateLimitOptions): number {
    return options.windowMs ?? RATE_LIMIT_WINDOW_MS;
}

function maxRequests(options: RateLimitOptions): number {
    return options.maxRequests ?? RATE_LIMIT_MAX_REQUESTS;
}

function retryAfterSeconds(ms: number): number {
    return Math.max(1, Math.ceil(ms / 1000));
}

function redisKeyFor(key: string, options: RateLimitOptions): string {
    return options.namespace ? `rate_limit:${options.namespace}:${key}` : `rate_limit:${key}`;
}

function safeKeyHash(key: string): string {
    return createHash("sha256").update(key).digest("hex");
}

const failClosedLogKeys = new Map<string, number>();
const FAIL_CLOSED_LOG_INTERVAL_MS = 60_000;

function reportRequiredRedisUnavailable(
    key: string,
    options: RateLimitOptions,
    reason: "missing_redis_url" | "client_unavailable" | "redis_command_failed",
    err?: unknown,
): void {
    const namespace = options.namespace ?? "default";
    const dedupeKey = `${namespace}:${reason}`;
    const now = Date.now();
    const lastLogged = failClosedLogKeys.get(dedupeKey) ?? 0;

    if (now - lastLogged >= FAIL_CLOSED_LOG_INTERVAL_MS) {
        failClosedLogKeys.set(dedupeKey, now);
        logger.error(
            { err, key_hash: safeKeyHash(key), namespace, failClosed: true, reason },
            "Redis rate-limit backend required but unavailable — failing closed",
        );
    }

    Sentry.withScope((scope) => {
        scope.setTag("rate_limit.redis_required_unhealthy", "true");
        scope.setTag("rate_limit.namespace", namespace);
        scope.setTag("rate_limit.reason", reason);
        scope.setContext("rate_limit", {
            failClosed: true,
            key_hash: safeKeyHash(key),
            namespace,
            reason,
        });
        if (err instanceof Error) {
            Sentry.captureException(err);
        } else {
            Sentry.captureMessage("Redis rate-limit backend required but unavailable");
        }
    });
}

function checkRateLimitedInMemory(key: string, options: RateLimitOptions): RateLimitResult {
    const now = Date.now();
    const limitWindowMs = windowMs(options);
    const limitMaxRequests = maxRequests(options);
    const requests = memoryStore.get(key) ?? [];
    const recent = requests.filter((ts) => now - ts < limitWindowMs);

    if (recent.length >= limitMaxRequests) {
        memoryStore.set(key, recent);
        const oldest = recent[0] ?? now;
        return { limited: true, retryAfter: retryAfterSeconds(limitWindowMs - (now - oldest)) };
    }

    recent.push(now);
    memoryStore.set(key, recent);
    return { limited: false, retryAfter: 0 };
}

// ---------------------------------------------------------------------------
// Redis backend (shared across instances)
// ---------------------------------------------------------------------------

async function checkRateLimitedRedis(
    key: string,
    options: RateLimitOptions,
): Promise<RateLimitResult> {
    const redis = getRedis();
    if (!redis) {
        if (options.failClosed) {
            const reason = getServerEnv().REDIS_URL ? "client_unavailable" : "missing_redis_url";
            reportRequiredRedisUnavailable(key, options, reason);
            return { limited: true, retryAfter: retryAfterSeconds(windowMs(options)) };
        }

        return checkRateLimitedInMemory(key, options);
    }

    const redisKey = redisKeyFor(key, options);
    const windowSeconds = retryAfterSeconds(windowMs(options));

    try {
        const count = await redis.incr(redisKey);

        // Set TTL on first request in the window
        if (count === 1) {
            await redis.expire(redisKey, windowSeconds);
        }

        if (count > maxRequests(options)) {
            const ttl = await redis.ttl(redisKey);
            return { limited: true, retryAfter: ttl > 0 ? ttl : windowSeconds };
        }

        return { limited: false, retryAfter: 0 };
    } catch (err) {
        if (options.failClosed) {
            reportRequiredRedisUnavailable(key, options, "redis_command_failed", err);
            return { limited: true, retryAfter: retryAfterSeconds(windowMs(options)) };
        }

        logger.warn({ err, key }, "Redis rate-limit check failed — falling back to in-memory");
        return checkRateLimitedInMemory(key, options);
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
export async function checkRateLimit(
    key: string,
    options: RateLimitOptions = {},
): Promise<RateLimitResult> {
    return checkRateLimitedRedis(key, options);
}

export async function isRateLimited(key: string, options: RateLimitOptions = {}): Promise<boolean> {
    return (await checkRateLimit(key, options)).limited;
}

/**
 * Reset the in-memory store (for testing only).
 * @internal
 */
export function _resetMemoryStore(): void {
    memoryStore.clear();
}
