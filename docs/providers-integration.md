# Providers Integration

Documentation for how dev-health-web handles data providers (GitHub, GitLab, Jira, Linear, LaunchDarkly) and how to add a new one end-to-end.

## Overview

The web frontend mirrors the canonical provider pattern adopted in the ops backend. The upstream design decision is captured in:

- **Ops ADR / PR**: [dev-health-ops #714](https://github.com/chrisgeo/dev-health-ops/pull/714)
- **Linear issue**: [CHAOS-1549](https://linear.app/fullchaos/issue/CHAOS-1549)

The ops ADR established a canonical provider pattern and deprecated the legacy `connectors/` directory. The web side reflects this by centralising all provider metadata in `src/lib/admin/types.ts` and consuming it consistently across the admin UI.

## Current State

### Supported Providers

Five providers are currently supported. They are defined as a TypeScript union type and a runtime array in `src/lib/admin/types.ts` (lines 518–520):

```ts
// src/lib/admin/types.ts:518
export type Provider = "github" | "gitlab" | "jira" | "linear" | "launchdarkly";

export const PROVIDERS: Provider[] = ["github", "gitlab", "jira", "linear", "launchdarkly"];
```

Human-readable labels and the sync targets each provider supports are also declared in the same file (lines 522–536):

```ts
// src/lib/admin/types.ts:522
export const PROVIDER_LABELS: Record<Provider, string> = {
    github: "GitHub",
    gitlab: "GitLab",
    jira: "Jira",
    linear: "Linear",
    launchdarkly: "LaunchDarkly",
};

// src/lib/admin/types.ts:530
export const PROVIDER_SYNC_TARGETS: Record<Provider, string[]> = {
    github: ["git", "prs", "cicd", "deployments", "incidents", "work-items"],
    gitlab: ["git", "prs", "cicd", "deployments", "incidents", "work-items", "feature-flags"],
    jira: ["work-items"],
    linear: ["work-items"],
    launchdarkly: ["feature-flags"],
};
```

### Hardcoded Repository-Settings Guard

`src/components/admin/sync/SyncConfigForm.tsx` line 290 contains a **hardcoded union** that gates the "Repository Settings" section (owner, repos, GitLab URL) to only the two VCS providers:

```tsx
// src/components/admin/sync/SyncConfigForm.tsx:290
{
    (formData.provider === "github" || formData.provider === "gitlab") && (
        <div className="space-y-4">
            {/* Owner / Organization input, RepoSelector, GitLab URL */}
        </div>
    );
}
```

This is the **source of truth** for which providers expose repository-level configuration in the UI. Any new VCS provider that needs owner/repo fields must be added here.

A second guard at line 307 further restricts the GitLab-specific URL field:

```tsx
// src/components/admin/sync/SyncConfigForm.tsx:307
{
    formData.provider === "gitlab" && <div>{/* GitLab URL input */}</div>;
}
```

## Conventions — Where Provider Names Surface

The following files all reference provider names or the `Provider` type. Each must be updated when adding a new provider.

| File                                                            | What it does                                                                                                                                                |
| :-------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/admin/types.ts`                                        | **Source of truth.** Defines `Provider` union, `PROVIDERS` array, `PROVIDER_LABELS`, and `PROVIDER_SYNC_TARGETS`.                                           |
| `src/components/admin/sync/SyncConfigForm.tsx`                  | Renders the sync-config creation/edit form. Imports `PROVIDERS`, `PROVIDER_LABELS`, `PROVIDER_SYNC_TARGETS`. Hardcodes the repo-settings guard at line 290. |
| `src/components/admin/sync/CreateCredentialModal.tsx`           | Defines `PROVIDER_FIELDS` (credential field schemas per provider) and `getInitialCredentials()`. Both are keyed on `Provider`.                              |
| `src/components/admin/integrations/EditCredentialModal.tsx`     | Mirrors `PROVIDER_FIELDS` and `getInitialCredentials()` for the edit flow.                                                                                  |
| `src/components/admin/integrations/ProviderCredentialsList.tsx` | Accepts `provider: Provider` prop; renders the credential list for a given provider.                                                                        |
| `src/lib/admin/server/credentials.ts`                           | Server actions `testConnection(provider, ...)` and `deleteCredential(provider, ...)` — pass the provider string to the API layer.                           |
| `src/lib/admin/api/credentials.ts`                              | API client methods keyed on `provider` string: `get`, `update`, `delete`, `test`.                                                                           |
| `src/lib/admin/api/teams.ts`                                    | `discover(provider, ...)` — team-discovery endpoint is provider-scoped.                                                                                     |
| `src/lib/admin/server/teams.ts`                                 | `discoverTeams(provider)` server action wrapping the API call above.                                                                                        |
| `src/lib/graphql/schema.graphql`                                | `provider: String!` field on sync-related GraphQL types (lines 509, 597). Treated as an opaque string — no enum enforcement at the GraphQL layer.           |
| `src/lib/graphql/hooks/useSubscription.ts`                      | Filters real-time sync-progress events by `provider` string (line 64).                                                                                      |
| `src/components/admin/sync/SyncProgressBar.tsx`                 | Accepts `provider: string` prop; matches incoming subscription events by provider (line 30).                                                                |
| `src/components/admin/sync/SyncConfigCard.tsx`                  | Renders `config.provider` as a capitalised label (line 87).                                                                                                 |

### Test Fixtures

Tests that fixture a specific provider value:

| File                                                 | Provider used                                           |
| :--------------------------------------------------- | :------------------------------------------------------ |
| `src/components/admin/sync/SyncProgressBar.test.tsx` | `"github"` (multiple test cases)                        |
| `src/lib/admin/__tests__/server.test.ts`             | `"github"` (credential create, test-connection, delete) |

## How to Add a New Provider

Follow these steps in order. All changes are in `src/` — no `docs/` edits required.

### 1. Extend the TypeScript Union and Constants

**File:** `src/lib/admin/types.ts`

1. Add the new provider key to the `Provider` union (line 518).
2. Add it to the `PROVIDERS` array (line 520).
3. Add a human-readable label to `PROVIDER_LABELS` (line 522).
4. Add the supported sync targets to `PROVIDER_SYNC_TARGETS` (line 530). Use only IDs from `ALL_SYNC_TARGETS` in `SyncConfigForm.tsx` (`git`, `prs`, `cicd`, `deployments`, `incidents`, `work-items`, `feature-flags`).

### 2. Add Credential Fields

**File:** `src/components/admin/sync/CreateCredentialModal.tsx`

1. Add an entry to `PROVIDER_FIELDS` (line 20) listing the credential fields the user must supply.
2. Add a branch in `getInitialCredentials()` (line 39) returning the empty initial values for those fields.

**File:** `src/components/admin/integrations/EditCredentialModal.tsx`

Repeat the same two changes for the edit-credential flow (lines 23 and 42).

### 3. Add Repository-Settings UI (VCS providers only)

**File:** `src/components/admin/sync/SyncConfigForm.tsx`

If the new provider is a VCS system that requires an owner/organisation and repository selection, add it to the hardcoded guard at line 290:

```tsx
{(formData.provider === "github" || formData.provider === "gitlab" || formData.provider === "mynewprovider") && (
```

If it also needs a custom base URL (like GitLab), add a nested guard similar to the one at line 307.

### 4. Verify Server-Side Hooks

The server actions in `src/lib/admin/server/credentials.ts` and `src/lib/admin/api/credentials.ts` pass the provider string through to the backend API without any client-side allow-list. No changes are needed here unless the new provider requires a non-standard API path or request shape.

Similarly, `src/lib/admin/server/teams.ts` and `src/lib/admin/api/teams.ts` pass the provider string to the team-discovery endpoint — no changes needed unless the endpoint path differs.

### 5. Update Test Fixtures

Search for tests that fixture a specific provider and add parallel cases for the new provider where appropriate:

```bash
grep -rn '"github"\|"gitlab"' src/components/admin src/lib/admin
```

Key files to update:

- `src/components/admin/sync/SyncProgressBar.test.tsx` — add a test case with the new provider string.
- `src/lib/admin/__tests__/server.test.ts` — add credential create/test/delete cases.

### 6. Verify the GraphQL Layer

The GraphQL schema treats `provider` as an opaque `String` — no schema change is needed. Confirm the backend API accepts the new provider key before shipping.

## References

| Resource                               | Link                                                                      |
| :------------------------------------- | :------------------------------------------------------------------------ |
| Ops canonical provider ADR (PR)        | https://github.com/chrisgeo/dev-health-ops/pull/714                       |
| Ops ADR Linear issue                   | https://linear.app/fullchaos/issue/CHAOS-1549                             |
| Provider type + constants              | `src/lib/admin/types.ts` (lines 516–536)                                  |
| Sync config form (repo-settings guard) | `src/components/admin/sync/SyncConfigForm.tsx` (line 290)                 |
| Credential field schemas               | `src/components/admin/sync/CreateCredentialModal.tsx` (lines 20–37)       |
| Edit credential field schemas          | `src/components/admin/integrations/EditCredentialModal.tsx` (lines 23–41) |
| Server credential actions              | `src/lib/admin/server/credentials.ts`                                     |
| API credential client                  | `src/lib/admin/api/credentials.ts`                                        |
