# CHAOS-1560 — Web rate-limit fail-closed design

## Context read

- `src/lib/rate-limit.ts` currently uses Redis when `getRedis()` returns a client, otherwise falls back to per-process memory. Redis command errors also fall back to memory.
- `src/lib/redis.ts` lazily creates an `ioredis` singleton only when `REDIS_URL` is configured; creation failures return `null`, runtime connection errors are logged by the client.
- `src/app/api/feedback/route.ts` is the only current caller of `isRateLimited(key)`. It must keep its existing graceful behavior.
- `src/proxy.ts` treats `/api/v1/auth/*` as public and rewrites other `/api/*` traffic to the ops API, adding bearer/org headers for authenticated users.
- `src/lib/auth.ts` calls backend auth endpoints directly for credentials/social login and maps backend `429` to Auth.js credential errors.
- Ops `rate_limit.py` now fails closed for unsafe production config: non-dev requires `REDIS_URL`, ignores forwarded IPs unless proxy trust is configured, and exposes warnings for degraded local-only behavior.

## Runtime blocker check

Before implementation, verify `src/proxy.ts` can use the Redis-backed limiter:

- `src/proxy.ts` has no `export const runtime` declaration.
- `next.config.js` does not force Edge runtime; it uses standalone output and notes API proxying is handled by `proxy.ts` at runtime.
- `src/proxy.ts` already imports `auth` from `src/lib/auth.ts`; Auth.js/NextAuth v5 in this project strongly implies Node runtime compatibility.
- Confirm with `pnpm dev` and a request before writing runtime code. If proxy runs on Edge and cannot use `ioredis`, stop and ask the lead before implementation. Plan B is route-handler-level guards for pass-through API wrappers or an Upstash REST limiter, but neither should be chosen without lead approval.

## Proposed API: `isRateLimited(key, opts)`

Add an options object while preserving default behavior:

```ts
type RateLimitOptions = {
  failClosed?: boolean;
  windowMs?: number;
  maxRequests?: number;
  namespace?: string;
};

await isRateLimited(key, { failClosed: true, namespace: "auth" });
```

Implementation should expose metadata for `Retry-After`, e.g. `checkRateLimit(key, opts): Promise<{ limited: boolean; retryAfter: number }>` with `isRateLimited()` kept as the existing boolean-compatible wrapper.

Semantics:

- `failClosed` defaults to `false` for backward compatibility.
- `failClosed: false`: current behavior — use Redis when available; if Redis is missing or command execution fails, log and apply in-memory fallback.
- `failClosed: true`: Redis is required. If `REDIS_URL` is missing, the client cannot be created, or Redis commands fail, return limited instead of falling back to memory.
- Keep existing exports `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX_REQUESTS`; options can override values per route.
- Redis keys stay namespaced (`rate_limit:${namespace}:${key}` or existing-compatible `rate_limit:${key}` when no namespace is supplied) to avoid collisions.
- `429` responses include `Retry-After: <seconds>` and JSON body `{ detail: "Rate limit exceeded", retry_after: N }`. Redis computes this from key TTL; memory fallback computes it from `windowMs - (now - oldest_request)`.

## Proxy integration

Add a proxy-level guard before rewriting requests to the backend. This stops abuse before ops for high-risk public auth/admin endpoints.

Route table inside `src/proxy.ts`:

```ts
const ROUTE_LIMITS: Array<{ match: (m: string, p: string) => boolean; opts: RateLimitOptions }> = [
  { match: (m, p) => m === "POST" && p.startsWith("/api/v1/auth/login"),
    opts: { failClosed: true, namespace: "auth-login", windowMs: 15 * 60_000, maxRequests: 10 } },
  { match: (m, p) => m === "POST" && p.startsWith("/api/v1/auth/password-reset"),
    opts: { failClosed: true, namespace: "auth-pwreset", windowMs: 60 * 60_000, maxRequests: 3 } },
  { match: (m, p) => m === "POST" && p.startsWith("/api/v1/auth/register"),
    opts: { failClosed: true, namespace: "auth-register", windowMs: 60 * 60_000, maxRequests: 5 } },
  { match: (m, p) => ["POST", "PUT", "PATCH", "DELETE"].includes(m) && p.startsWith("/api/v1/auth/"),
    opts: { failClosed: true, namespace: "auth-other", windowMs: 15 * 60_000, maxRequests: 20 } },
  { match: (m, p) => m === "POST" && p.startsWith("/api/v1/admin/credentials/test-connection"),
    opts: { failClosed: true, namespace: "admin-cred-test", windowMs: 60 * 60_000, maxRequests: 10 } },
];
```

If no entry matches, do not rate-limit at the proxy; backend limits still apply.

Keying differs by auth posture:

- Unauthenticated paths (`/api/v1/auth/*`): key on IP — `proxy:${method}:${pathBucket}:ip:${clientIp}`.
- Authenticated paths (`/api/v1/admin/credentials/test-connection`): key on `session.user.id` when present, fallback to IP — `proxy:${method}:${pathBucket}:user:${session.user.id ?? `ip:${clientIp}`}`.

