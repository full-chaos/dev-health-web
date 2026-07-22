# Full Chaos Dev Health Web

[Demo](https://demo.fullchaos.studio)

This is the application frontend for [dev-health-ops](https://github.com/full-chaos/dev-health-ops).

## Prerequisites

- Node.js 22 or newer
- pnpm 11.15.1 (pinned by `packageManager`)

Enable the pinned pnpm toolchain with Corepack:

```bash
corepack enable
pnpm --version
```

## Getting Started

### Full Stack (with Backend)

Keep `dev-health-ops` and `dev-health-web` as sibling checkouts.

1. **Install dependencies:**

```bash
pnpm install --frozen-lockfile
```

2. **Start the backend data services** (from `dev-health-ops`):

```bash
cd ../dev-health-ops
docker compose up -d postgres clickhouse valkey pgbouncer

export POSTGRES_URI="postgresql+asyncpg://postgres:postgres@localhost:5555/postgres"
export CLICKHOUSE_URI="clickhouse://ch:ch@localhost:8123/default"
dev-hops migrate postgres
dev-hops migrate clickhouse
```

3. **Run the API:**

```bash
POSTGRES_URI="postgresql+asyncpg://postgres:postgres@localhost:5555/postgres" \
CLICKHOUSE_URI="clickhouse://ch:ch@localhost:8123/default" \
  dev-hops api --reload
```

4. **Run the web app:**

```bash
cd ../dev-health-web
BACKEND_URL="http://127.0.0.1:8000" pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

> **First checkout?** The GraphQL schema file (`src/lib/graphql/schema.graphql`) is exported from the `dev-health-ops` backend and is not generated locally. If it is missing, `pnpm codegen` will fail. To obtain it, start the backend API and run:
>
> ```bash
> PYTHONPATH=../dev-health-ops/src python3 -m dev_health_ops.api.graphql.export_schema --out src/lib/graphql/schema.graphql
> pnpm codegen
> ```
>
> See [Schema Contract Enforcement](#schema-contract-enforcement) for details.

### Frontend Only (Demo Mode)

You can run the frontend with checked-in sample data and no backend:

```bash
pnpm install --frozen-lockfile
NEXT_PUBLIC_DEV_HEALTH_TEST_MODE=true pnpm dev
```

This will serve the app at [http://localhost:3000](http://localhost:3000) using static sample data.

### Context Fabric/ACR

The private `dev-health-acr` repository owns the service and the OpenCode,
Claude Code, Codex, and Cursor packages. With sibling
`dev-health-{ops,acr,web}` checkouts, start the complete Docker plugin fixture
from Ops:

```bash
cd ../dev-health-ops
bash scripts/context-fabric-local.sh
```

The launcher derives its Ops services from the real `compose.yml`, layers the
canonical ACR Compose services and generated TLS configuration, runs `acr-api`
in Docker, and builds the host-local `acr-mcp`.

For Kubernetes, render or apply ACR from the same Ops checkout:

```bash
bash scripts/context-fabric-kubernetes.sh render \
  --image "$ACR_IMAGE" \
  --entitlement-url "$OPS_HTTPS_ORIGIN"

bash scripts/context-fabric-kubernetes.sh apply \
  --image "$ACR_IMAGE" \
  --entitlement-url "$OPS_HTTPS_ORIGIN"
```

The service workflows intentionally do not copy a Web assertion key into this
repository. Validate Web UI and BFF states separately with:

```bash
cd ../dev-health-web
pnpm test:e2e:context-fabric
```

See [`docs/context-fabric.md`](docs/context-fabric.md) for the Docker/Kubernetes
service boundary, live assertion variables, and contract checks.

## Environment Variables

| Variable                            | Required           | Purpose                                                                                                                                                                                                                   | Default / Notes                                                   |
| ----------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `BACKEND_URL`                       | No                 | Backend API base URL                                                                                                                                                                                                      | `http://127.0.0.1:8000`                                           |
| `AUTH_SECRET`                       | Prod: Yes, Dev: No | Auth.js signing/encryption secret                                                                                                                                                                                         | Falls back to a dev-only in-code value                            |
| `LINEAR_API_KEY`                    | Optional feature   | Enables `POST /api/feedback` Linear issue creation                                                                                                                                                                        | Must be set with `LINEAR_TEAM_ID`; route returns `503` if missing |
| `LINEAR_TEAM_ID`                    | Optional feature   | Linear team target for feedback issues                                                                                                                                                                                    | Must be set with `LINEAR_API_KEY`                                 |
| `NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS` | No                 | GraphQL analytics toggle (**default: enabled**). GraphQL is the default data layer; set to `false` to fall back to REST.                                                                                                  | `true`                                                            |
| `USE_GRAPHQL_ANALYTICS`             | No                 | Server-side runtime fallback for GraphQL toggle                                                                                                                                                                           | Used when the public flag is absent                               |
| `NEXT_PUBLIC_DOCS_URL`              | No                 | Docs/help link URL in UI                                                                                                                                                                                                  | `/docs`                                                           |
| `NEXT_PUBLIC_DEV_HEALTH_TEST_MODE`  | No                 | Use sample data in test/demo paths                                                                                                                                                                                        | `false`                                                           |
| `NEXT_PUBLIC_DEMO_MODE`             | No                 | Show demo-only UI tabs and sample-data panels (e.g., Code Hotspots, Investment Expense in the Flow view). Backed by static data, not live APIs                                                                            | `false`                                                           |
| `DEMO_EXPORT`                       | No                 | Enable static export build mode                                                                                                                                                                                           | `false`                                                           |
| `BASE_PATH`                         | No                 | Subpath hosting prefix (example: `/app`)                                                                                                                                                                                  | Empty (root)                                                      |
| `NEXT_PUBLIC_SENTRY_DSN`            | No                 | Sentry DSN for client + server + edge error reporting                                                                                                                                                                     | Empty (Sentry still initializes but events go nowhere)            |
| `NEXT_PUBLIC_SENTRY_REPLAY_ROUTES`  | No                 | Comma-separated path prefixes that activate Sentry Session Replay. Replay is lazy-loaded on-demand so it stays out of the initial client bundle on non-matching routes. Set to an empty string to disable Replay entirely | `/admin,/superadmin`                                              |
| `ACR_API_ORIGIN`                    | ACR runtime        | Fixed HTTPS origin for server-to-server ACR reads                                                                                                                                                                         | Must be an HTTPS origin without a path or query                   |
| `ACR_WEB_ASSERTION_KEY_FILE`        | ACR runtime        | Path to the server-only Ed25519 assertion private key                                                                                                                                                                     | Regular mode-`0600` file; never a `NEXT_PUBLIC_*` variable        |
| `ACR_WEB_ASSERTION_KID`             | ACR runtime        | JWKS key ID for signed web assertions                                                                                                                                                                                     | Must match the ACR JWKS configuration                             |
| `ACR_WEB_ASSERTION_ISSUER`          | ACR runtime        | Fixed web assertion issuer                                                                                                                                                                                                | Must match ACR configuration                                      |
| `ACR_WEB_ASSERTION_AUDIENCE`        | ACR runtime        | Fixed web assertion audience                                                                                                                                                                                              | Must match ACR configuration                                      |
| `ACR_REQUEST_TIMEOUT_MS`            | No                 | Bound for each server-to-server ACR request                                                                                                                                                                               | `5000`, minimum `100`, maximum `30000`                            |

Deprecated (still read for compatibility):

- `NEXTAUTH_SECRET` -> use `AUTH_SECRET`.

Copy `.env.example` to `.env.local` and configure as needed.

## Scripts

| Script                         | Description                                                   |
| ------------------------------ | ------------------------------------------------------------- |
| `pnpm dev`                     | Start development server                                      |
| `pnpm build`                   | Build for production                                          |
| `pnpm start`                   | Start production server                                       |
| `pnpm lint`                    | Run ESLint                                                    |
| `pnpm design-lint`             | Run design-system static checks                               |
| `pnpm typecheck`               | Run TypeScript checks                                         |
| `pnpm test:unit`               | Run unit tests (Vitest)                                       |
| `pnpm test:integration`        | Run integration tier placeholder (currently no suite)         |
| `pnpm test:e2e`                | Run e2e tests (Playwright)                                    |
| `pnpm test:e2e:context-fabric` | Run Context Fabric browser/BFF tests                          |
| `pnpm test:e2e:live`           | Run live-backend e2e smoke tests (Playwright)                 |
| `pnpm test:ci`                 | Run CI gates (lint, typecheck, build, unit, integration, e2e) |
| `pnpm acr:contracts:check`     | Check Web's ACR contract copies                               |

## Test Tiers (Phase 0 Contract)

Use the runner-agnostic entrypoint:

```bash
bash ci/run_tests.sh <unit|integration|e2e|live-e2e|ci>
```

Examples:

```bash
# Local quick checks
bash ci/run_tests.sh unit
bash ci/run_tests.sh e2e
bash ci/run_tests.sh live-e2e

# Full CI-equivalent gate locally
pnpm test:ci
```

### Live Backend E2E (Phase 2)

Use this tier when validating against a real `dev-health-ops` backend (no mock server).

Requirements:

- A running `dev-health-ops` API with healthy `/health` and seeded data (fixtures recommended).
- `PLAYWRIGHT_LIVE_BACKEND_URL` pointing at that API (defaults to `BACKEND_URL`, then `http://127.0.0.1:8000`).

Test suites in `tests/live/`:

- `journey.spec.ts` — 10 API-level tests: registration, login, onboarding, credentials CRUD, sync config CRUD. Self-bootstrapping (creates users via POST /register).
- `onboarding-ui.spec.ts` — 3 browser-level tests: signup form, login→onboard redirect, onboard→dashboard.
- `impersonation.spec.ts` — superuser impersonation flows (requires `TEST_SUPERUSER_*` env vars).
- `backend-api.spec.ts` / `pages.spec.ts` — API health and page-level smoke tests.

Shared utilities in `tests/live/helpers.ts`: `testEmail()`, `registerUser()`, `loginUser()`, `authHeaders()`.

Example:

```bash
PLAYWRIGHT_LIVE_BACKEND_URL="http://127.0.0.1:8000" bash ci/run_tests.sh live-e2e
```

In GitHub Actions, the `live-e2e.yml` workflow starts a real `dev-health-ops` API, runs Alembic migrations, seeds fixtures, and validates GraphQL schema drift before executing tests.

### Component Tests (Vitest + React Testing Library)

Component tests run under the Vitest `components` project (jsdom environment). Files live alongside components at `src/components/**/*.test.tsx`.

```bash
pnpm test:unit   # runs both unit and component Vitest projects
```

Key patterns:

- `src/test/utils.tsx` provides `renderWithToaster()` for components that emit toasts.
- Server actions (`"use server"`) are mocked at module level via `vi.mock()`.
- Common mocks: `next/navigation`, `next-auth/react`, `global.fetch`.

### Schema Contract Enforcement

The `live-e2e.yml` CI workflow includes a GraphQL schema drift detection step that exports the backend Strawberry schema and diffs it against `src/lib/graphql/schema.graphql`. If the schemas diverge:

1. Start the `dev-health-ops` API locally.
2. Re-export: `PYTHONPATH=../dev-health-ops/src python3 -m dev_health_ops.api.graphql.export_schema --out src/lib/graphql/schema.graphql`
3. Regenerate types: `pnpm codegen`
4. Commit `schema.graphql` + `__generated__/` together.

MSW mock handlers in `tests/mocks/handlers.ts` are typed with interfaces from `tests/mocks/types.ts` and generated GraphQL types, so TypeScript catches response shape mismatches at compile time.

### E2E Reliability Hardening (Phase 3)

- CI runs with Playwright retries enabled (`retries=2` when `CI=true`).
- Failure artifacts are always retained: video (`video: retain-on-failure`) and screenshots (`screenshot: only-on-failure`). The default E2E suite retains traces only on failure; Context Fabric persists traces on successful CI runs and writes named 1280/768/375 screenshots.
- Every suite writes its JUnit output beneath `test-results/playwright/<suite>/junit.xml`.
- Every suite writes its HTML report beneath `test-results/playwright-html/<suite>/`; CI uploads both roots, while certificates and auth state remain outside them.
- `ci/run_tests.sh e2e` clears and recreates artifact directories before each run and prints diagnostic context (Node/pnpm/Playwright versions + artifact paths).

These paths can be overridden with:

```bash
PLAYWRIGHT_REPORT_DIR=<dir> PLAYWRIGHT_RESULTS_DIR=<dir> bash ci/run_tests.sh e2e
```

## Documentation

- `docs/context-fabric.md` — Context Fabric/ACR UI and BFF development
- `docs/visualizations.md` — Chart selection guide (heatmaps, quadrants, flame diagrams)
- `docs/graphql-client.md` — urql GraphQL client usage
- `docs/graphql-investment.md` — Investment View GraphQL API
- `docs/hosting.md` — Demo exports, GitHub Pages, CDN hosting
- `docs/migration-guide.md` — REST to GraphQL migration

## Architecture

- **Framework:** Next.js 16+ with App Router
- **Components:** React Server Components + Client Components
- **Styling:** Tailwind CSS v4
- **Data:** urql GraphQL client (default), REST fallback, static sample data for demos
- **Testing:** Vitest (unit + component), Playwright (E2E + live backend), MSW v2 (API mocking)

![Screenshot](https://github.com/user-attachments/assets/8e823e44-2388-477a-bba5-3bd64efde538)
