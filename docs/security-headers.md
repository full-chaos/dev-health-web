# Security Headers

**Source of Truth:** [`next.config.js`](../next.config.js) · [`src/proxy.ts`](../src/proxy.ts)

## Overview

Security headers are applied at two layers:

1. **`next.config.js` static headers** — applied by Next.js to every response via the `headers()` config. These are the fallback/static-export path.
2. **`src/proxy.ts` middleware CSP** — the middleware generates a per-request nonce and injects a stricter `Content-Security-Policy` for all server-rendered routes, overriding the static-export CSP.

## Headers set in `next.config.js` (all routes, `/(.*)`)

([`next.config.js:24–50`](../next.config.js#L24))

| Header | Value |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `Content-Security-Policy` | See below |

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

`unsafe-inline` in `script-src` is intentional here — it covers only the static export path where middleware does not run and no nonce is available. ([`next.config.js:38–46`](../next.config.js#L38))

## Middleware nonce-based CSP (server-rendered routes)

For all server-rendered responses, `src/proxy.ts` generates a cryptographically random 16-byte base64url nonce per request and builds a stricter CSP that removes `unsafe-inline` from `script-src`. ([`proxy.ts:77–106`](../src/proxy.ts#L77))

```
default-src 'self';
script-src 'self' 'nonce-<random>';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self' data:;
connect-src 'self' https://*.vercel.app https://*.sentry.io https://bugs.fullchaos.dev http://localhost:8800;
frame-ancestors 'none';
```

`unsafe-eval` is intentionally excluded — Next.js 13+ App Router does not require it. ([`proxy.ts:92–94`](../src/proxy.ts#L92))

The nonce is injected on every response path in the middleware: redirects, rate-limit 429s, auth redirects, and proxied responses. ([`proxy.ts:177–260`](../src/proxy.ts#L177))

## Environment differences

| Context | CSP source | `unsafe-inline` in script-src |
|---|---|---|
| Static export (`DEMO_EXPORT=true`) | `next.config.js` | Yes (no middleware) |
| Server-rendered (normal) | `src/proxy.ts` middleware | No (nonce used instead) |
| Local dev (`localhost:8800`) | `src/proxy.ts` middleware | No; `connect-src` includes `http://localhost:8800` |

## Updating headers safely

- **Static headers** (`X-Frame-Options`, `HSTS`, etc.): edit the `headers()` array in [`next.config.js`](../next.config.js#L24). Changes take effect on next build.
- **CSP for server-rendered routes**: edit `buildCspHeader()` in [`src/proxy.ts`](../src/proxy.ts#L96). The nonce is generated per-request; only the directives need updating.
- **CSP for static export**: edit the `value` string in [`next.config.js:44–46`](../next.config.js#L44). Keep it in sync with `buildCspHeader()` where possible.
- Do not add `unsafe-eval` — it is intentionally absent.
- Do not remove `frame-ancestors 'none'` — it is the clickjacking defence.
