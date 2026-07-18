# AGENTS — dev-health-web

Frontend: Next.js 16 + React Server Components, TypeScript, Tailwind v4, **pnpm**. Visualization-only — never the source of truth. Platform-wide contracts live in [`../AGENTS.md`](../AGENTS.md). Deep dives: [`docs/`](docs/).

## Read-first

| Need                                    | Source                                                                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Architecture                            | [`docs/architecture.md`](docs/architecture.md)                                                                             |
| Auth (NextAuth v5 beta)                 | [`docs/auth-system.md`](docs/auth-system.md)                                                                               |
| Design & Style Framework                | [`docs/design-system.md`](docs/design-system.md), [`docs/design-lint.md`](docs/design-lint.md)                             |
| GraphQL client / investment             | [`docs/graphql-client.md`](docs/graphql-client.md), [`docs/graphql-investment.md`](docs/graphql-investment.md)             |
| Team attribution (render-only boundary) | [`docs/architecture/team-attribution-boundary.md`](docs/architecture/team-attribution-boundary.md)                         |
| Visualizations                          | [`docs/visualizations.md`](docs/visualizations.md)                                                                         |
| Testing tiers & governance              | [`README.md`](README.md), [`ci/run_tests.sh`](ci/run_tests.sh), [`docs/testing-governance.md`](docs/testing-governance.md) |
| Visual-evidence runbook                 | [`docs/agent-visual-testing.md`](docs/agent-visual-testing.md)                                                             |

## Layout (`src/`)

| Path                                   | Role                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------- |
| `app/(app)` / `(auth)` / `(marketing)` | Route groups: authenticated · public auth · public marketing.             |
| `app/api`, `app/health`                | Route handlers + health check.                                            |
| `proxy.ts`                             | **Central middleware lives here, NOT `middleware.ts`.**                   |
| `lib/auth.ts`, `lib/guards/`           | Auth config + route guards.                                               |
| `lib/graphql/`                         | Client, generated types, `schema.graphql` (drift-checked vs ops).         |
| `lib/`                                 | Transforms, mappers, formatters (charting, investment, metrics, filters). |
| `components/`                          | UI; charts/filters/navigation. Tests colocated `*.test.tsx`.              |
| `data/`                                | Sample/demo data for test-mode + unit tests.                              |

## Key scripts (`pnpm <script>`)

```
dev · build · test:unit (vitest run) · test:e2e (playwright test)
lint (eslint src) · design-lint · typecheck (tsc --noEmit) · codegen (graphql-codegen)
```

## Web-specific rules

- **Definition of Done (UI):** conforms to Design & Style Framework, uses shared primitives, queries return resolved names (no raw ids surfaced), `pnpm design-lint` passes, after-screenshot/visual-regression attached.
- **Visual evidence is MANDATORY** for any rendered-UI change — PR **and** linked Linear issue. Follow [`docs/agent-visual-testing.md`](docs/agent-visual-testing.md) end-to-end (skills: `playwright`, `github-image-upload`). Canonical test account `admin@devhealth.example` / `devhealth123` (seeded by `dev-hops fixtures generate`); no ad-hoc accounts. Skip only for backend/type-only/no-render (`SCREENSHOT-WAIVER: <reason>`).
- **Governance gate `enforce-src-test-policy`:** any `src/` change needs a test change (`tests/`, `__tests__/`, `*.test.*`/`*.spec.*`) **or** a `TEST-WAIVER: <reason>` line in the PR body. Script: `.github/scripts/enforce-src-test-governance.mjs`.
- **Test mode:** Playwright sets `DEV_HEALTH_TEST_MODE` / `NEXT_PUBLIC_DEV_HEALTH_TEST_MODE` — components must render sample data without live APIs. Default suite ignores `live/**`; live backend suite is `playwright.live.config.ts` (`tests/live/`, self-bootstrapping).
- **Playwright traces:** the default suite retains traces on failure only; the dedicated Context Fabric configuration keeps CI traces for its evidence bundle.
- **ESLint:** `react-hooks/set-state-in-effect` + `exhaustive-deps` enforced — derive sample data via memo + computed loading, never sync `setState` in effects.
- **Schema drift:** `live-e2e.yml` exports the ops schema and diffs `src/lib/graphql/schema.graphql`. Never invent GraphQL fields.
- **Timeout-fallback masquerade (debugging):** a vitest/Playwright test whose duration ≈ its configured timeout (e.g. `2000`/`5000`/`15000` ms) is running on a timeout _fallback_, not the real completion event — it passes locally but hangs on slower CI. After **2 identical timeout failures, STOP** re-running or raising the timeout; run the **full harness locally** with debug logging (not the isolated test) and timestamp each event/timeout branch to find the signal that never fires. Make fallbacks loud (log when a timeout wins a `race(event, timeout)`) and assert completion arrived via the real event (e.g. a fixture that delays the fallback trigger). Cross-process handshakes (`process.send`/IPC) must flush before exit — un-awaited sends race process teardown differently on Linux CI than macOS.

## Hooks (lefthook)

`pnpm install` runs `lefthook install`. `commit-msg` strips agent attribution; `pre-commit` = `prettier --write` + `eslint --fix` (re-stages); `pre-push` gates `prettier --check` + `eslint`. Disable for a checkout: `git config core.hooksPath /dev/null`.
