# Org Admin design reference

## Overview

This bundle is the shared design reference for the Org Admin UX and Usability Redesign epic, CHAOS-2834. Every child issue should use it as the common checklist, evidence index, and exception log before moving to In Review.

The org-admin surfaces live under `/org/admin/*`, so this file keeps the mock links, current-state captures, and design-lint expectations aligned across the full surface area.

## Mock artifacts (Penpot)

Replace placeholders with Penpot frame URLs as mocks land; this is the canonical index.

| Surface                  | Mock link                               | Status  |
| ------------------------ | --------------------------------------- | ------- |
| Dashboard                | _Placeholder, attach Penpot frame link_ | Pending |
| Providers (integrations) | _Placeholder, attach Penpot frame link_ | Pending |
| GitHub provider detail   | _Placeholder, attach Penpot frame link_ | Pending |
| Settings                 | _Placeholder, attach Penpot frame link_ | Pending |
| Sync config form         | _Placeholder, attach Penpot frame link_ | Pending |
| Teams                    | _Placeholder, attach Penpot frame link_ | Pending |
| Identities               | _Placeholder, attach Penpot frame link_ | Pending |
| IP allowlist             | _Placeholder, attach Penpot frame link_ | Pending |
| Retention                | _Placeholder, attach Penpot frame link_ | Pending |
| Audit logs               | _Placeholder, attach Penpot frame link_ | Pending |

## Current-state screenshots

| Surface                  | Route                            | Current-state evidence                                                                        |
| ------------------------ | -------------------------------- | --------------------------------------------------------------------------------------------- |
| Dashboard                | `/org/admin`                     | [Screenshot](https://github.com/user-attachments/assets/72d304fa-4363-44b0-80fb-1997942edf6d) |
| Providers (integrations) | `/org/admin/integrations`        | [Screenshot](https://github.com/user-attachments/assets/eaf9562e-c2be-4246-b9f6-e56f640f8cbb) |
| GitHub provider detail   | `/org/admin/integrations/github` | [Screenshot](https://github.com/user-attachments/assets/69f02483-5ec4-4b0a-8dc3-1edfcd7b4028) |
| Settings                 | `/org/admin/settings`            | [Screenshot](https://github.com/user-attachments/assets/9e7499b2-990b-4474-99cf-b3cc621fafd7) |
| Sync config form         | `/org/admin/sync`                | [Screenshot](https://github.com/user-attachments/assets/5c10d3d1-468c-4ff1-b9d9-a843bbf2a5c2) |
| Teams                    | `/org/admin/teams`               | [Screenshot](https://github.com/user-attachments/assets/a506845a-0064-4764-9c40-f8b174e2066b) |
| Identities               | `/org/admin/identities`          | [Screenshot](https://github.com/user-attachments/assets/05e6accf-05d1-49ad-90f6-3df000f2d717) |
| IP allowlist             | `/org/admin/ip-allowlist`        | [Screenshot](https://github.com/user-attachments/assets/810cce10-1dbe-40a2-b27e-263e560e8a0b) |
| Retention                | `/org/admin/retention`           | [Screenshot](https://github.com/user-attachments/assets/5ef0a777-0eee-493f-88ab-9bc35c83bcb5) |
| Audit logs               | `/org/admin/audit-logs`          | [Screenshot](https://github.com/user-attachments/assets/474316fe-3727-465b-bd73-0119bd6ecad6) |

Current-state captures follow the runbook in `docs/agent-visual-testing.md`.

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

`pnpm design-lint` runs the local design-lint checks, and it is advisory in CI and Lefthook while the existing backlog is triaged. `pnpm lint` remains the blocking gate.

This epic uses a touched-files standard, not a repo-wide cleanup standard. The repo already has a pre-existing design-lint violation backlog, so child issues should keep only the files they change design-lint clean and record any approved exceptions here.

Two suppression paths are supported:

```tsx
// design-lint-disable-next-line <rule> -- reason
```

and shared entries in `design-lint.allowlist.json` with `file`, optional `line`, and `reason`. Broad allowlist entries must stay rare and documented.

| File                | Rule | Reason |
| ------------------- | ---- | ------ |
| _None recorded yet_ |      |        |
