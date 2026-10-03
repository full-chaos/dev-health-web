# Security Headers

**Source of Truth:** [`next.config.js`](../next.config.js) · [`src/proxy.ts`](../src/proxy.ts)

## Overview

Security headers are applied at two layers:

1. **`next.config.js` static headers** — applied by Next.js to every response via the `headers()` config. These are the fallback/static-export path.
2. **`src/proxy.ts` middleware CSP** — the middleware generates a per-request nonce and injects a stricter `Content-Security-Policy` for all server-rendered routes, overriding the static-export CSP.

## Headers set in `next.config.js` (all routes, `/(.*)`)

([`next.config.js:42–70`](../next.config.js#L42))

| Header                      | Value                                          |
| --------------------------- | ---------------------------------------------- |
| `X-Content-Type-Options`    | `nosniff`                                      |
| `X-Frame-Options`           | `DENY`                                         |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`              |
| `Permissions-Policy`        | `camera=(), microphone=(), geolocation=()`     |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `Content-Security-Policy`   | See below                                      |

### Static-export / CDN fallback CSP

```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self' data:;
connect-src 'self' https://*.vercel.app https://*.sentry.io https://bugs.fullchaos.dev;
frame-ancestors 'none';
```

`unsafe-inline` in `script-src` is intentional here — it covers only the static export path where middleware does not run and no nonce is available. ([`next.config.js:59–65`](../next.config.js#L59))

## Middleware nonce-based CSP (server-rendered routes)

For all server-rendered responses, `src/proxy.ts` generates a cryptographically random 16-byte base64url nonce per request and builds a stricter CSP that removes `unsafe-inline` from `script-src`. ([`proxy.ts:141–194`](../src/proxy.ts#L141))

```
default-src 'self';
script-src 'self' 'nonce-<random>';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self' data:;
connect-src 'self' https://*.vercel.app https://*.sentry.io https://bugs.fullchaos.dev http://localhost:8800;
frame-ancestors 'none';
```

`unsafe-eval` is excluded in production — the Next.js App Router does not require it there. `allowsScriptEval()` in `src/proxy.ts` ([`proxy.ts:154–174`](../src/proxy.ts#L154)) is an allow-list; every case it does not name gets no eval, so an unset `NODE_ENV`, `production` and any other value fail closed:

- `NODE_ENV=development`, the development server: React's development build calls `eval()` to rebuild server call stacks, and with Next.js 16.3 it does so on every page, so a development page without `unsafe-eval` reports one blocked eval per server stack frame;
- `NODE_ENV=test` together with browser test mode (`DEV_HEALTH_TEST_MODE=true`): the e2e suites start `next dev` with `NODE_ENV=test` (`ci/run_tests.sh`), which also serves React's development build.

`src/lib/__tests__/proxy-csp.test.ts` pins each clause and the cases that must stay closed.

The nonce is injected on every response path in the middleware: redirects, rate-limit 429s, auth redirects, and proxied responses. ([`proxy.ts:278–403`](../src/proxy.ts#L278))

## Environment differences

| Context                            | CSP source                | `unsafe-inline` in script-src                      |
| ---------------------------------- | ------------------------- | -------------------------------------------------- |
| Static export (`DEMO_EXPORT=true`) | `next.config.js`          | Yes (no middleware)                                |
| Server-rendered (normal)           | `src/proxy.ts` middleware | No (nonce used instead)                            |
| Local dev (`localhost:8800`)       | `src/proxy.ts` middleware | No; `connect-src` includes `http://localhost:8800` |

`unsafe-eval` in `script-src`: the development server, and the test runner with browser test mode; never in production, never for another `NODE_ENV` value, never in the static export.

## Updating headers safely

- **Static headers** (`X-Frame-Options`, `HSTS`, etc.): edit the `headers()` array in [`next.config.js`](../next.config.js#L42). Changes take effect on next build.
- **CSP for server-rendered routes**: edit `buildCspHeader()` in [`src/proxy.ts`](../src/proxy.ts#L184). The nonce is generated per-request; only the directives need updating.
- **CSP for static export**: edit the `value` string in [`next.config.js:64–65`](../next.config.js#L64). Keep it in sync with `buildCspHeader()` where possible.
- Do not add `unsafe-eval` to the production policy — it is intentionally absent there. The development-only exception lives in `allowsScriptEval()`, an allow-list; do not widen it.
- Do not remove `frame-ancestors 'none'` — it is the clickjacking defence.
