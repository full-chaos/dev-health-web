# Full Chaos Dev Health Web

[Demo](https://demo.fullchaos.studio)

This is the application frontend for [dev-health-ops](https://github.com/chrisgeo/dev-health-ops).

## Prerequisites

- Node.js 18+ (recommended: 20+)
- npm, yarn, pnpm, or bun

## Getting Started

### Full Stack (with Backend)

1. **Install dependencies:**

```bash
npm install
```

2. **Start the backend** (ClickHouse and the API, from `dev-health-ops`): follow the ops
   [development environment guide](https://github.com/full-chaos/dev-health-ops/blob/main/docs/contribute/start/development-environment.md).
   The Python CLI is removed; the Go binary is `dho` (`dho api` serves the API).

3. **Run the web app:**

```bash
BACKEND_URL="http://127.0.0.1:8000" npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

> **First checkout?** The GraphQL schema file (`src/lib/graphql/schema.graphql`) is a verbatim copy of the `dev-health-ops` contract pin (`contracts/graphql/v1/schema.graphql`) and is not generated locally. If it is missing, `pnpm codegen` will fail. To obtain it, copy the pin from a `dev-health-ops` checkout beside this one (no running API is needed):
>
> ```bash
> cp ../dev-health-ops/contracts/graphql/v1/schema.graphql src/lib/graphql/schema.graphql
> pnpm codegen
> ```
>
> See [Schema Contract Enforcement](#schema-contract-enforcement) for details.

### Frontend Only (Demo Mode)

You can run the frontend with sample data (no backend required):

```bash
npm install
npm run dev
```

This will serve the app at [http://localhost:3000](http://localhost:3000) using static sample data.

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
| `ACR_API_ORIGIN`                    | ACR runtime        | Fixed HTTP(S) origin for server-to-server ACR reads; private service traffic normally uses HTTP and externally exposed traffic terminates TLS at the edge                                                                 | Must be an HTTP(S) origin without a path or query                 |
| `ACR_WEB_ASSERTION_KEY_FILE`        | ACR runtime        | Path to the server-only Ed25519 assertion private key                                                                                                                                                                     | Regular mode-`0600` file; never a `NEXT_PUBLIC_*` variable        |
| `ACR_WEB_ASSERTION_KID`             | ACR runtime        | JWKS key ID for signed web assertions                                                                                                                                                                                     | Must match the ACR JWKS configuration                             |
| `ACR_WEB_ASSERTION_ISSUER`          | ACR runtime        | Fixed web assertion issuer                                                                                                                                                                                                | Must match ACR configuration                                      |
| `ACR_WEB_ASSERTION_AUDIENCE`        | ACR runtime        | Fixed web assertion audience                                                                                                                                                                                              | Must match ACR configuration                                      |
| `ACR_REQUEST_TIMEOUT_MS`            | No                 | Bound for each server-to-server ACR request                                                                                                                                                                               | `5000`, minimum `100`, maximum `30000`                            |

Deprecated (still read for compatibility):

- `NEXTAUTH_SECRET` -> use `AUTH_SECRET`.

Copy `.env.example` to `.env.local` and configure as needed.

## Scripts

| Script                  | Description                                      |
| ----------------------- | ------------------------------------------------ |
| `npm run dev`           | Start development server                         |
| `npm run build`         | Build for production                             |
| `npm run start`         | Start production server                          |
| `npm run lint`          | Run ESLint                                       |
| `npm run typecheck`     | Run TypeScript checks                            |
| `npm run test:unit`     | Run unit tests (Vitest)                          |
| `npm run test:e2e`      | Run e2e tests (Playwright)                       |
| `npm run test:e2e:live` | Run live-backend e2e smoke tests (Playwright)    |
| `npm run test:ci`       | Run CI gates (lint, typecheck, build, unit, e2e) |

## Test Tiers (Phase 0 Contract)

Use the runner-agnostic entrypoint:

```bash
bash ci/run_tests.sh <unit|e2e|live-e2e|ci>
```

Examples:

```bash
# Local quick checks
bash ci/run_tests.sh unit
bash ci/run_tests.sh e2e
bash ci/run_tests.sh live-e2e

# Full CI-equivalent gate locally
npm run test:ci
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
npm run test:unit   # runs both unit and component Vitest projects
```

Key patterns:

- `src/test/utils.tsx` provides `renderWithToaster()` for components that emit toasts.
- Server actions (`"use server"`) are mocked at module level via `vi.mock()`.
- Common mocks: `next/navigation`, `next-auth/react`, `global.fetch`.

### Schema Contract Enforcement

The Go gqlgen schema in `dev-health-ops` is the source of truth. The ops repo pins it at `contracts/graphql/v1/schema.graphql`, and `src/lib/graphql/schema.graphql` is a verbatim copy of that pin. The `live-e2e.yml` CI workflow checks out `dev-health-ops` and its drift step fails on any difference between the two files (`diff -u`); the step has no condition. The job runs on every pull request that changes `src/**` or `codegen.ts`, so a change to the copy or to the generated types is always checked; a pull request that changes neither (documents only, for example) does not run it. If the files differ:

1. Copy the pin: `cp ../dev-health-ops/contracts/graphql/v1/schema.graphql src/lib/graphql/schema.graphql`
2. Regenerate types: `pnpm codegen`
3. Commit `schema.graphql` + `__generated__/` together.

The copy is never edited by hand. A field the pin does not have is added in `dev-health-ops` first. A pull request whose branch has the same name as a `dev-health-ops` branch is checked against that branch, not against ops `main`.

MSW mock handlers in `tests/mocks/handlers.ts` are typed with interfaces from `tests/mocks/types.ts` and generated GraphQL types, so TypeScript catches response shape mismatches at compile time.

### E2E Reliability Hardening (Phase 3)

- CI runs with Playwright retries enabled (`retries=2` when `CI=true`).
- Failure artifacts are always retained: video (`video: retain-on-failure`) and screenshots (`screenshot: only-on-failure`). The default E2E suite retains traces only on failure; Context Fabric persists traces on successful CI runs and writes named 1280/768/375 screenshots.
- Every suite writes its JUnit output beneath `test-results/playwright/<suite>/junit.xml`.
- Every suite writes its HTML report beneath `test-results/playwright-html/<suite>/`; CI uploads both roots, while certificates and auth state remain outside them.
- `ci/run_tests.sh e2e` clears and recreates artifact directories before each run and prints diagnostic context (Node/npm/Playwright versions + artifact paths).

These paths can be overridden with:

```bash
PLAYWRIGHT_REPORT_DIR=<dir> PLAYWRIGHT_RESULTS_DIR=<dir> bash ci/run_tests.sh e2e
```

## Documentation

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
