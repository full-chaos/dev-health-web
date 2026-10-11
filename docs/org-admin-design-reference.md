# Org Admin design reference

## Overview

This is the shared design reference for the Org Admin surfaces. Use it as the checklist and exception log for a change to an Admin page.

The org-admin surfaces live under `/org/admin/*`. They are the Admin area of the shared app shell: the Organization and Connections destinations, each with its tab row.

## Design acceptance checklist

### Navigation & hierarchy

- [ ] Sidebar label, page title, breadcrumb, and route metadata all match for this surface, per A6.
- [ ] Sidebar shows only real destinations, with no preview, tab, or unbuilt routes exposed as nav items, per A1.
- [ ] Descriptor and eyebrow copy add real context, and do not repeat the title or use scaffolding nouns or plan-tier tags, per A8.

### Active state

- [ ] Exactly one destination is selected in the sidebar at a time, per A10.
- [ ] Parent Admin stays active on descendant routes, and descendant pages do not create a second selected item, per A10.
- [ ] Hover and focus states are visibly distinct from the selected state, per A10.

### Cards & callouts

- [ ] Cards are used for callouts and summarized state, not as a plain navigation directory.
- [ ] Any card cluster follows the operational-signal dashboard pattern, with clear hierarchy and no accidental nav replacement.
- [ ] Each card label and supporting text explain the state or signal, rather than duplicating the route list.

### CTAs

- [ ] Every button and link label comes from `src/lib/design/cta.ts`, per D and `cta-from-registry`.
- [ ] No inline CTA strings are introduced in this surface unless the registry already defines the exact label.
- [ ] New verbs are added to the registry first, then reused everywhere else, per D.

### Empty, loading & error states

- [ ] Empty, loading, and error states use `DataState`, per A11.
- [ ] Customer-facing fallback copy is safe and specific, with no raw error blocks, blank panels, or bare `--`, per A11.
- [ ] Any unavailable metric or data source path renders a controlled state instead of a broken shell, per A11.

### Tokens & formatting

- [ ] Colors, spacing, and radius use design tokens only, with no hardcoded hex or pixel values, per B1 and `no-hardcoded-style`.
- [ ] Numeric labels and chart values use `formatNumber` or `formatPercent`, per B1 and `chart-values-formatted`.
- [ ] Any new visual treatment matches the locked token scale in `docs/design-system.md`, not ad hoc component styling.

### Internal copy leakage

- [ ] User-facing copy contains no raw IDs, UUIDs, or long hash fragments, per A8 and `no-raw-id-in-jsx`.
- [ ] User-facing copy contains no `/api/`, `api/graphql`, `CHAOS-####`, graph edge names, detector or telemetry jargon, or Linear IDs, per A8 and `no-internal-leak`.
- [ ] Eyebrow, helper, and status text stay customer-safe, with debug details kept out of normal UI copy, per A8.

## Attaching after-screenshots & visual-regression proof

Attach after-screenshots in both places, the PR body and the linked Linear issue, following `docs/agent-visual-testing.md` and the repo visual-evidence rule. Use the `SCREENSHOT-WAIVER: <reason>` escape hatch only for backend, type-only, or no-render changes.

## Design-lint exceptions

`pnpm design-lint` runs the local design-lint checks. It blocks in Lefthook and in CI (see [`design-lint.md`](design-lint.md)).

Two suppression paths are supported:

```tsx
// design-lint-disable-next-line <rule> -- reason
```

and shared entries in `design-lint.allowlist.json` with `file`, optional `line`, and `reason`. Broad allowlist entries must stay rare and documented.

| File                | Rule | Reason |
| ------------------- | ---- | ------ |
| _None recorded yet_ |      |        |
