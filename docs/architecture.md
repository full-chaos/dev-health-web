# Architecture Overview: dev-health-web

## Overview

- **Framework**: Next.js 16.1.6 (React Server Components)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **UI**: Custom components (no shadcn/radix)

## Route Groups

- **`(app)`**: Main authenticated shell.
    - **Layout**: `src/app/(app)/layout.tsx`. Wraps in `SessionProvider` + `GraphQLProvider`. Calls `requireSession()`.
    - **`admin/`**: Sub-group. Uses `requireRole(["admin", "owner"])` + `AdminSidebar`.
    - **`superadmin/`**: Sub-group. Uses `requireSuperuser()` + `SuperadminSidebar`.
    - **Dashboard**: `(app)/dashboard/page.tsx`.
- **`(auth)`**: Public auth flows (signin, onboard, error).
    - **Layout**: `src/app/(auth)/layout.tsx`. Includes `Toaster`.
- **`(marketing)`**: Public marketing landing.
    - **Layout**: `src/app/(marketing)/layout.tsx`. No auth required.
- **Root Layout**: `src/app/layout.tsx`. Sets fonts, theme script (prevents FOUC), includes `runtime-config.js`.

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

## Navigation

- **PrimaryNav**: `src/components/navigation/PrimaryNav.tsx`. Main sidebar with collapsible groups.
- **ContextStrip**: Secondary navigation.
- **Settings Sidebars**: `AdminSidebar` and `SuperadminSidebar` for administrative contexts.

## Route Map

### `(app)` — Authenticated Routes

All routes below require an active session. The `(app)` layout wraps them in `SessionProvider` + `GraphQLProvider`.

#### Core Views

| Route            | Page                     | Description                                                                            |
| :--------------- | :----------------------- | :------------------------------------------------------------------------------------- |
| `/dashboard`     | `dashboard/page.tsx`     | Main cockpit — summary metrics, deltas, and sparklines                                 |
| `/metrics`       | `metrics/page.tsx`       | Detailed metrics explorer with filter bar                                              |
| `/code`          | `code/page.tsx`          | Code churn, hotspot heatmaps, ownership concentration, and churn × throughput quadrant |
| `/work`          | `work/page.tsx`          | Work-in-progress flow, cycle time, and throughput views                                |
| `/quality`       | `quality/page.tsx`       | Quality signals and reliability metrics                                                |
| `/capacity`      | `capacity/page.tsx`      | Team capacity and load analysis                                                        |
| `/investment`    | `investment/page.tsx`    | Investment allocation view (GraphQL-backed)                                            |
| `/opportunities` | `opportunities/page.tsx` | Improvement opportunities and recommendations                                          |
| `/demo`          | `demo/page.tsx`          | Demo/sample-data showcase                                                              |

#### Explore & Evidence

