# GEMINI.md — Agent guidance for dev-health-web

## Overview

This file explains how AI agents (Gemini, Copilot coding agents, or similar) should operate in the dev-health-web repository. Always treat `AGENTS.md` as the single source of truth for architecture, flows, diagrams, and conventions.

## Primary rules (summary)

- Read `AGENTS.md` before making changes. It contains the architecture and developer conventions.
- Make minimal, well-scoped edits. Aim for one change per PR.
- Run or update tests for any code you change. Prefer targeted unit tests.
- Do not add secrets or sensitive data to the repository.

## Common tasks for agents

- Implement or refactor small UI components under `src/components`.
- Add/adjust data transforms in `src/lib` and update affected tests.
- Wire new sample data under `src/data` for demos and unit tests.
- Fix linting issues and add test coverage when practical.

## Diagrams and documentation

Create diagrams (in Markdown or simple SVG) when a change affects flow or architecture. Preferred types:

- Component diagrams for UI changes.
- Sequence diagrams for non-trivial interactions (user → page → transforms → charts).
- Data flow diagrams for changes in `src/lib` or `src/data` transformations.

## Change submission

- Create a branch with a descriptive name.
- Include a short PR description summarizing the change and test updates.
- If modifying visuals, include a screenshot or Playwright trace link.

## Agent tooling & constraints

- The agent should prefer small, reviewable diffs and avoid sweeping refactors without human sign-off.
- When uncertain about intended UX or data semantics, open an issue instead of guessing.

## Source of truth

`AGENTS.md` is the canonical guide for architecture, flows, and agent behavior. Refer to it for specifics and follow it when in doubt.
