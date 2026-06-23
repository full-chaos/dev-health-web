# Architecture: Team-Attribution Boundary (web is render-only)

**Status:** Authoritative (frontend boundary)
**Scope:** dev-health-web — what the web layer may and may NOT do with team attribution
**Backend source of truth:** [dev-health-ops `docs/architecture/team-attribution.md`](https://github.com/full-chaos/dev-health-ops/blob/main/docs/architecture/team-attribution.md)
**Related:** [`../user-journeys/investment-view.md`](../user-journeys/investment-view.md), [`../graphql-investment.md`](../graphql-investment.md)

> Landed with **CHAOS-2608 (CS7)** — the final web slice of the CHAOS-2600 epic.
> CS7 deleted the last client-side repo→team derivation and replaced it with
> render-only display of backend provenance.

## The one rule

**Team attribution is computed BACKEND-ONLY.** ClickHouse is the system of
record; the ops resolver stamps every work item with a `team_id` plus
provenance (`source`, `confidence`, `evidence`, `is_primary`). The web layer
**renders that provenance and nothing else** — it must never recompute, infer,
or "repair" a repo→team or item→team mapping client-side.

Concretely, in this repo:

- ✅ **DO** read `workItemTeamAttributions` (GraphQL) and display `source` /
  `confidence` as labels/badges. See `useWorkItemTeamAttributions`
  (`src/lib/graphql/hooks/useInvestment.ts`) and `TeamAttributionBadge`
  (`src/components/work/investment/TeamAttributionBadge.tsx`).
- ✅ **DO** render backend-built Sankey flows verbatim (e.g. `repoTeamFlow:
SankeyResponse` consumed by `RepoTeamSankeySection`). The server computes the
  repo→team hop; the component only draws it.
- ❌ **DON'T** map repos to teams, fold assignees into teams, or guess a team
  from evidence in TypeScript. The removed `buildRepoTeamSankey(units,
repoTeamMap, …)` helper did exactly this and was deleted in CS7.
- ❌ **DON'T** treat `manual_fallback` as authoritative team truth — it is a
  backstop guess and must read as **distinct and lower-confidence** in the UI.

## Source precedence (frontend decision tree)

The backend resolver evaluates **every** applicable source, persists each match
as a candidate, and sets `is_primary` on the **highest-precedence** one. The web
layer only needs to know the ordering so it can word and tone the provenance it
displays — it never makes this decision itself.

```
Highest trust ─────────────────────────────────────────────► Lowest trust

  native_team        (0) provider-native team field        confidence: high
    └▶ issue_project       (1) native issue project          confidence: high
        └▶ project_ownership   (2) team_project_ownership     confidence: high
            └▶ repo_ownership      (3) team_repo_ownership     confidence: medium
                └▶ assignee_membership (4) assignee's team      confidence: medium
                    └▶ linked_issue        (5) real linked-issue donor   confidence: medium
                        └▶ manual_fallback     (6) repo/project/member/issue-key backstop
                           │                                    confidence: manual | low
                           │   ⚠ DISTINCT, lower-confidence — never team truth
                           └▶ unassigned          (7) nothing matched   confidence: none
```

Reading the badge:

- The badge shows the **primary** (`is_primary`) source — the winner.
- `manual_fallback` renders as a muted **"Manual · low confidence"** badge, set
  apart from sources 0–5; it can only beat `unassigned`.
- `unassigned` means no team could be attributed (often an empty ClickHouse
  `teams` dimension), not a UI bug to "fix" client-side.

> A bare external issue-key _prefix_ is **not** linked-issue inheritance — only a
> real `work_item_dependencies` donor resolving to a first-class team (sources
> 0–4) counts as `linked_issue` (5). The web layer never tries to make this
> distinction; it trusts the backend `source` value.

## Where this is rendered

- **Evidence tab** of the Investment view — each work unit row carries a
  `TeamAttributionBadge`; expanding the unit shows the full
  `source · confidence · team` provenance line
  (`src/components/work/investment/InvestmentEvidenceTable.tsx`).
- Data flows: `InvestmentView` → `useWorkItemTeamAttributions(filters,
workItemIds)` → `attributionByWorkItem` map → `InvestmentEvidenceTable`.