| Route                | Page                         | Description                                                                                                                                             |
| :------------------- | :--------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/explore`           | `explore/page.tsx`           | Metric evidence drill-down — supports explain, drilldown (PRs/issues), and home snapshot views via `?metric=` and `?api=` query params                  |
| `/explore/landscape` | `explore/landscape/page.tsx` | Quadrant landscape view — plots paired pressures (churn × throughput, cycle × throughput, WIP × throughput, review load × latency) with role-based lens |

#### Entity Detail (Flame Diagrams)

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

#### Admin (`admin/` sub-group, requires `admin` or `owner` role)

| Route                 | Page                          | Description                                       |
| :-------------------- | :---------------------------- | :------------------------------------------------ |
| `/admin`              | `admin/page.tsx`              | Admin overview                                    |
| `/admin/settings`     | `admin/settings/page.tsx`     | Organisation settings                             |
| `/admin/users`        | `admin/users/page.tsx`        | User management (list, create, edit)              |
| `/admin/teams`        | `admin/teams/page.tsx`        | Team management (list, create, edit)              |
| `/admin/identities`   | `admin/identities/page.tsx`   | Developer identity mapping (list, create, edit)   |
| `/admin/integrations` | `admin/integrations/page.tsx` | Integration provider configuration                |
| `/admin/sync`         | `admin/sync/page.tsx`         | Sync config management (list, create, view, edit) |
| `/admin/audit-logs`   | `admin/audit-logs/page.tsx`   | Organisation audit log viewer                     |
| `/admin/retention`    | `admin/retention/page.tsx`    | Data retention policy settings                    |
| `/admin/ip-allowlist` | `admin/ip-allowlist/page.tsx` | IP allowlist management                           |

#### Superadmin (`superadmin/` sub-group, requires superuser)

| Route                   | Page                            | Description                                                    |
| :---------------------- | :------------------------------ | :------------------------------------------------------------- |
| `/superadmin`           | `superadmin/page.tsx`           | Superadmin overview                                            |
| `/superadmin/settings`  | `superadmin/settings/page.tsx`  | Platform-wide settings                                         |
| `/superadmin/orgs`      | `superadmin/orgs/page.tsx`      | Organisation management (list, create, detail)                 |
| `/superadmin/users`     | `superadmin/users/page.tsx`     | Global user management                                         |
| `/superadmin/audit`     | `superadmin/audit/page.tsx`     | Platform audit log                                             |
| `/superadmin/licensing` | `superadmin/licensing/page.tsx` | Licence management per org                                     |
| `/superadmin/billing/*` | `superadmin/billing/*/page.tsx` | Billing views — subscriptions, invoices, plans, refunds, audit |

The licensing surface consumes organization-scoped feature booleans; see the
[Agent Context Runtime entitlement contract](agent-context-runtime-entitlement.md)
for the hosted ACR-specific boundary.

### `(auth)` — Public Auth Flows

| Route           | Page                    | Description                  |
| :-------------- | :---------------------- | :--------------------------- |
| `/auth/signin`  | `auth/signin/page.tsx`  | Sign-in form                 |
| `/auth/signup`  | `auth/signup/page.tsx`  | Sign-up / registration form  |
| `/auth/onboard` | `auth/onboard/page.tsx` | Post-registration onboarding |
| `/auth/error`   | `auth/error/page.tsx`   | Auth error display           |

### `(marketing)` — Public Marketing

| Route      | Page               | Description                                                                 |
| :--------- | :----------------- | :-------------------------------------------------------------------------- |
| `/`        | `page.tsx`         | Marketing landing page (authenticated users are redirected to `/dashboard`) |
| `/pricing` | `pricing/page.tsx` | Pricing page                                                                |

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
| `sentry.client.config.ts` | Browser          | Traces (10% prod / 100% dev), Session Replay (10% prod / 100% dev, 100% on error)                                     |
| `sentry.server.config.ts` | Node.js server   | Traces (10% prod / 100% dev)                                                                                          |
| `sentry.edge.config.ts`   | Edge runtime     | Traces (10% prod / 100% dev)                                                                                          |
| `instrumentation.ts`      | Server bootstrap | Dynamically imports server or edge config; exports `onRequestError` to capture Server Component and middleware errors |
| `next.config.js`          | Build time       | Wraps config with `withSentryConfig` — source map upload (when `SENTRY_AUTH_TOKEN` is set), debug log tree-shaking    |

**Environment variables:**

| Variable                 | Required     | Description                                         |
| :----------------------- | :----------- | :-------------------------------------------------- |
| `NEXT_PUBLIC_SENTRY_DSN` | Yes          | Sentry Data Source Name — used by all three configs |
| `SENTRY_AUTH_TOKEN`      | No (CI only) | Enables source map upload during builds             |
| `SENTRY_ORG`             | No (CI only) | Sentry organisation slug                            |
| `SENTRY_PROJECT`         | No (CI only) | Sentry project slug                                 |

**What's instrumented:**

- **Client**: Unhandled exceptions, unhandled promise rejections, performance traces, and Session Replay (with full error-session capture).
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

## Ask Dev contract artifacts

Ask Dev wire types under `src/lib/dev/` are consumers of the canonical
Pydantic contracts in `dev-health-ops`; the web repository does not redeclare
their shape. `scripts/ask-dev-contracts.mjs` copies the exact schemas and
positive/negative fixtures from a clean, pinned ops commit, records SHA-256
digests in `src/lib/dev/contracts/source.json`, and generates
`src/lib/dev/generated.ts` with `json-schema-to-typescript`.

The repositories land in order: first publish the ops foundation branch and
open/merge its contract PR, then update the full ops commit pinned in both the
web sync script and `.github/workflows/tests.yml`, and only then open the
dependent web PR. The pinned commit must be reachable from an ops branch so the
web quality job can check it out; web CI compares against that checkout rather
than trusting its vendored `source.json`.

After an approved ops contract change, regenerate from a clean sibling checkout:

```bash
pnpm ask-dev:contracts:generate --source ../dev-health-ops
pnpm ask-dev:contracts:check --source ../dev-health-ops
pnpm exec vitest run src/lib/dev/__tests__/contracts.test.ts
```

The vendored-only `pnpm ask-dev:contracts:check` remains available as a local
integrity check, but it is not release evidence. The quality gate requires
`ASK_DEV_OPS_ROOT` and runs the cross-repository check. Incompatible field, enum, bound, or
stream changes require a new contract version and the PRD/TRD change-control
process; do not patch generated TypeScript or vendored JSON by hand.

### Ask Dev browser and surface ownership

The authenticated app layout owns one `AskDevProvider` for both interaction
surfaces. The persistent app-shell window and `/dev` consume that provider's
conversation ID, committed scope, transcript, stream state, answer, and
retention choice. Expanding or minimizing changes presentation only; it must not
create a second conversation or submit a second run. A page change may update
the visible proposed context, but the provider commits a scope only when the
user submits a question.

Browser requests use the same-origin `/api/v1/dev/**` handlers. Those handlers read
the authenticated session token on the server and forward it to Ops; access and
provider credentials are never serialized into client state. Mutations require
a same-origin request, responses are `private, no-store`, and the client validates
every SSE event and terminal `dev_answer.v1` before rendering. The structured
answer renderer is shared by the window and full-page workspace so evidence,
metrics, warnings, status, freshness, conflicts, and feedback cannot drift by
surface.

Contextual launchers pass only IDs from the approved route, entity, filter, and
suggested-question registries. Opening a launcher focuses the window and shows
proposed context; it does not submit a question, scrape the DOM, or send page
copy. Context Fabric Validation is a separate superuser route at
`/superadmin/context-fabric/validation` and is intentionally excluded from the
customer window.

## Key Files Quick Reference

| Path                                       | Description                                |
| :----------------------------------------- | :----------------------------------------- |
| `src/proxy.ts`                             | Central proxy and auth middleware          |
| `src/app/layout.tsx`                       | Root layout (fonts, theme, runtime config) |
| `src/app/(app)/layout.tsx`                 | Authenticated shell layout and providers   |
| `src/lib/apiClient.ts`                     | REST fetch wrapper                         |
| `src/lib/api.ts`                           | Domain API functions and fallbacks         |
| `src/lib/graphql/urqlClient.ts`            | GraphQL client config                      |
| `src/lib/rate-limit.ts`                    | Rate limiter (Redis + in-memory fallback)  |
| `src/lib/redis.ts`                         | Lazy singleton Redis client                |
| `src/components/navigation/PrimaryNav.tsx` | Main sidebar navigation                    |
