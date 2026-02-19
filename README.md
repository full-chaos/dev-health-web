# Dev Health Web

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

### Frontend Only (Demo Mode)

You can run the frontend with sample data (no backend required):

```bash
npm install
npm run dev
```

This will serve the app at [http://localhost:3000](http://localhost:3000) using static sample data.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BACKEND_URL` | Backend API URL | `http://127.0.0.1:8000` |
| `NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS` | Enable GraphQL analytics | `false` |
| `NEXT_PUBLIC_DEV_HEALTH_TEST_MODE` | Use sample data (for testing) | `false` |
| `NEXT_PUBLIC_DOCS_URL` | Documentation link URL | — |
| `DEMO_EXPORT` | Enable static export mode | `false` |
| `BASE_PATH` | Subpath for hosting (e.g., `/app`) | — |

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
| `npm run test:ci` | Run CI gates (lint, typecheck, build, unit, integration, e2e) |

## Test Tiers (Phase 0 Contract)

Use the runner-agnostic entrypoint:

```bash
bash ci/run_tests.sh <unit|integration|e2e|ci>
```

Examples:

```bash
# Local quick checks
bash ci/run_tests.sh unit
bash ci/run_tests.sh e2e

# Full CI-equivalent gate locally
npm run test:ci
```

In GitHub Actions, workflows should call `bash ci/run_tests.sh <tier>` so Playwright browser install and tier behavior stay consistent across runners.

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

- **Framework:** Next.js 14+ with App Router
- **Components:** React Server Components + Client Components
- **Styling:** Tailwind CSS
- **Data:** urql GraphQL client, static sample data for demos
- **Testing:** Vitest (unit), Playwright (e2e)

![Screenshot](https://github.com/user-attachments/assets/8e823e44-2388-477a-bba5-3bd64efde538)
