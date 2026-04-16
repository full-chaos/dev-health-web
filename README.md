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

2. **Start ClickHouse** (from `dev-health-ops`):

```bash
dev-hops grafana up
```

3. **Run the API:**

```bash
dev-hops api --db "clickhouse://localhost:8123/default" --reload
```

4. **Run the web app:**

```bash
BACKEND_URL="http://127.0.0.1:8000" npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

> **First checkout?** The GraphQL schema file (`src/lib/graphql/schema.graphql`) is exported from the `dev-health-ops` backend and is not generated locally. If it is missing, `npm run codegen` will fail. To obtain it, start the backend API and run:
> ```bash
> PYTHONPATH=../dev-health-ops/src python3 -m dev_health_ops.api.graphql.export_schema --out src/lib/graphql/schema.graphql
> npm run codegen
> ```
> See [Schema Contract Enforcement](#schema-contract-enforcement) for details.

### Frontend Only (Demo Mode)

You can run the frontend with sample data (no backend required):

```bash
npm install
npm run dev
```

This will serve the app at [http://localhost:3000](http://localhost:3000) using static sample data.

## Environment Variables

| Variable | Required | Purpose | Default / Notes |
|----------|----------|---------|-----------------|
| `BACKEND_URL` | No | Backend API base URL | `http://127.0.0.1:8000` |
| `AUTH_SECRET` | Prod: Yes, Dev: No | Auth.js signing/encryption secret | Falls back to a dev-only in-code value |
| `LINEAR_API_KEY` | Optional feature | Enables `POST /api/feedback` Linear issue creation | Must be set with `LINEAR_TEAM_ID`; route returns `503` if missing |
| `LINEAR_TEAM_ID` | Optional feature | Linear team target for feedback issues | Must be set with `LINEAR_API_KEY` |
| `NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS` | No | GraphQL analytics toggle (**default: enabled**). GraphQL is the default data layer; set to `false` to fall back to REST. | `true` |
| `USE_GRAPHQL_ANALYTICS` | No | Server-side runtime fallback for GraphQL toggle | Used when the public flag is absent |
| `NEXT_PUBLIC_DOCS_URL` | No | Docs/help link URL in UI | `/docs` |
| `NEXT_PUBLIC_DEV_HEALTH_TEST_MODE` | No | Use sample data in test/demo paths | `false` |
| `NEXT_PUBLIC_DEMO_MODE` | No | Show demo-only UI tabs and sample-data panels (e.g., Code Hotspots, Investment Expense in the Flow view). Backed by static data, not live APIs | `false` |
| `DEMO_EXPORT` | No | Enable static export build mode | `false` |
| `BASE_PATH` | No | Subpath hosting prefix (example: `/app`) | Empty (root) |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Sentry DSN for client + server + edge error reporting | Empty (Sentry still initializes but events go nowhere) |
| `NEXT_PUBLIC_SENTRY_REPLAY_ROUTES` | No | Comma-separated path prefixes that activate Sentry Session Replay. Replay is lazy-loaded on-demand so it stays out of the initial client bundle on non-matching routes. Set to an empty string to disable Replay entirely | `/admin,/superadmin` |

Deprecated (still read for compatibility):

- `NEXTAUTH_SECRET` -> use `AUTH_SECRET`.

Copy `.env.example` to `.env.local` and configure as needed.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript checks |
| `npm run test:unit` | Run unit tests (Vitest) |
| `npm run test:integration` | Run integration tier placeholder (currently no suite) |
| `npm run test:e2e` | Run e2e tests (Playwright) |
| `npm run test:e2e:live` | Run live-backend e2e smoke tests (Playwright) |
| `npm run test:ci` | Run CI gates (lint, typecheck, build, unit, integration, e2e) |

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

The `live-e2e.yml` CI workflow includes a GraphQL schema drift detection step that exports the backend Strawberry schema and diffs it against `src/lib/graphql/schema.graphql`. If the schemas diverge:

1. Start the `dev-health-ops` API locally.
2. Re-export: `PYTHONPATH=../dev-health-ops/src python3 -m dev_health_ops.api.graphql.export_schema --out src/lib/graphql/schema.graphql`
3. Regenerate types: `npm run codegen`
4. Commit `schema.graphql` + `__generated__/` together.

MSW mock handlers in `tests/mocks/handlers.ts` are typed with interfaces from `tests/mocks/types.ts` and generated GraphQL types, so TypeScript catches response shape mismatches at compile time.

### E2E Reliability Hardening (Phase 3)

- CI runs with Playwright retries enabled (`retries=2` when `CI=true`).
- Failure artifacts are always retained: traces (`trace: retain-on-failure`), video (`video: retain-on-failure`), and screenshots (`screenshot: only-on-failure`).
- JUnit output is written to `test-results/playwright/junit.xml` by default.
- HTML report output is written to `playwright-report/` by default.
- `ci/run_tests.sh e2e` clears and recreates artifact directories before each run and prints diagnostic context (Node/npm/Playwright versions + artifact paths).

These paths can be overridden with:

```bash
PLAYWRIGHT_REPORT_DIR=<dir> PLAYWRIGHT_RESULTS_DIR=<dir> PLAYWRIGHT_JUNIT_PATH=<file> bash ci/run_tests.sh e2e
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
