# Testing Governance

This document defines practical quality gates for `dev-health-web` pull requests.

## Required PR Checks

Minimum checks for every PR:

1. `npm run lint`
2. `npm run typecheck`
3. `npm run test:unit`

Additional checks when applicable:

1. `npm run test:e2e` for user-flow or UI behavior changes
2. `npm run build` for routing/runtime/config changes

CI enforces:

1. Existing `Tests` workflow (`ci/run_tests.sh ci`)
2. Governance policy check for `src/**` changes (tests touched or explicit waiver)

## Test Strategy By Tier

| Tier     | Scope                                            | Use For                                                     | Expected Evidence                                                                                                                                       |
| -------- | ------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tier 0   | Static checks                                    | All PRs                                                     | Lint + typecheck output                                                                                                                                 |
| Tier 1a  | Unit tests (`src/lib/__tests__`)                 | Pure logic, transforms, hooks, utils                        | Updated/added targeted unit tests                                                                                                                       |
| Tier 1b  | Component tests (`src/components/**/*.test.tsx`) | React component behavior, form validation, user interaction | Vitest + RTL tests with mocked server actions (**Note:** no component test files exist yet — this tier is aspirational. See README for the convention.) |
| Tier 2   | Integration tests                                | Multi-module behavior, data/provider integration boundaries | Focused integration coverage or explicit gap note                                                                                                       |
| Tier 3a  | E2E (`tests/*.spec.ts`)                          | User-facing workflows against MSW mock server               | Passing Playwright run and trace/screenshot for risky UI changes                                                                                        |
| Tier 3b  | Live E2E (`tests/live/*.spec.ts`)                | Full-stack validation against real backend                  | Self-bootstrapping tests (no SQL seeding), `PLAYWRIGHT_LIVE_BACKEND_URL`                                                                                |
| Contract | Schema drift (`live-e2e.yml`)                    | GraphQL schema sync between repos                           | CI diff of `schema.graphql` against backend export                                                                                                      |

## `src/**` Change Policy

If a PR changes files under `src/`, it must include one of:

1. Test file changes (`tests/**`, `*.test.*`, `*.spec.*`, or `__tests__/`)
2. An explicit waiver line in the PR body:

`TEST-WAIVER: <why test files were not touched>`

The waiver is for low-risk refactors, copy/docs-only UI text, or equivalent cases where existing coverage is sufficient.
