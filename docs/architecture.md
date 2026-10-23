# Architecture Overview: dev-health-web

## Overview

- **Framework**: Next.js 16.3.6 (React Server Components)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **UI**: Custom components (no shadcn/radix)

## Route Groups

- **`(app)`**: Main authenticated shell.
    - **Layout**: `src/app/(app)/layout.tsx`. Wraps in `SessionProvider` + `GraphQLProvider`. Calls `requireSession()`.
    - **`org/admin/`**: Sub-group in the shared app shell. Uses `requireRole(["admin", "owner"])`; each page's `AdminHeader` brings the tab row of its Admin destination (`AdminTabs`: Organization or Connections, from `lib/navigation/tabs.ts`).
    - **`superadmin/`**: Sub-group in the shared app shell. Uses `requireSuperuser()`; its pages are the Admin destinations Platform and Platform billing (listed only for platform admins), each page header with its tab row.
    - **Dashboard**: `(app)/dashboard/page.tsx`.
- **`(auth)`**: Public auth flows (signin, onboard, error).
    - **Layout**: `src/app/(auth)/layout.tsx`. Includes `Toaster`.
- **`(marketing)`**: Public marketing landing.
    - **Layout**: `src/app/(marketing)/layout.tsx`. No auth required.
- **Root Layout**: `src/app/layout.tsx`. Sets fonts, theme script (prevents FOUC), includes `runtime-config.js`.

## Server-only code and the client bundle

Code that holds secrets or server logic must not reach a browser file.

- **`import "server-only"`**: the build refuses a client import of a marked module (`src/lib/auth.ts`, `serverEnv.server.ts`, `serverSession.server.ts`, `graphql/server.ts` and the ACR modules).
- **Conditional imports**: `#server-env` and `#server-session` (the `imports` field of `package.json`) resolve to the full reader in a server graph. Every other graph, the browser bundle and the server render of a client component, gets a reader with the few values it needs. Reading any other server variable there fails with a clear error.
- **`pnpm check:client-bundle`**: after `pnpm build`, scans every file in `.next/static` for the text of the registered server-only modules, for the names and values of server environment variables, and for the pattern rules K1-K5 (private key text, refresh and token-exchange endpoints, the session cookie name, JWT-shaped text, signing code). The prerendered `.html`, `.rsc` and `.body` files in `.next/server` are also scanned for the value rules (K1, K4) and secret values. There is no allowlist: a false positive is fixed by a narrower rule and a benign sample that must not match. It fails when it cannot measure. `ci/run_tests.sh` runs it as `pnpm check:client-bundle --require-secrets`. A new server-only module with `import "server-only"` is added to `SERVER_ONLY_MODULES` in `scripts/check-client-bundle.mjs`.
- **Server action modules**: put new helpers below the existing actions of a `"use server"` file; the auth-profile gate anchors each action to its line.

## Request Proxy

- **Middleware**: `src/proxy.ts` (Next.js 16 proxy, NOT `middleware.ts`).
- **Functionality**:
    - Auth redirects.
    - Rewrites `/api/` and `/graphql` to backend with `Authorization` bearer token.
    - `PUBLIC_PATHS` list defines unauthenticated routes.

## Data Fetching

- **REST**:
    - `src/lib/apiClient.ts`: Fetch wrapper with auto auth header (server-side).
    - `src/lib/api.ts`: Domain functions.
- **GraphQL (urql)**:
    - Provider: `src/lib/graphql/provider.tsx`.
    - Client: `src/lib/graphql/urqlClient.ts`.
    - Fallbacks: Feature-flagged GraphQL fallbacks in `api.ts`.
- **Server Components**: Direct `await` fetch.

