# Environment Variables

**Source of Truth:** [`src/lib/config.ts`](../src/lib/config.ts) · [`src/lib/runtimeConfig.ts`](../src/lib/runtimeConfig.ts)

All environment variables are validated with Zod at runtime. There are two surfaces:

- **`getServerEnv()`** — server-only vars. Throws if called from a client bundle. Parses fresh on every call (no caching). ([`config.ts:112`](../src/lib/config.ts#L112))
- **`publicEnv`** — client-safe `NEXT_PUBLIC_*` vars. Exposed as a Proxy that re-parses on every property read. ([`config.ts:48`](../src/lib/config.ts#L48))

All fields are `optional()` in the Zod schema — the app applies its own defaults and guards rather than hard-failing at startup.

---

## Server-only variables

([`config.ts:74–103`](../src/lib/config.ts#L74))

| Variable                | Type   | Default | Description                                                                                                                                                           |
| ----------------------- | ------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`              | string | —       | Node environment (`development`, `production`, `test`).                                                                                                               |
| `LOG_LEVEL`             | string | —       | Pino log level (`trace`, `debug`, `info`, `warn`, `error`).                                                                                                           |
| `LOG_FORMAT`            | string | —       | Log format (`json` or `pretty`).                                                                                                                                      |
| `BACKEND_URL`           | string | —       | Base URL of the dev-health-ops backend API (e.g. `http://localhost:8800`).                                                                                            |
| `BASE_PATH`             | string | —       | Next.js `basePath` for sub-path deployments. Also used as `assetPrefix` in static export mode.                                                                        |
| `AUTH_SECRET`           | string | —       | NextAuth v5 secret. Required in production; falls back to `NEXTAUTH_SECRET`, then a dev default.                                                                      |
| `NEXTAUTH_SECRET`       | string | —       | Legacy NextAuth secret alias. Superseded by `AUTH_SECRET`.                                                                                                            |
| `AUTH_URL`              | string | —       | Canonical public URL for Auth.js callbacks. Set this in Docker, reverse proxy, and production environments so provider `redirect_uri` values use the expected origin. |
| `NEXTAUTH_URL`          | string | —       | Legacy canonical URL alias for NextAuth callbacks. Prefer `AUTH_URL`.                                                                                                 |
| `AUTH_GITHUB_ID`        | string | —       | GitHub OAuth Client ID. Enables GitHub social login when set; may reuse the GitHub App Client ID from ops.                                                            |
| `AUTH_GITHUB_SECRET`    | string | —       | GitHub OAuth Client secret. Required when `AUTH_GITHUB_ID` is set; may reuse the GitHub App Client secret from ops.                                                   |
| `AUTH_GOOGLE_ID`        | string | —       | Google OAuth client ID. Enables Google social login when set.                                                                                                         |
| `AUTH_GOOGLE_SECRET`    | string | —       | Google OAuth client secret. Required when `AUTH_GOOGLE_ID` is set.                                                                                                    |
| `AUTH_GITLAB_ID`        | string | —       | GitLab OAuth client ID. Enables GitLab social login when set.                                                                                                         |
| `AUTH_GITLAB_SECRET`    | string | —       | GitLab OAuth client secret. Required when `AUTH_GITLAB_ID` is set.                                                                                                    |
| `LINEAR_API_KEY`        | string | —       | Linear API key for Linear integration features.                                                                                                                       |
| `LINEAR_TEAM_ID`        | string | —       | Linear team ID scoping Linear API calls.                                                                                                                              |
| `REDIS_URL`             | string | —       | Redis/Valkey connection URL. Required for distributed rate limiting (`failClosed` routes). Without it, rate limiting falls back to per-process in-memory.             |
| `TRUST_PROXY`           | string | —       | Set to `"true"` to trust `X-Forwarded-For` for client IP detection (needed behind a load balancer).                                                                   |
| `USE_GRAPHQL_ANALYTICS` | string | —       | Server-side override for GraphQL analytics. Defaults to `true` unless set to `"false"`.                                                                               |
| `DEV_HEALTH_TEST_MODE`  | string | —       | Enables test mode (bypasses rate limiting, uses sample data). **Must not be `"true"` in production.**                                                                 |
| `DEMO_EXPORT`           | string | —       | Set to `"true"` to build a static demo export. Changes Next.js output mode and page extensions.                                                                       |

---

## Client-side (`NEXT_PUBLIC_*`) variables

([`config.ts:22–31`](../src/lib/config.ts#L22))

| Variable                            | Type   | Default   | Description                                                             |
| ----------------------------------- | ------ | --------- | ----------------------------------------------------------------------- |
| `NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS` | string | `"true"`  | Enables GraphQL analytics on the client. Set to `"false"` to disable.   |
| `NEXT_PUBLIC_DOCS_URL`              | string | `"/docs"` | Base URL for documentation links.                                       |
| `NEXT_PUBLIC_DEV_HEALTH_TEST_MODE`  | string | —         | Client-side test mode flag. Mirrors `DEV_HEALTH_TEST_MODE`.             |
| `NEXT_PUBLIC_DEMO_MODE`             | string | —         | Enables demo mode UI behaviour.                                         |
| `NEXT_PUBLIC_BETA`                  | string | —         | Enables beta feature flags in the UI.                                   |
| `NEXT_PUBLIC_TELEMETRY_ENABLED`     | string | `"true"`  | Enables product telemetry. Set to `"false"` to disable globally.        |
| `NEXT_PUBLIC_RUM_ENDPOINT`          | string | —         | Real User Monitoring endpoint URL.                                      |
| `NEXT_PUBLIC_SENTRY_DSN`            | string | —         | Sentry DSN for client-side error reporting.                             |
| `NODE_ENV`                          | string | —         | Also available in the public schema for client-side environment checks. |

---

## Runtime config (`public/runtime-config.js`)

`NEXT_PUBLIC_*` variables are statically inlined by Next.js at build time. For deployments that need to inject values at container start (without rebuilding), the app supports a runtime override via `public/runtime-config.js`.

The file is served as a static asset and sets `window.__DEV_HEALTH_RUNTIME__`:

```js
window.__DEV_HEALTH_RUNTIME__ = {
    publicEnv: {
        NEXT_PUBLIC_SENTRY_DSN: "...",
        NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS: "true",
        // ...
    },
};
```

`src/lib/runtimeConfig.ts` reads from `window.__DEV_HEALTH_RUNTIME__.publicEnv` first, falling back to `process.env`. This means runtime-config values take precedence over build-time values for any `NEXT_PUBLIC_*` variable. ([`runtimeConfig.ts`](../src/lib/runtimeConfig.ts))

> **Do not commit `public/runtime-config.js`** — it is generated at container start and contains deployment-specific values. It is listed in `.gitignore`.

---

## Local Storage Keys

The application uses the following local storage keys for client-side preferences and state:

| Key                                   | Type    | Description                                      |
| ------------------------------------- | ------- | ------------------------------------------------ |
| `devhealth-product-telemetry-opt-out` | boolean | Set to `"true"` to opt out of product telemetry. |
