# AGENTS.md: dev-health-web

> **Canonical Reference:** See [`/AGENTS.md`](../AGENTS.md) for the unified Full Chaos Dev Health platform agent briefing.
>
> **Docs:** See [`docs/`](docs/) for dev-health-web-specific documentation (architecture, auth system, design system, GraphQL, testing, visualizations).

This document contains **dev-health-web specific** guidance for the Full Chaos Dev Health Next.js frontend.

## Purpose

This document is the authoritative guide for any automated coding agent (Copilot-like, Gemini, or other AI assistants) working on the dev-health-web repository. It explains the project's architecture, common flows, recommended diagram types, developer workflows, and rules agents must follow.

## Design and Style Framework

All UI changes must conform to the Design and Style Framework. See [`docs/design-system.md`](docs/design-system.md) for the full specification.

The Definition of Done requires:

> Conforms to the Design & Style Framework; uses the shared primitives; backing queries return resolved names (no unresolved ids surfaced); `npm run design-lint` passes; an after-screenshot or visual-regression assertion is attached.

## High-level architecture

- Frontend: Next.js app in `src/app` using React Server Components for pages and a component library under `src/components`.
- Data: Static sample data in `src/data` used for demos and unit tests. Real data comes from the dev-health-ops backend and APIs.
- Tooling: TypeScript, ESLint, Vitest, Playwright for e2e tests, and Vite/Vitest config files at project root.

## Primary flows

- Page rendering: `src/app` pages may use server or client components depending on interactivity. Keep data-fetching colocated with the page when possible.
- Charting/data transforms: `src/lib` contains transforms, mappers and helpers used by chart components.
- Tests: Unit tests live in `src/lib/__tests__`; component tests live alongside components at `src/components/**/*.test.tsx`; E2E tests live in `tests/`; live backend E2E tests live in `tests/live/`.

## Testing contract references

- Tier entrypoint and contract: `README.md` ("Test Tiers (Phase 0 Contract)") and `ci/run_tests.sh`.
- Default Playwright suite (mock/sample-data E2E): `playwright.config.ts` with `testIgnore: ["live/**"]`.
- Live backend suite (real API required): `playwright.live.config.ts` with `testDir: "./tests/live"`.
- CI workflow mapping: `.github/workflows/tests.yml` and `.github/workflows/live-e2e.yml`.
- Component tests: `src/components/**/*.test.tsx`, Vitest `components` project (jsdom). Uses `src/test/utils.tsx` for `renderWithToaster()`.
- MSW mock types: `tests/mocks/types.ts`, REST response interfaces. `tests/mocks/handlers.ts` uses `HttpResponse.json<T>()` for compile-time shape checking.
- Live E2E helpers: `tests/live/helpers.ts`, `testEmail()`, `registerUser()`, `loginUser()`, `authHeaders()`. All live tests self-bootstrap (no SQL seeding).
- Schema drift: `live-e2e.yml` runs `export_schema.py` from dev-health-ops and diffs against `src/lib/graphql/schema.graphql`.

## Diagram types to use

- Component Diagram: shows major UI components and relationships (pages, shared components, charts, filters).
- Sequence Diagram: user interaction → page → data transforms → rendering (useful for complex interactions such as filter+chart updates).
- Data Flow Diagram: maps how sample data flows from `src/data` through `src/lib` into charts and components.
- Test Coverage Map: which components have unit/e2e tests and which are covered by Playwright flows.

## Key files & folders

- `src/app`, Next.js pages and routes.
- `src/components`, Reusable UI components and subfolders (charts, filters, navigation).
- `src/lib`, Data transforms, mappers, formatters, test helpers.
- `src/data`, Sample data and translations for demos.
- `tests` & `test-results`, Playwright and other e2e test artifacts.

## Development conventions for agents

