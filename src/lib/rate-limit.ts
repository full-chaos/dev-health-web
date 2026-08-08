/**
 * Rate limiter with Redis backend and in-memory fallback.
 *
 * Redis strategy: fixed-window counter, incremented and expired atomically in
 * one Lua call (see `INCR_AND_EXPIRE_LUA`).
 * In-memory strategy: sliding-window timestamp array (matches the original
 * feedback route implementation), bounded by `MEMORY_STORE_MAX_KEYS`.
 *
 * ## This is NOT the ops fallback pattern
 *
 * This module used to claim it mirrored "the graceful-fallback pattern from
 * dev-health-ops (`api/middleware/rate_limit.py` — Redis when available, memory
 * when not)". That was wrong in the direction that matters: ops selects its
 * backend once at import, and `verify_rate_limit_config()` REFUSES TO BOOT in
 * non-development environments without `REDIS_URL`, because "in-memory
 * rate-limit storage (memory://) is per-process and ineffective across multiple
 * replicas". slowapi's own `in_memory_fallback` is left switched off there.
 *
 * The silent degrade to a per-process store is therefore this module's own
 * design choice, not an inherited one, and it carries that known weakness: with
 * N replicas the effective limit is N x maxRequests, and it resets on deploy.
 * Callers that must not degrade pass `failClosed: true` — every auth route in
 * `src/proxy.ts` does. Whether the remaining callers should keep the fallback at
 * all is an open question (CHAOS-3589 follow-up).
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

/**
 * Requests still inside this key's window, plus the point after which the whole
 * entry is garbage.
 *
 * `expiresAt` is what lets the store be swept without knowing which caller's
 * window applies — it plays the role Redis's TTL plays on the other backend.
 */
type MemoryEntry = { hits: number[]; expiresAt: number };

const memoryStore = new Map<string, MemoryEntry>();

/**
 * Hard ceiling on tracked keys. The store is keyed by client IP or anonymous
 * fingerprint, so without a bound a long-lived server retains one entry per
 * unique caller for the life of the process (CHAOS-3589).
 */
const MEMORY_STORE_MAX_KEYS = 10_000;

/**
 * How far a cap-triggered sweep evicts past the ceiling. Without this headroom
 * every single request past the cap would re-trigger a full sweep.
 */
const MEMORY_STORE_LOW_WATER_KEYS = 9_000;

/** Sweeping is amortised — walking the map on every request would be O(n) per call. */
const MEMORY_SWEEP_INTERVAL_MS = 60_000;

let nextMemorySweepAt = 0;

function windowMs(options: RateLimitOptions): number {
    return options.windowMs ?? RATE_LIMIT_WINDOW_MS;
}

function maxRequests(options: RateLimitOptions): number {
    return options.maxRequests ?? RATE_LIMIT_MAX_REQUESTS;
}

function retryAfterSeconds(ms: number): number {
    return Math.max(1, Math.ceil(ms / 1000));
}

/**
 * The identity a limit is counted against. BOTH backends must use this.
 *
 * Namespacing only the Redis key — as this module did until CHAOS-3589 — makes
 * the in-memory fallback merge every namespace that shares a raw key, and
 * `/api/acr/device` and `/api/feedback` both pass a bare client IP. The merge is
 * not merely stricter: the memory path rewrites the bucket using the *calling*
 * namespace's window, so a short-window caller truncates and persists a
 * long-window caller's history, clearing a limit that had already been reached.
 *
 * The upstream reference (`limits`, via slowapi) composes one key above the
 * storage layer and hands the identical string to both backends; a per-backend
 * divergence is structurally impossible there.
 */
function scopedKey(key: string, options: RateLimitOptions): string {
    return options.namespace ? `rate_limit:${options.namespace}:${key}` : `rate_limit:${key}`;
}

/**
 * Drop entries whose window has elapsed, then enforce the size ceiling by
 * evicting the entries closest to expiry.
 *
 * Eviction can only forget requests, never invent them, so a store under
 * pressure degrades toward "more permissive". That is bounded by
 * `MEMORY_STORE_MAX_KEYS` and only reachable while Redis is already down.
 */
function sweepMemoryStore(now: number): void {
    for (const [key, entry] of memoryStore) {
        if (entry.expiresAt <= now) memoryStore.delete(key);
    }

    if (memoryStore.size > MEMORY_STORE_MAX_KEYS) {
        const byExpiry = [...memoryStore.entries()].sort(
            ([, a], [, b]) => a.expiresAt - b.expiresAt,
        );
        const excess = memoryStore.size - MEMORY_STORE_LOW_WATER_KEYS;
        for (const [key] of byExpiry.slice(0, excess)) memoryStore.delete(key);
    }

    nextMemorySweepAt = now + MEMORY_SWEEP_INTERVAL_MS;
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

    if (now >= nextMemorySweepAt || memoryStore.size > MEMORY_STORE_MAX_KEYS) {
        sweepMemoryStore(now);
    }

    const storeKey = scopedKey(key, options);
    const hits = (memoryStore.get(storeKey)?.hits ?? []).filter((ts) => now - ts < limitWindowMs);
    // The entry is garbage once its newest hit has fallen out of the window.
    const expiresAt = now + limitWindowMs;

    if (hits.length >= limitMaxRequests) {
        memoryStore.set(storeKey, { hits, expiresAt });
        const oldest = hits[0] ?? now;
        return { limited: true, retryAfter: retryAfterSeconds(limitWindowMs - (now - oldest)) };
    }

    hits.push(now);
    memoryStore.set(storeKey, { hits, expiresAt });
    return { limited: false, retryAfter: 0 };
}

// ---------------------------------------------------------------------------
// Redis backend (shared across instances)
// ---------------------------------------------------------------------------

/**
 * Increment the window counter and make sure it carries a TTL, atomically.
 *
 * INCR followed by a separate EXPIRE is two round trips, and anything that stops
 * the second from landing — a connection blip, a failover, the process dying
 * mid-request — leaves a counter with no expiry. Nothing then clears it: the key
 * climbs past the limit and that caller is 429'd forever, reporting a plausible
 * `Retry-After` the whole time, until somebody deletes the key by hand
 * (CHAOS-3589). Redis runs a script to completion, so no such window exists
 * here. This mirrors `incr_expire.lua` in the `limits` package that the ops-side
 * limiter is built on.
 *
 * The `ttl < 0` arm additionally repairs keys a previous deploy already left
 * immortal: -1 is "no expiry", -2 is "gone", and either way the next hit
 * re-anchors the window instead of inheriting a stuck counter.
 */
const INCR_AND_EXPIRE_LUA = `
local current = redis.call("incr", KEYS[1])
if current == 1 or redis.call("ttl", KEYS[1]) < 0 then
    redis.call("expire", KEYS[1], ARGV[1])
end
return current
`;

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

    const redisKey = scopedKey(key, options);
    const windowSeconds = retryAfterSeconds(windowMs(options));

    try {
        const count = Number(await redis.eval(INCR_AND_EXPIRE_LUA, 1, redisKey, windowSeconds));

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
    nextMemorySweepAt = 0;
}

/**
 * Number of keys currently tracked by the in-memory fallback (for testing only).
 * Exposed so the size bound is assertable rather than assumed.
 * @internal
 */
export function _memoryStoreSize(): number {
    return memoryStore.size;
}
