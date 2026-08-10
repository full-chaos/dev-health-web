/**
 * Rate limiter backed by Redis. No fallback: Redis or nothing.
 *
 * Fixed-window counter, incremented and expired atomically in one Lua call
 * (see `INCR_AND_EXPIRE_LUA`).
 *
 * ## Why there is no in-memory fallback (CHAOS-3589)
 *
 * There used to be one, and this module claimed it mirrored "the graceful
 * fallback pattern from dev-health-ops". It did not. Ops selects its backend
 * once at import and `verify_rate_limit_config()` refuses to boot in
 * non-development environments without `REDIS_URL`, because "in-memory
 * rate-limit storage (memory://) is per-process and ineffective across multiple
 * replicas". slowapi's own `in_memory_fallback` is left switched off there.
 *
 * The per-process store was worse than ineffective. Under N replicas it enforced
 * N x maxRequests while reporting success, it reset on every deploy, and it was
 * the sole home of two real defects: it keyed without the namespace, so routes
 * sharing a client IP shared a counter AND a short-window caller could truncate
 * and persist a long-window caller's history — clearing a limit that had already
 * been reached. Both vanish with the store.
 *
 * `verifyRateLimitConfig()` now enforces the ops rule at startup, from
 * `instrumentation.ts`. At runtime an unreachable Redis follows the caller's
 * `failClosed` flag: auth routes (every limited route in `src/proxy.ts`) return
 * 429; the rest are allowed through, and every such decision is logged and sent
 * to Sentry rather than hidden behind a store that looked like it was working.
 *
 * ## Client IP trust model
 *
 * Rate-limit keys that incorporate a client IP MUST be derived via
 * `getClientIp()` from `@/lib/client-ip`, NOT by reading `x-forwarded-for`
 * directly. The helper enforces the following policy:
 *
 *   - `TRUST_PROXY=true`  -> reads the leftmost `X-Forwarded-For` hop, then
 *     falls back to `X-Real-IP`. Use only when the app is deployed behind a
 *     known, trusted reverse proxy that strips/rewrites these headers.
 *   - `TRUST_PROXY=false` (default) -> ignores `X-Forwarded-For` entirely to
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
import * as Sentry from "@sentry/nextjs";

import { getServerEnv } from "@/lib/config";
import { logger } from "@/lib/logger";
import { getRedis } from "@/lib/redis";

/** Window length in milliseconds (1 hour). */
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

/** Maximum requests allowed per window. */
export const RATE_LIMIT_MAX_REQUESTS = 5;

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
 * `node:crypto` is unavailable in the Edge runtime (`src/proxy.ts` and this
 * module's edge-instrumentation import both run there), so this uses the Web
 * Crypto API instead — supported by both Node.js and Edge.
 */
async function safeKeyHash(key: string): Promise<string> {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
}

const failClosedLogKeys = new Map<string, number>();
const FAIL_CLOSED_LOG_INTERVAL_MS = 60_000;

async function reportRedisUnavailable(
    key: string,
    options: RateLimitOptions,
    reason: "missing_redis_url" | "client_unavailable" | "redis_command_failed",
    err?: unknown,
): Promise<void> {
    const failClosed = options.failClosed === true;
    const namespace = options.namespace ?? "default";
    const dedupeKey = `${namespace}:${reason}`;
    const now = Date.now();
    const lastLogged = failClosedLogKeys.get(dedupeKey) ?? 0;
    const keyHash = await safeKeyHash(key);

    if (now - lastLogged >= FAIL_CLOSED_LOG_INTERVAL_MS) {
        failClosedLogKeys.set(dedupeKey, now);
        logger.error(
            { err, key_hash: keyHash, namespace, failClosed, reason },
            failClosed
                ? "Redis rate-limit backend unavailable — failing closed"
                : "Redis rate-limit backend unavailable — request NOT rate limited",
        );
    }

    Sentry.withScope((scope) => {
        scope.setTag("rate_limit.redis_required_unhealthy", "true");
        scope.setTag("rate_limit.namespace", namespace);
        scope.setTag("rate_limit.reason", reason);
        scope.setContext("rate_limit", {
            failClosed,
            key_hash: keyHash,
            namespace,
            reason,
        });
        if (err instanceof Error) {
            Sentry.captureException(err);
        } else {
            Sentry.captureMessage("Redis rate-limit backend unavailable");
        }
    });
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

/**
 * The one place that decides what an unreachable Redis means.
 *
 * There is no second backend to consult, so the caller's `failClosed` flag is
 * the whole policy: set, the request is refused; unset, it is allowed. Either
 * way it is reported — an unenforced limit must never be silent.
 */
async function onRedisUnavailable(
    key: string,
    options: RateLimitOptions,
    reason: "missing_redis_url" | "client_unavailable" | "redis_command_failed",
    err?: unknown,
): Promise<RateLimitResult> {
    await reportRedisUnavailable(key, options, reason, err);

    return options.failClosed
        ? { limited: true, retryAfter: retryAfterSeconds(windowMs(options)) }
        : { limited: false, retryAfter: 0 };
}

async function checkRateLimitedRedis(
    key: string,
    options: RateLimitOptions,
): Promise<RateLimitResult> {
    const redis = getRedis();
    if (!redis) {
        const reason = getServerEnv().REDIS_URL ? "client_unavailable" : "missing_redis_url";
        return await onRedisUnavailable(key, options, reason);
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
        return await onRedisUnavailable(key, options, "redis_command_failed", err);
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
 * Fail the boot when the only supported backend is not configured.
 *
 * Mirrors `verify_rate_limit_config()` in dev-health-ops. A limiter with no
 * shared store does not under-enforce loudly, it under-enforces silently, so
 * this must stop the deploy rather than surface per-request. Called from
 * `instrumentation.ts`, Next.js's once-per-boot server hook.
 *
 * Development and test are exempt, matching ops's `_is_dev_or_test()`.
 */
export function verifyRateLimitConfig(): void {
    const env = getServerEnv();
    if (env.NODE_ENV !== "production") return;

    if (!env.REDIS_URL) {
        throw new Error(
            "REDIS_URL must be set in production. Rate limiting has no in-memory " +
                "fallback: a per-process store is ineffective across replicas and " +
                "would under-enforce every limit silently (CHAOS-3589).",
        );
    }
}
