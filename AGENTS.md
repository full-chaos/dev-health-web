# AGENTS.md — dev-health-web

> **Canonical Reference:** See [`/AGENTS.md`](../AGENTS.md) for the unified Dev Health platform agent briefing.
>
> **Deep Dives:** See [`/docs/agent-instructions/`](../docs/agent-instructions/) for detailed topic documentation.

This document contains **dev-health-web specific** guidance for the Next.js frontend.

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
- **NEVER commit directly to main** — Always create a feature branch first:
  ```bash
  git checkout -b <type>/<descriptive-name>  # e.g., fix/chart-resize, feat/new-filter
  ```
- Make minimal, surgical changes. Prefer small commits/PRs that address a single concern.
- Run or update existing tests when adding or modifying behavior. Prefer targeted test updates rather than broad rewrites.
- Do not commit secrets or environment tokens. Use env vars for examples.
- When adding new files, include a brief unit test where practical and update relevant docs.

## Recent updates & gotchas

- Playwright dev server sets `DEV_HEALTH_TEST_MODE` and `NEXT_PUBLIC_DEV_HEALTH_TEST_MODE` in `playwright.config.ts` so components should support sample data without hitting APIs during tests.
- ESLint includes `react-hooks/set-state-in-effect` and `react-hooks/exhaustive-deps`; avoid synchronous `setState` in effects (derive sample data via memo + computed loading instead).
- `demoFilters` in `src/app/demo/page.tsx` must be typed as `MetricFilter` so `scope.level` stays within the union (`"repo" | "org" | "team" | "service" | "developer"`).

## PR & review behavior

- Use descriptive PR titles and reference related tests. Keep changes scoped to one feature or bugfix.
- If a change affects visuals, include a screenshot or link to Playwright trace when possible.

## Contact & further reading

Use the repository README for setup steps and `package.json` scripts to run dev server, tests, and linters.

---

## Task Tracking (bd + GitHub)

> **Canonical Reference:** See [`/AGENTS.md`](../AGENTS.md#11-task-tracking-bd--github) for full documentation.

**Project Board:** `https://github.com/orgs/full-chaos/projects/1`

### Quick Reference

```bash
# bd (local task tracking)
bd create "Task title" --priority P2 --external-ref gh-123
bd list --status open
bd status <id> in-progress
bd status <id> done
bd dep add <child-id> <parent-id> --type parent-child
bd sync

# GitHub issues (use labels, not --type)
gh issue create --title "Title" --body "Description" --label task
gh issue edit NNN --add-project "https://github.com/orgs/full-chaos/projects/1"
```

### Workflow

1. Create bd issue with `--external-ref gh-NNN` to link to GitHub
2. Update bd status during work
3. Run `bd sync` before `git push`
4. Close GitHub issue when complete

---

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
