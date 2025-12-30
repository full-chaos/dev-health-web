# AGENTS.md — Guidance for AI coding agents working on dev-health-web

## Purpose

This document is the authoritative guide for any automated coding agent (Copilot-like, Gemini, or other AI assistants) working on the dev-health-web repository. It explains the project's architecture, common flows, recommended diagram types, developer workflows, and rules agents must follow.

## High-level architecture

- Frontend: Next.js app in `src/app` using React Server Components for pages and a component library under `src/components`.
- Data: Static sample data in `src/data` used for demos and unit tests. Real data comes from the dev-health-ops backend and APIs.
- Tooling: TypeScript, ESLint, Vitest, Playwright for e2e tests, and Vite/Vitest config files at project root.

## Primary flows

- Page rendering: `src/app` pages may use server or client components depending on interactivity. Keep data-fetching colocated with the page when possible.
- Charting/data transforms: `src/lib` contains transforms, mappers and helpers used by chart components.
- Tests: Unit tests live next to their modules under `src` or `src/lib/__tests__`; e2e tests live in `tests/`.

## Diagram types to use

- Component Diagram: shows major UI components and relationships (pages, shared components, charts, filters).
- Sequence Diagram: user interaction → page → data transforms → rendering (useful for complex interactions such as filter+chart updates).
- Data Flow Diagram: maps how sample data flows from `src/data` through `src/lib` into charts and components.
- Test Coverage Map: which components have unit/e2e tests and which are covered by Playwright flows.

## Key files & folders

- `src/app` — Next.js pages and routes.
- `src/components` — Reusable UI components and subfolders (charts, filters, navigation).
- `src/lib` — Data transforms, mappers, formatters, test helpers.
- `src/data` — Sample data and translations for demos.
- `tests` & `test-results` — Playwright and other e2e test artifacts.

## Development conventions for agents

- Read this file (`AGENTS.md`) first — it is the source of truth for architecture and flows.
- Make minimal, surgical changes. Prefer small commits/PRs that address a single concern.
- Run or update existing tests when adding or modifying behavior. Prefer targeted test updates rather than broad rewrites.
- Do not commit secrets or environment tokens. Use env vars for examples.
- When adding new files, include a brief unit test where practical and update relevant docs.

## Recent updates & gotchas

- Playwright dev server sets `DEV_HEALTH_TEST_MODE` and `NEXT_PUBLIC_DEV_HEALTH_TEST_MODE` in `playwright.config.ts` so components should support sample data without hitting APIs during tests.
- Sankey tests expect `data-testid="chart-sankey"` with a visible `<canvas>` and `[data-chart-ready="true"]` in `tests/sankey.spec.ts`.
- ESLint includes `react-hooks/set-state-in-effect` and `react-hooks/exhaustive-deps`; avoid synchronous `setState` in effects (derive sample data via memo + computed loading instead).
- `demoFilters` in `src/app/demo/page.tsx` must be typed as `MetricFilter` so `scope.level` stays within the union (`"repo" | "org" | "team" | "service" | "developer"`).

## PR & review behavior

- Use descriptive PR titles and reference related tests. Keep changes scoped to one feature or bugfix.
- If a change affects visuals, include a screenshot or link to Playwright trace when possible.

## Contact & further reading

Use the repository README for setup steps and `package.json` scripts to run dev server, tests, and linters.