Behavior:

- Call the limiter with the matched route's `RateLimitOptions`.
- If limited, return `429` JSON (`{ detail: "Rate limit exceeded", retry_after: N }`) and `Retry-After: N` without rewriting.
- Ensure `/api/auth/*` NextAuth routes are not affected; only `/api/v1/...` backend routes are considered.

## `getClientIp()` helper

Expose a shared helper (for example `src/lib/client-ip.ts`) for proxy use. Do not rewrite the feedback route's existing fingerprint fallback in this PR; it can opt in later.

Design:

- Default: do **not** trust `x-forwarded-for`; use platform/native peer-ish headers only when safe, otherwise stable fallback.
- `getClientIp(request, { trustProxy })` gates forwarded headers:
  - `TRUST_PROXY=true` / `1`: allow `x-forwarded-for` first hop and `x-real-ip`.
  - unset/false: ignore spoofable forwarded headers.
- Return `unknown` only when no stable signal exists.
- Proxy auth limits should prefer IP and fall back to a stable anonymous fingerprint to avoid a single global `unknown` bucket.

This aligns with ops' `TRUSTED_PROXIES` fail-closed posture: forwarded headers are only honored when explicitly configured as trusted.

## Redis down behavior

| Scenario | `failClosed=false` | `failClosed=true` |
| --- | --- | --- |
| `REDIS_URL` unset | use memory fallback | treat as limited; log required Redis unavailable |
| Redis client creation fails | use memory fallback | treat as limited; log required Redis unavailable |
| Redis command throws/times out | use memory fallback | treat as limited; log required Redis unhealthy |
| Redis available and under limit | allow | allow |
| Redis available and over limit | block with `429` | block with `429` |

Feedback route remains `isRateLimited(rateLimitKey)` with no options, so it continues `failClosed=false`.

## Operator visibility

When `failClosed=true` blocks because Redis is required but unavailable/unhealthy:

- Emit a structured error log with safe fields only: include `namespace`, `failClosed: true`, and `reason` (`missing_redis_url`, `client_unavailable`, `redis_command_failed`). Hash/redact keys that may include IP/email.
- Add Sentry context/tags when Sentry is present, e.g. tag `rate_limit.redis_required_unhealthy=true`, `rate_limit.namespace=<namespace>`, and capture a message/exception. Do not include secrets, cookies, bearer tokens, or raw credential payloads.
- Avoid per-request log storms by deduplicating warnings per reason/namespace for a short interval or logging only on the fail-closed branch while keeping existing Redis client errors as-is.

## Test-mode bypass posture

- Proxy limiter bypass is allowed only when `DEV_HEALTH_TEST_MODE === "true"` and `NODE_ENV !== "production"`; this keeps Playwright e2e suites deterministic.
- Production never bypasses. Add a startup/module assertion: if `DEV_HEALTH_TEST_MODE === "true" && NODE_ENV === "production"`, throw immediately so leaked test-mode cannot disable production protection.
- The bypass is scoped to the new proxy limiter only; do not disable all rate limiting globally.

## Test plan

Unit tests:

- `isRateLimited()` default still falls back to memory when Redis is missing/throws.
- `isRateLimited(key, { failClosed: true })` returns limited when Redis is missing.
- `isRateLimited(key, { failClosed: true })` returns limited when Redis command throws.
- Redis success path enforces per-route `windowMs`/`maxRequests` and TTL setup.
- `getClientIp()` ignores spoofed `x-forwarded-for` when `TRUST_PROXY` is unset.
- `getClientIp()` honors first `x-forwarded-for` hop when `TRUST_PROXY=true`.

Proxy tests:

- Mutating `/api/v1/auth/login` calls fail-closed rate limiting and returns `429` when Redis is unavailable.
- Mutating `/api/v1/admin/credentials/test-connection` is protected.
- `/api/v1/auth/password-reset` has explicit coverage.
- Route limits use the per-route table rather than the shared 5/hour defaults.
- Auth routes key by IP; admin credential testing keys by `session.user.id` with IP fallback.
- `429` responses include both `Retry-After` and `{ detail, retry_after }`.
- Non-production `DEV_HEALTH_TEST_MODE=true` bypasses proxy limits; production plus test mode throws.
- Non-mutating `GET` requests are not blocked by this guard.
- `/api/auth/*` NextAuth routes are not affected.

Regression/backward-compat tests:

- Feedback route still calls the default `failClosed=false` path and is not hard-blocked when Redis is absent.
- Cookie/secret handling in `auth.ts` and `proxy.ts` remains unchanged; no auth headers or cookies are logged.

## Backward compatibility and non-goals

- Do not change feedback route semantics: it remains graceful and defaults to memory fallback.
- Do not disable rate limiting entirely in any environment.
- Do not weaken Auth.js cookie/secret handling or alter backend token forwarding.
- Do not trust spoofable proxy headers unless `TRUST_PROXY` explicitly opts in.
- Do not touch ops; the ops fix is already in place.
