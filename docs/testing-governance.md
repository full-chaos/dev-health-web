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

| Tier | Scope | Use For | Expected Evidence |
| --- | --- | --- | --- |
| Tier 0 | Static checks | All PRs | Lint + typecheck output |
| Tier 1 | Unit tests (`*.test.*`, `*.spec.*`, `__tests__`) | Pure logic, transforms, hooks, utils | Updated/added targeted unit tests |
| Tier 2 | Integration tests | Multi-module behavior, data/provider integration boundaries | Focused integration coverage or explicit gap note |
| Tier 3 | E2E (`tests/*.spec.ts`) | User-facing workflows and route-level behavior | Passing Playwright run and trace/screenshot for risky UI changes |

## `src/**` Change Policy

If a PR changes files under `src/`, it must include one of:

1. Test file changes (`tests/**`, `*.test.*`, `*.spec.*`, or `__tests__/`)
2. An explicit waiver line in the PR body:

`TEST-WAIVER: <why test files were not touched>`

The waiver is for low-risk refactors, copy/docs-only UI text, or equivalent cases where existing coverage is sufficient.

