# Rate Limiting

**Source of Truth:** [`src/lib/rate-limit.ts`](../src/lib/rate-limit.ts) · [`src/proxy.ts`](../src/proxy.ts)

## Overview

Rate limiting uses a **Redis fixed-window** strategy when Redis is available, with an **in-memory sliding-window** fallback when it is not. This mirrors the graceful-fallback pattern from dev-health-ops (`api/middleware/rate_limit.py`).

## Defaults

| Constant                  | Value                   | Source                                             |
| ------------------------- | ----------------------- | -------------------------------------------------- |
| `RATE_LIMIT_WINDOW_MS`    | `3 600 000` ms (1 hour) | [`rate-limit.ts:25`](../src/lib/rate-limit.ts#L25) |
| `RATE_LIMIT_MAX_REQUESTS` | `5`                     | [`rate-limit.ts:28`](../src/lib/rate-limit.ts#L28) |

## Strategies

### Redis (primary) — fixed-window

Uses `INCR` + `EXPIRE` on a namespaced key (`rate_limit:<namespace>:<key>`). TTL is set on the first request in the window. On subsequent requests the remaining TTL is returned as `Retry-After`. ([`rate-limit.ts:130–168`](../src/lib/rate-limit.ts#L130))

### In-memory (fallback) — sliding-window

Stores a per-key timestamp array in a module-level `Map`. Timestamps older than `windowMs` are pruned on each check. **Per-process only** — resets on restart and is not shared across instances. ([`rate-limit.ts:108–124`](../src/lib/rate-limit.ts#L108))

## `RateLimitOptions`

```ts
type RateLimitOptions = {
  failClosed?: boolean; // default: false
  windowMs?: number; // default: RATE_LIMIT_WINDOW_MS (1h)
  maxRequests?: number; // default: RATE_LIMIT_MAX_REQUESTS (5)
  namespace?: string; // prefixes the Redis key
};
```

([`rate-limit.ts:34–39`](../src/lib/rate-limit.ts#L34))

## `failClosed` — when it is required

When `failClosed: true`, a missing or unreachable Redis backend causes the limiter to **return 429** instead of falling back to in-memory. This is mandatory for auth-adjacent routes where a per-process fallback would allow an attacker to bypass limits by hitting different pods.

Routes that set `failClosed: true` ([`proxy.ts:17–38`](../src/proxy.ts#L17)):

| Namespace         | Method + Path                                    | Window | Max |
| ----------------- | ------------------------------------------------ | ------ | --- |
| `auth-login`      | `POST /api/v1/auth/login`                        | 15 min | 10  |
| `auth-pwreset`    | `POST /api/v1/auth/password-reset`               | 60 min | 3   |
| `auth-register`   | `POST /api/v1/auth/register`                     | 60 min | 5   |
| `auth-other`      | `MUTATING /api/v1/auth/*`                        | 15 min | 20  |
| `admin-cred-test` | `POST /api/v1/admin/credentials/test-connection` | 60 min | 10  |

When Redis is unavailable and `failClosed` is set, the limiter:

1. Logs an error (deduplicated to once per 60 s per namespace+reason, [`rate-limit.ts:68–106`](../src/lib/rate-limit.ts#L68)).
2. Captures a Sentry exception/message.
3. Returns `{ limited: true, retryAfter: <windowSeconds> }`.

## Redis dependency

`getRedis()` is imported from `src/lib/redis.ts`. It returns `null` when `REDIS_URL` is not set or the client fails to initialise.

**Production requirement:** set `REDIS_URL` to a Redis-compatible endpoint (Valkey is supported). Without it, all `failClosed` routes will return 429 for every request.

## Public API

```ts
// Returns true if the key is over limit.
isRateLimited(key: string, options?: RateLimitOptions): Promise<boolean>

// Returns { limited, retryAfter } for finer-grained control.
checkRateLimit(key: string, options?: RateLimitOptions): Promise<RateLimitResult>
```

Both functions always resolve — they never reject. Redis errors are logged and handled via the fallback or `failClosed` path. ([`rate-limit.ts:181–193`](../src/lib/rate-limit.ts#L181))

## Test bypass

Rate limiting is skipped when `DEV_HEALTH_TEST_MODE=true` and `NODE_ENV !== "production"` ([`proxy.ts:117–119`](../src/proxy.ts#L117)). Never enable `DEV_HEALTH_TEST_MODE` in production — the app throws at startup if both flags are set ([`proxy.ts:11–13`](../src/proxy.ts#L11)).
