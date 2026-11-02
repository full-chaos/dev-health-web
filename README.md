# Dev Health Web

Frontend for [dev-health-ops](https://github.com/full-chaos/dev-health-ops), the Dev Health backend (REST and GraphQL API). This app only shows data. The backend is the source of truth.

A running dev-health-ops backend is required. The app cannot run on sample data without one. A static demo export (`DEMO_EXPORT=true`) is a build artifact published at <https://demo.fullchaos.studio>, not a development mode.

## Contents

- [Architecture](#architecture)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Common tasks](#common-tasks)
- [Testing](#testing)
- [GraphQL schema contract](#graphql-schema-contract)
- [Project layout](#project-layout)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [Documentation](#documentation)
- [License](#license)

## Architecture

- **Stack:** Next.js 16 (App Router, React Server Components), React 19, TypeScript, Tailwind CSS v4, pnpm.
- **Route groups** in `src/app`: `(app)` authenticated shell, `(auth)` sign-in and onboarding, `(marketing)` public pages. Route handlers are in `src/app/api`; the health check is `src/app/health`.
- **Request proxy:** `src/proxy.ts` is the central middleware (not `middleware.ts`). It redirects unauthenticated users and rewrites `/api/` and `/graphql` requests to `BACKEND_URL` with the session bearer token.
- **Data:** GraphQL through urql is the default (`src/lib/graphql/`). REST helpers are in `src/lib/api.ts` and `src/lib/apiClient.ts`. Set `NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS=false` to fall back to REST where a fallback exists.
- **Auth:** NextAuth v5 (beta). See [docs/auth-system.md](docs/auth-system.md).
- **Server-only code:** modules with secrets start with `import "server-only"`. `pnpm check:client-bundle` fails the build check if server code or a secret value reaches a browser file. See [docs/architecture.md](docs/architecture.md).
- **Charts:** ECharts. See [docs/visualizations.md](docs/visualizations.md).

## Quick start

Requirements: Node.js `^22.13.0 || >=24` (`.nvmrc` pins 22), pnpm 11 (`packageManager` in `package.json`; use Corepack), and a running dev-health-ops API.

```bash
pnpm install
cp .env.example .env.local        # then edit; never commit it
BACKEND_URL=http://127.0.0.1:8000 pnpm dev
```

Open <http://localhost:3000>. To start the backend, follow the ops [development environment guide](https://github.com/full-chaos/dev-health-ops/blob/main/docs/contribute/start/development-environment.md).

Docker alternative:

```bash
docker compose -f compose.dev.yml up    # dev server in a container (target "dev")
docker compose up --build               # production-like image on :3000 with Valkey
```

Do not run `pnpm dev` on the host while the compose `web` service uses port 3000.

First checkout: `src/lib/graphql/schema.graphql` is a copy of an ops file. See [GraphQL schema contract](#graphql-schema-contract) if `pnpm codegen` fails.

## Configuration

Copy `.env.example` to `.env.local`. All variables are optional in the Zod schema; the app applies its own defaults. Full list, types and notes: [docs/env-vars.md](docs/env-vars.md). Source: `src/lib/config.ts`.

| Variable                                                                                                                                                    | Scope  | Purpose                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BACKEND_URL`                                                                                                                                               | server | dev-health-ops API base URL. Default `http://127.0.0.1:8000`.                                                                                                                                                                                                                                                                      |
| `AUTH_SECRET`                                                                                                                                               | server | Auth.js secret. Required in production. `NEXTAUTH_SECRET` is a legacy alias.                                                                                                                                                                                                                                                       |
| `AUTH_URL`                                                                                                                                                  | server | Public URL for auth callbacks (set behind Docker or a proxy).                                                                                                                                                                                                                                                                      |
| `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`                                                                                                                      | server | Optional GitHub sign-in.                                                                                                                                                                                                                                                                                                           |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`                                                                                                                      | server | Optional Google sign-in.                                                                                                                                                                                                                                                                                                           |
| `AUTH_GITLAB_ID`, `AUTH_GITLAB_SECRET`                                                                                                                      | server | Optional GitLab sign-in.                                                                                                                                                                                                                                                                                                           |
| `REDIS_URL`                                                                                                                                                 | server | Redis or Valkey URL for distributed rate limiting. Without it, limits are per process.                                                                                                                                                                                                                                             |
| `LINEAR_API_KEY`, `LINEAR_TEAM_ID`                                                                                                                          | server | Enable `POST /api/feedback` (returns `503` when unset).                                                                                                                                                                                                                                                                            |
| `ACR_API_ORIGIN`, `ACR_WEB_ASSERTION_KEY_FILE`, `ACR_WEB_ASSERTION_KID`, `ACR_WEB_ASSERTION_ISSUER`, `ACR_WEB_ASSERTION_AUDIENCE`, `ACR_REQUEST_TIMEOUT_MS` | server | Server-to-server ACR reads. See `.env.example`.                                                                                                                                                                                                                                                                                    |
| `ACR_OAUTH_ISSUER`                                                                                                                                          | server | ACR OAuth issuer (an exact origin). Unset = the ACR browser client is off. Set: the first-party browser client consents with no click, `/oauth/acr-client.json` serves its metadata document (https origins), CSP `connect-src` adds exactly this origin, and runtime config gives the browser the issuer and `AUTH_URL`'s origin. |
| `LOG_LEVEL`, `LOG_FORMAT`                                                                                                                                   | server | Pino log level and format.                                                                                                                                                                                                                                                                                                         |
| `BASE_PATH`                                                                                                                                                 | build  | Sub-path hosting prefix.                                                                                                                                                                                                                                                                                                           |
| `DEMO_EXPORT`                                                                                                                                               | build  | Build the static demo export.                                                                                                                                                                                                                                                                                                      |
| `DEV_HEALTH_TEST_MODE`                                                                                                                                      | server | Test mode with sample data. Must not be set in production.                                                                                                                                                                                                                                                                         |
| `USE_GRAPHQL_ANALYTICS`                                                                                                                                     | server | Server-side GraphQL toggle (default on).                                                                                                                                                                                                                                                                                           |
| `NEXT_PUBLIC_USE_GRAPHQL_ANALYTICS`                                                                                                                         | public | Client GraphQL toggle (default on).                                                                                                                                                                                                                                                                                                |
| `NEXT_PUBLIC_DOCS_URL`                                                                                                                                      | public | Docs link in the UI (default `/docs`).                                                                                                                                                                                                                                                                                             |
| `NEXT_PUBLIC_DEV_HEALTH_TEST_MODE`                                                                                                                          | public | Client mirror of test mode.                                                                                                                                                                                                                                                                                                        |
| `NEXT_PUBLIC_DEMO_MODE`                                                                                                                                     | public | Demo-only UI and sample-data panels.                                                                                                                                                                                                                                                                                               |
| `NEXT_PUBLIC_TELEMETRY_ENABLED`                                                                                                                             | public | Product telemetry switch (default on).                                                                                                                                                                                                                                                                                             |
| `NEXT_PUBLIC_RUM_ENDPOINT`                                                                                                                                  | public | Real User Monitoring endpoint.                                                                                                                                                                                                                                                                                                     |
| `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`                                                                                                 | mixed  | Sentry error reporting and source maps.                                                                                                                                                                                                                                                                                            |

`NEXT_PUBLIC_*` values are inlined at build time. For container-start overrides, `scripts/write-runtime-config.mjs` writes `public/runtime-config.js` (git-ignored; see [docs/env-vars.md](docs/env-vars.md)).

## Common tasks

| Task                              | Command                               |
| --------------------------------- | ------------------------------------- |
| Dev server                        | `pnpm dev`                            |
| Production build / start          | `pnpm build` / `pnpm start`           |
| Lint                              | `pnpm lint`                           |
| Design lint                       | `pnpm design-lint`                    |
| Type check                        | `pnpm typecheck`                      |
| Format (write / check)            | `pnpm format` / `pnpm format:check`   |
| Client bundle check (after build) | `pnpm check:client-bundle`            |
| GraphQL codegen (write / check)   | `pnpm codegen` / `pnpm codegen:check` |
| Unit and component tests          | `pnpm test:unit`                      |
| E2E tests                         | `pnpm test:e2e`                       |
| Live-backend E2E                  | `pnpm test:e2e:live`                  |
| Full CI gate locally              | `pnpm test:ci`                        |

## Testing

- **Unit and component:** Vitest (jsdom for components), React Testing Library, MSW v2 for API mocks. Tests sit next to the code (`*.test.ts(x)`) or in `__tests__/`.
- **E2E:** Playwright in `tests/`. Playwright sets test mode, so components render sample data without live APIs. Extra configs exist for navigation, onboarding, customer push and Context Fabric (see `package.json`).
- **Live E2E:** `tests/live/` runs against a real ops API (`PLAYWRIGHT_LIVE_BACKEND_URL`, default `BACKEND_URL`, then `http://127.0.0.1:8000`).
- **Runner:** `bash ci/run_tests.sh <unit|e2e|live-e2e|ci>`. The `ci` tier also runs the auth-profile gate, which needs ops-owned contract files; see [docs/auth-endpoint-profiles.md](docs/auth-endpoint-profiles.md).
- **Reports:** JUnit and HTML output go under `test-results/`. Override with `PLAYWRIGHT_REPORT_DIR` and `PLAYWRIGHT_RESULTS_DIR`.
- **Governance:** a change in `src/` needs a test change, or a `TEST-WAIVER: <reason>` line in the PR body. See [docs/testing-governance.md](docs/testing-governance.md) and [docs/ci-required-checks.md](docs/ci-required-checks.md).

## GraphQL schema contract

The Go schema in dev-health-ops is the source of truth. `src/lib/graphql/schema.graphql` is a verbatim copy of `contracts/graphql/v1/schema.graphql` in the ops repo. Never edit it by hand, and never invent a field; add it in ops first. The `live-e2e.yml` workflow diffs the two and fails on any difference.

```bash
cp ../dev-health-ops/contracts/graphql/v1/schema.graphql src/lib/graphql/schema.graphql
pnpm codegen
```

Commit `schema.graphql` and `__generated__/` together. Details: [docs/graphql-client.md](docs/graphql-client.md).

## Project layout

| Path                                                  | Role                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| `src/app/`                                            | Routes: `(app)`, `(auth)`, `(marketing)`, `api`, `health`.                     |
| `src/proxy.ts`                                        | Central proxy and auth redirects.                                              |
| `src/components/`                                     | UI components, charts, filters, shell.                                         |
| `src/lib/`                                            | Auth, GraphQL client and generated types, API clients, navigation, transforms. |
| `tests/`                                              | Playwright specs (`tests/live/` for live-backend).                             |
| `ci/`                                                 | Test runner and CI gates.                                                      |
| `contracts/`                                          | Contract inputs for gates.                                                     |
| `scripts/`                                            | Build and check scripts (client bundle, design lint, runtime config).          |
| `docs/`                                               | Deep-dive docs.                                                                |
| `Dockerfile`, `docker-compose.yml`, `compose.dev.yml` | Container builds and local stacks.                                             |
| `.github/workflows/`                                  | CI.                                                                            |

## Deployment

- **Production:** runs on Kubernetes. The Helm chart is in the separate `dev-health-deploy` repository, not here.
- **Image:** `Dockerfile` builds a standalone Node server on port 3000 with a `/health` check. `build-docker.yml` builds the image.
- **Demo:** `deploy-demo.yml` publishes the static export (`DEMO_EXPORT=true`) to GitHub Pages. See [docs/hosting.md](docs/hosting.md).

## Contributing

1. Branch from `main`.
2. Make the change with tests. UI changes need visual evidence ([docs/agent-visual-testing.md](docs/agent-visual-testing.md)).
3. Commit with a signed commit (`git commit -S`, or enable `commit.gpgsign`). Do not add agent attribution lines.
4. Run `pnpm lint`, `pnpm typecheck` and `pnpm test:unit`. Lefthook (installed by `pnpm install`) formats staged files on commit and checks prettier, eslint and types on push.
5. Open a pull request. Required checks are listed in [docs/ci-required-checks.md](docs/ci-required-checks.md).

Agent and contributor rules: [AGENTS.md](AGENTS.md).

## Documentation

| Topic                                  | Doc                                                                                                                                                            |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture, routes, server-only code | [docs/architecture.md](docs/architecture.md)                                                                                                                   |
| Environment variables                  | [docs/env-vars.md](docs/env-vars.md)                                                                                                                           |
| Auth                                   | [docs/auth-system.md](docs/auth-system.md), [docs/auth-endpoint-profiles.md](docs/auth-endpoint-profiles.md)                                                   |
| GraphQL                                | [docs/graphql-client.md](docs/graphql-client.md), [docs/graphql-investment.md](docs/graphql-investment.md), [docs/migration-guide.md](docs/migration-guide.md) |
| Design system                          | [docs/design-system.md](docs/design-system.md), [docs/design-lint.md](docs/design-lint.md)                                                                     |
| Visualizations                         | [docs/visualizations.md](docs/visualizations.md)                                                                                                               |
| Hosting the demo                       | [docs/hosting.md](docs/hosting.md)                                                                                                                             |
| Telemetry                              | [docs/product-telemetry.md](docs/product-telemetry.md)                                                                                                         |
| Security headers, rate limiting        | [docs/security-headers.md](docs/security-headers.md), [docs/rate-limiting.md](docs/rate-limiting.md)                                                           |

## License

Business Source License 1.1. See [LICENSE.md](LICENSE.md).