- Read this file (`AGENTS.md`) first, it is the source of truth for architecture and flows.
- **NEVER commit directly to main**, Always create a feature branch first:
    ```bash
    git checkout -b <type>/<descriptive-name>  # e.g., fix/chart-resize, feat/new-filter
    ```
- **Use git worktrees for parallel work**, When starting a new feature or unrelated task, use a worktree:
    ```bash
    git worktree add ../dev-health-web-feature-name feature/branch-name
    ```
    This keeps each task isolated, preventing cross-contamination of changes.
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
- **Visual evidence (MANDATORY):** Any change that affects rendered UI **must** include screenshots attached to both the PR body and the linked Linear issue/task.
    - **Canonical procedure:** [`docs/agent-visual-testing.md`](docs/agent-visual-testing.md), deterministic runbook for agents (account check → fixture seed → dev-server verify → Playwright login → screenshot → PR/Linear attach). Follow this end-to-end; the rules below are summary only.
    - Use the **Playwright MCP** (`playwright` skill) to capture screenshots of affected pages/components after the dev server is running
    - Attach screenshots to the GitHub PR body (upload via `gh` CLI or drag-and-drop)
    - Attach screenshots to the linked Linear issue (linear-cli cannot upload a local file — there is **no** `--attach` flag): upload the image to the GitHub PR first, then either `linear-cli attachments create --title "Screenshot" --url "<image-url>" <ID>` or reference the URL in a comment: `linear-cli issues comment <ID> -b "Screenshot: <image-url>"`
    - **Canonical test account:** `admin@devhealth.example` / `devhealth123` (seeded by `dev-hops fixtures generate`). Do not create ad-hoc accounts.
    - **What to capture:** Every page or component visually altered by the change, before/after if modifying existing UI, just after if net-new
    - **When to skip:** Changes that are purely backend, purely type-level, or have no rendered output (add `SCREENSHOT-WAIVER: <reason>` to PR body)
- **Governance gate (`enforce-src-test-policy`)**: Any PR that changes files under `src/` must either include at least one test file change (`tests/`, `__tests__/`, or `*.test.*`/`*.spec.*`) **or** include a `TEST-WAIVER:` line in the PR body explaining why tests were not touched. Example:
    ```
    TEST-WAIVER: CSS-only changes, no component logic affected
    ```
    The script lives at `.github/scripts/enforce-src-test-governance.mjs`. PRs that fail this check will be blocked from merging.

## Pre-commit + pre-push + commit-msg hooks (lefthook)

Lefthook drives three git hooks that match what CI enforces. Mirrors the
`dev-health-ops` setup so the platform shares one hook tool and one mental
model.

- **commit-msg** strips agent-attribution trailers from every commit message
  before the commit lands. Backs the repo-root `AGENTS.md` rule "Never add
  contribution attribution for agents in commits." Removes
  `Ultraworked with [...]`, `Co-authored-by: Sisyphus`,
  `Co-authored-by: Claude`, and `🤖 Generated with [Claude Code]` lines.
  Preserves real-human `Co-authored-by`, `Signed-off-by`, `Refs`, `Closes`.
  Implementation: `scripts/strip-agent-attribution.mjs`.
  Tests: `scripts/__tests__/strip-agent-attribution.test.mjs`.
- **pre-commit** auto-fixes formatting (`prettier --write`) and lint
  (`eslint --fix`) on staged files and re-stages the fixes
  (`stage_fixed: true`). The resulting commit is clean.
- **pre-push** is a final gate: `prettier --check` + `eslint` on the files
  being pushed. No auto-fix here, pre-push cannot modify the commits it's
  gating, so blocking with an instruction is the only correct shape.

### Install

```bash
pnpm install   # runs `prepare` → `lefthook install`
# or, manually:
pnpm exec lefthook install --force
```

Lefthook is a Go binary published as the `lefthook` npm package; pnpm only
runs its postinstall script if it's listed in `pnpm-workspace.yaml`'s
`allowBuilds` block. The repo already lists `lefthook: true` there.

### Hook behaviour