Auth.js browser session reads and updates share a queue within each tab. The pinned
patch in `patches/next-auth@5.0.0-beta.32.patch` waits for each response body before
dispatching the next session request. This prevents an older session read from
overwriting the workspace cookie set during onboarding. Failed requests release
the queue. Other endpoints and server requests remain concurrent; the queue does
not coordinate separate tabs. The patch addresses the same request-ordering race
described in [Auth.js issue #8897](https://github.com/nextauthjs/next-auth/issues/8897).
The regression test imports the installed dependency, so removing the patch fails
the request-ordering checks.

## Navigation

- **Shared app shell**: `src/components/shell/AppShell.tsx`. Sidebar (`ShellSidebar`), top bar with the location trail, and the one `<main>`; the route registry `shellRoutes.ts` selects the routes it renders. The area tree is `src/lib/navigation/areas.ts`.
- **Scope bar**: `src/components/shell/ScopeBar.tsx`. Organization, team, repository and window, with the page filters in a drawer.
- **Admin navigation**: the shell sidebar's Admin area (Organization, Connections, Data Confidence, Settings; plus Platform and Platform billing for platform admins) and the tab rows of `AdminTabs`.

## Route Map

### `(app)` — Authenticated Routes

All routes below require an active session. The `(app)` layout wraps them in `SessionProvider` + `GraphQLProvider`.

#### Areas and destinations

The sidebar shows eight areas. The active area expands to its destinations. The tree is `src/lib/navigation/areas.ts`.

| Area     | Route                       | Destination                                                                        |
| :------- | :-------------------------- | :--------------------------------------------------------------------------------- |
| Home     | `/dashboard`                | Summary metrics, deltas and sparklines. The route name did not change.             |
| Diagnose | `/diagnose`                 | Area overview                                                                      |
|          | `/metrics?tab=flow`         | Flow (the metrics explorer; `/team-flow` redirects here)                           |
|          | `/investment`               | Investment: Overview, Allocation, Evidence and Confidence tabs                     |
|          | `/landscape`                | Landscape (`/explore/landscape` redirects here)                                    |
|          | `/diagnose/work-graph`      | Work Graph: Overview, Dependencies, Inflow-Outflow, Review Network, Artifacts      |
|          | `/complexity`               | Complexity                                                                         |
|          | `/cognitive-load`           | Cognitive Load                                                                     |
|          | `/bottleneck`               | Bottlenecks                                                                        |
| Plan     | `/plan`                     | Area overview (`/plan/delivery-forecast` redirects here)                           |
|          | `/plan/capacity`            | Completion Forecast (`/capacity` and `/capacity-planning` redirect here)           |
|          | `/plan/backlog-risk`        | Backlog Risk                                                                       |
| Improve  | `/improve`                  | Area overview                                                                      |
|          | `/opportunities`            | Opportunities                                                                      |
|          | `/improve/experiments`      | Experiments                                                                        |
|          | `/improve/automations`      | Automations                                                                        |
| Govern   | `/govern`                   | Area overview                                                                      |
|          | `/testops`                  | TestOps (also `/testops/coverage`, `/testops/pipelines`, `/testops/tests`)         |
|          | `/quality`                  | Quality                                                                            |
|          | `/testops/risk`             | Delivery Risk                                                                      |
|          | `/incident-correlation`     | Incident Correlation                                                               |
|          | `/security`                 | Security (`/security/repos/[repoId]` is the repository detail)                     |
|          | `/feature-flags`            | Feature Flags                                                                      |
|          | `/risk/compounding`         | Compounding Risk                                                                   |
| AI       | `/ai`                       | Area overview                                                                      |
|          | `/ai/impact`                | Impact                                                                             |
|          | `/ai/review-load`           | Review Load                                                                        |
|          | `/ai/risk`                  | Governance Risk                                                                    |
|          | `/ai/automations`           | Automations                                                                        |
| Reports  | `/reports`                  | Report Center (`/reports/new` and `/reports/[id]` are the create and detail pages) |
| Admin    | `/org/admin`                | Organization                                                                       |
|          | `/org/admin/sync`           | Connections                                                                        |
|          | `/data-health`              | Data Confidence                                                                    |
|          | `/settings`                 | Settings                                                                           |
|          | `/superadmin`               | Platform (platform admins only)                                                    |
|          | `/superadmin/billing/plans` | Platform billing (platform admins only)                                            |

Other authenticated routes that are not sidebar destinations: `/explore` (metric evidence page; `?metric=` selects the metric), `/operating-review`, `/demo`, `/agent-context/context-packet`, and the `/data-health/*` sub-pages. `/work` is a legacy route: it redirects to the matching destination with a `?tab=` or `?view=` value.

#### Entity Detail

| Route                          | Page                                   | Description                                                                        |
| :----------------------------- | :------------------------------------- | :--------------------------------------------------------------------------------- |
| `/prs/[pr_id]`                 | `prs/[pr_id]/page.tsx`                 | PR flame diagram — visualises lifecycle phases of a single pull request            |
| `/issues/[issue_id]`           | `issues/[issue_id]/page.tsx`           | Issue flame diagram — tracks backlog wait time vs active work time for a work item |
| `/deployments/[deployment_id]` | `deployments/[deployment_id]/page.tsx` | Deployment flame diagram — shows pipeline runtime and deploy handoffs              |

#### People

| Route                                  | Page                                           | Description                            |
| :------------------------------------- | :--------------------------------------------- | :------------------------------------- |
| `/people`                              | `people/page.tsx`                              | People directory and activity overview |
| `/people/[person_id]`                  | `people/[person_id]/page.tsx`                  | Individual developer profile           |
| `/people/[person_id]/metrics/[metric]` | `people/[person_id]/metrics/[metric]/page.tsx` | Per-developer metric detail            |

#### Organization admin (`org/admin/` sub-group, requires `admin` or `owner` role)

`/admin` and `/admin/*` are permanent redirects to `/org/admin` and `/org/admin/*` (`next.config.js`).

| Route                     | Description                                                         |
| :------------------------ | :------------------------------------------------------------------ |
| `/org/admin`              | Organization overview                                               |
| `/org/admin/settings`     | Organization settings                                               |
| `/org/admin/users`        | User management (list, create, view, edit)                          |
| `/org/admin/teams`        | Team management (list, create, edit)                                |
| `/org/admin/identities`   | Developer identity mapping (list, create, edit)                     |
| `/org/admin/integrations` | Integration provider configuration, including customer push sources |
| `/org/admin/sync`         | Sync config management (list, create, view, edit, runs)             |
| `/org/admin/audit-logs`   | Organization audit log viewer                                       |
| `/org/admin/retention`    | Data retention policy settings                                      |
| `/org/admin/ip-allowlist` | IP allowlist management                                             |
| `/org/admin/ai`           | AI setup, including `/org/admin/ai/byo-llm`                         |

#### Platform admin (`superadmin/` sub-group, requires superuser)

| Route                                   | Description                                                      |
| :-------------------------------------- | :--------------------------------------------------------------- |
| `/superadmin`                           | Platform overview                                                |
| `/superadmin/settings`                  | Platform-wide settings                                           |
| `/superadmin/orgs`                      | Organization management (list, create at `/new`, detail)         |
| `/superadmin/users`                     | Global user management (list, create at `/new`, detail)          |
| `/superadmin/service-accounts/new`      | Create a service account                                         |
| `/superadmin/audit`                     | Platform audit log                                               |
| `/superadmin/licensing`                 | Licence management per organization                              |
| `/superadmin/product-telemetry`         | Product telemetry reader (all organizations; `/[orgId]` for one) |
| `/superadmin/context-fabric/validation` | Context Fabric validation                                        |
| `/superadmin/billing/*`                 | Billing views: subscriptions, invoices, plans, refunds, audit    |

The licensing surface consumes organization-scoped feature booleans; see the
[Agent Context Runtime entitlement contract](agent-context-runtime-entitlement.md)
for the hosted ACR-specific boundary.

### `(auth)` — Public Auth Flows

| Route                                                           | Page                    | Description                           |
| :-------------------------------------------------------------- | :---------------------- | :------------------------------------ |
| `/auth/signin`                                                  | `auth/signin/page.tsx`  | Sign-in form                          |
| `/auth/signup`                                                  | `auth/signup/page.tsx`  | Sign-up / registration form           |
| `/auth/onboard`                                                 | `auth/onboard/page.tsx` | Post-registration onboarding          |
| `/auth/error`                                                   | `auth/error/page.tsx`   | Auth error display                    |
| `/auth/verify`, `/auth/forgot-password`, `/auth/reset-password` | `auth/*/page.tsx`       | Email verification and password reset |

### `(marketing)` — Public Marketing

| Route                | Page                         | Description                                                                   |
| :------------------- | :--------------------------- | :---------------------------------------------------------------------------- |
| `/`                  | `(marketing)/page.tsx`       | Marketing landing page (authenticated users are redirected to `/dashboard`)   |
| `/marketing/pricing` | `marketing/pricing/page.tsx` | Pricing page (`/pricing` redirects here, as do the other root marketing URLs) |

## API Routes

### Internal (handled by Next.js)

| Route                     | Method   | Description                                                                                                                                                                       |
| :------------------------ | :------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/auth/[...nextauth]` | GET/POST | Auth.js (NextAuth) authentication endpoints — sign-in, sign-out, session, CSRF                                                                                                    |
| `/api/feedback`           | POST     | Creates a Linear issue from user feedback. Requires authentication. Rate limited (5 req/hour per user). Returns `503` when `LINEAR_API_KEY` / `LINEAR_TEAM_ID` are not configured |
| `/health`                 | GET      | Liveness/readiness probe for Docker HEALTHCHECK and load balancers. Returns `200 OK` with `{ status, ts }`. Independent of backend availability                                   |

### Proxied to Backend

The proxy (`src/proxy.ts`) rewrites all `/api/*` paths (except `/api/auth` and `/api/v1/llm-proxy`) and `/graphql` to the backend at `BACKEND_URL`, injecting the `Authorization` bearer token and `X-Org-Id` header.

| Route Pattern | Description                                                                 |
| :------------ | :-------------------------------------------------------------------------- |
| `/api/v1/*`   | Backend REST API — home, explain, drilldown, heatmap, quadrant, flame, etc. |
| `/graphql`    | Backend GraphQL API (urql client target)                                    |

### Not Proxied (Client-Side Only)

| Route               | Description                                                                                                                                                                                                                      |
| :------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/v1/llm-proxy` | Explicitly excluded from backend proxy in `src/proxy.ts`. Intended for LLM-related requests handled separately                                                                                                                   |
| `/api/v1/rum`       | Real User Monitoring endpoint. Web Vitals are POSTed here when `NEXT_PUBLIC_RUM_ENDPOINT` is set. Uses `navigator.sendBeacon` for fire-and-forget delivery. This route is proxied to the backend (not excluded from proxy rules) |

## Rate Limiting

The `/api/feedback` endpoint is rate limited to **5 requests per hour** per user (or per IP for anonymous clients).

- **Redis mode** (`REDIS_URL` is set): Uses a fixed-window counter via `INCR` + `EXPIRE`. Shared across all instances — required for distributed deployments with multiple replicas.
- **In-memory mode** (no `REDIS_URL`): Uses a per-process sliding-window timestamp array. Sufficient for single-instance deployments but resets on restart and is not shared across replicas.
- **Graceful fallback**: If Redis is configured but unreachable, the limiter silently falls back to in-memory mode and logs a warning.

Configuration:

- `REDIS_URL` — Redis connection string (e.g., `redis://localhost:6379/0`). Optional; omit for in-memory mode.

Implementation: `src/lib/rate-limit.ts` (limiter logic), `src/lib/redis.ts` (lazy singleton Redis client).

## Security Headers

The application sets security headers at two layers:

### Static Headers (`next.config.js`)

Applied to all routes via Next.js `headers()`:

| Header                      | Value                                           | Purpose                                                     |
| :-------------------------- | :---------------------------------------------- | :---------------------------------------------------------- |
| `X-Content-Type-Options`    | `nosniff`                                       | Prevents MIME-type sniffing                                 |
| `X-Frame-Options`           | `DENY`                                          | Blocks all iframe embedding                                 |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`               | Limits referrer leakage to cross-origin requests            |
| `Permissions-Policy`        | `camera=(), microphone=(), geolocation=()`      | Disables browser APIs not used by the app                   |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload`  | Enforces HTTPS for ~2 years with HSTS preload               |
| `Content-Security-Policy`   | (fallback — allows `unsafe-inline` for scripts) | Static-export / CDN fallback when middleware is unavailable |

### Per-Request CSP with Nonce (`src/proxy.ts`)

For server-rendered routes, the proxy middleware replaces the static CSP with a stricter nonce-based policy:

- **Nonce generation**: `generateNonce()` creates a base64url-encoded 16-byte random value using `crypto.getRandomValues()`.
- **CSP directives**: `script-src 'self' 'nonce-<value>'` — removes `unsafe-inline` from scripts. `style-src` retains `unsafe-inline` (required for Tailwind's runtime styles). `connect-src` includes `https://*.sentry.io` for error reporting.
- **Nonce propagation**: The nonce is attached via the `x-nonce` response header so that `layout.tsx` can read it and apply it to inline `<script>` tags (theme init, runtime-config).

### Modifying Headers for New Inline Scripts/Styles

1. **Inline scripts**: Add the nonce attribute (`nonce={nonce}`) to any new inline `<script>` tag in the layout. The nonce is available from the `x-nonce` request header. Do **not** add `unsafe-inline` to `script-src`.
2. **Inline styles**: Currently allowed via `unsafe-inline` in `style-src`. No additional changes needed for new inline styles.
3. **New external origins**: Add the origin to the relevant directive in `buildCspHeader()` in `src/proxy.ts` and in the static fallback CSP in `next.config.js`.

## Observability

### Sentry Error & Performance Monitoring

The application uses `@sentry/nextjs` for error tracking and performance monitoring across all runtime environments.

**Configuration files:**

| File                      | Runtime          | Key Settings                                                                                                          |
| :------------------------ | :--------------- | :-------------------------------------------------------------------------------------------------------------------- |
| `sentry.server.config.ts` | Node.js server   | Traces (10% prod / 100% dev)                                                                                          |
| `sentry.edge.config.ts`   | Edge runtime     | Traces (10% prod / 100% dev)                                                                                          |
| `instrumentation.ts`      | Server bootstrap | Dynamically imports server or edge config; exports `onRequestError` to capture Server Component and middleware errors |
| `next.config.js`          | Build time       | Wraps config with `withSentryConfig` — source map upload (when `SENTRY_AUTH_TOKEN` is set), debug log tree-shaking    |

**Environment variables:**

| Variable                 | Required     | Description                                                   |
| :----------------------- | :----------- | :------------------------------------------------------------ |
| `NEXT_PUBLIC_SENTRY_DSN` | Yes          | Sentry Data Source Name — used by the server and edge configs |
| `SENTRY_AUTH_TOKEN`      | No (CI only) | Enables source map upload during builds                       |
| `SENTRY_ORG`             | No (CI only) | Sentry organisation slug                                      |
| `SENTRY_PROJECT`         | No (CI only) | Sentry project slug                                           |

**What's instrumented:**

- **Client**: Not instrumented. There is no browser Sentry init.
- **Server**: Unhandled exceptions in API routes and Server Components via `Sentry.captureRequestError` (registered in `instrumentation.ts`).
- **Edge**: Unhandled exceptions in edge middleware/routes.

**Adding custom instrumentation:**

```ts
import * as Sentry from "@sentry/nextjs";

// Capture a custom error
Sentry.captureException(new Error("Something went wrong"));

// Capture a custom message
Sentry.captureMessage("User hit edge case X");

// Add a performance span
Sentry.startSpan({ name: "my-operation" }, () => {
    // ... code to measure ...
});

// Set user context (e.g., after sign-in)
Sentry.setUser({ id: userId, email });
```

## Key Files Quick Reference

| Path                                | Description                                |
| :---------------------------------- | :----------------------------------------- |
| `src/proxy.ts`                      | Central proxy and auth middleware          |
| `src/app/layout.tsx`                | Root layout (fonts, theme, runtime config) |
| `src/app/(app)/layout.tsx`          | Authenticated shell layout and providers   |
| `src/lib/apiClient.ts`              | REST fetch wrapper                         |
| `src/lib/api.ts`                    | Domain API functions and fallbacks         |
| `src/lib/graphql/urqlClient.ts`     | GraphQL client config                      |
| `src/lib/rate-limit.ts`             | Rate limiter (Redis + in-memory fallback)  |
| `src/lib/redis.ts`                  | Lazy singleton Redis client                |
| `src/components/shell/AppShell.tsx` | Shared app shell: sidebar, top bar, main   |