**commit-msg** (on every `git commit`, edits the commit message file in place):

| Step | Command                                        | Behaviour                                                                                                                 |
| ---- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1    | `node scripts/strip-agent-attribution.mjs {1}` | Removes agent-attribution trailers. Idempotent. Preserves real human `Co-authored-by`, `Signed-off-by`, `Refs`, `Closes`. |

**pre-commit** (on every `git commit`, for staged files):

| Step | Glob                                             | Command                                     | Behaviour                          |
| ---- | ------------------------------------------------ | ------------------------------------------- | ---------------------------------- |
| 1    | `*.{ts,tsx,js,mjs,cjs,jsx,json,md,css,yaml,yml}` | `pnpm exec prettier --write {staged_files}` | Auto-formats + re-stages           |
| 2    | `*.{ts,tsx,js,mjs,cjs,jsx}`                      | `pnpm exec eslint --fix {staged_files}`     | Auto-fixes lint issues + re-stages |

**pre-push** (on every `git push`, for files in pushed commits):

| Step | Glob                                             | Command                                   | Behaviour                                    |
| ---- | ------------------------------------------------ | ----------------------------------------- | -------------------------------------------- |
| 1    | `*.{ts,tsx,js,mjs,cjs,jsx,json,md,css,yaml,yml}` | `pnpm exec prettier --check {push_files}` | **Gate**: blocks if formatting issues remain |
| 2    | `*.{ts,tsx,js,mjs,cjs,jsx}`                      | `pnpm exec eslint {push_files}`           | **Gate**: blocks if lint issues remain       |

### Escape hatch

```bash
git commit --no-verify   # skip pre-commit + commit-msg (use sparingly, e.g. WIP)
git push --no-verify     # skip pre-push (emergency pushes)
```

### Disabling repo-wide

```bash
git config core.hooksPath /dev/null   # disable all hooks for this checkout
git config --unset core.hooksPath     # re-enable
```

## Contact & further reading

Use the repository README for setup steps and `package.json` scripts to run dev server, tests, and linters.

---

## Task Tracking (Linear)

> **Canonical Reference:** See [`/AGENTS.md`](../AGENTS.md#11-task-tracking-github-or-linear) for full documentation.

**Tracker:** Linear (default team: **CHAOS**).

### Quick Reference

```bash
linear-cli issues create "Task title" --team CHAOS --priority high
linear-cli issues list
linear-cli issues get CHAOS-123
linear-cli issues update CHAOS-123 --state "In Progress"
linear-cli issues update CHAOS-123 --state "Done"
```

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

## Linear

This project uses **Linear** for issue tracking.
Default team: **CHAOS**

### Creating Issues

```bash
# Create a simple issue
linear-cli issues create "Fix login bug" --team CHAOS --priority high

# Create with full details and dependencies
linear-cli issues create "Add OAuth integration" \
  --team CHAOS \
  --description "Integrate Google and GitHub OAuth providers" \
  --parent CHAOS-100 \
  --depends-on CHAOS-99 \
  --labels "backend,security" \
  --estimate 5

# List and view issues
linear-cli issues list
linear-cli issues get CHAOS-123
```

### Fetching private Linear images

`uploads.linear.app` URLs in issue descriptions require authentication.
Do **NOT** use `WebFetch` or `curl`, they will 401.

```bash
linear-cli uploads fetch "https://uploads.linear.app/..." -f /tmp/linear-img.png
# omit -f to stream the bytes to stdout instead
```

Then `Read` that path to view the image.

### Claude Code Skills

Available workflow skills (install with `linear-cli skills install --all`):

- `/prd` - Create agent-friendly tickets with PRDs and sub-issues
- `/triage` - Analyze and prioritize backlog
- `/cycle-plan` - Plan cycles using velocity analytics
- `/retro` - Generate sprint retrospectives
- `/deps` - Analyze dependency chains

Run `linear-cli skills list` for details.
