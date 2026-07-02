# Customer Push Ingestion Setup Design

## Purpose

Define the web setup surfaces required for customer-push ingestion.

This is design guidance for the `Customer Push Ingestion API` Linear milestone. Penpot is not available in this environment, so this document becomes the implementation-oriented source of truth until visual mocks exist.

## Product position

Customer push is an alternative to FullChaos-managed provider sync.

Customer push is for customers that:

- cannot grant FullChaos long-lived provider credentials,
- need to keep provider access inside their environment,
- already have internal ETL or CI/CD jobs that can emit normalized developer-health facts,
- want to run a customer-owned webhook relay.

Managed sync is still the simpler default for customers who are comfortable connecting GitHub, GitLab, Jira, Linear, and other providers directly.

## Repo grounding

`dev-health-web` already has the relevant admin setup surfaces:

- `/org/admin/integrations`
- `/org/admin/integrations/[provider]`
- `/org/admin/sync`

Existing integration UX:

- provider cards for GitHub, GitLab, Jira, Linear, and LaunchDarkly,
- provider detail pages,
- saved credential cards,
- add/edit credential forms,
- first-time credential setup opens automatically when no credential exists.

Customer push should extend this existing integration area. Do not create a disconnected setup flow first.

## Information architecture

Recommended routes:

```text
/org/admin/integrations
/org/admin/integrations/[provider]
/org/admin/integrations/[provider]/customer-push/new
/org/admin/integrations/[provider]/customer-push/[source_id]
/org/admin/integrations/[provider]/customer-push/[source_id]/credentials
/org/admin/integrations/[provider]/customer-push/[source_id]/examples
/org/admin/integrations/[provider]/customer-push/[source_id]/validate
/org/admin/integrations/[provider]/customer-push/[source_id]/batches
/org/admin/integrations/[provider]/customer-push/[source_id]/batches/[ingestion_id]
```

Alternative if route count becomes too high:

```text
/org/admin/integrations/[provider]/customer-push/[source_id]?tab=credentials|examples|validate|batches
```

Prefer separate routes if the implementation needs deep links from docs, CLI output, email alerts, or failed-ingest notifications.

## Navigation model

Provider detail page should expose two setup modes:

1. Managed sync
2. Customer push

The customer-push card should not be hidden under an advanced menu. It solves a real enterprise buying concern: customers may not want FullChaos to store provider credentials.

### Provider detail layout

```text
[Provider header]
GitHub Integration
Manage your GitHub connections and ingestion mode.

[Mode cards]
┌────────────────────────────┐  ┌────────────────────────────┐
│ Managed sync               │  │ Customer push              │
│ FullChaos connects to      │  │ You push normalized data   │
│ GitHub and runs syncs.     │  │ from CI/CD or a relay.     │
│ [Set up managed sync]      │  │ [Set up customer push]     │
└────────────────────────────┘  └────────────────────────────┘

[Existing credentials]
[Existing sync configs]
[Existing customer-push sources]
```

## Screen 1: Source setup landing

### Goal

Help the customer choose between managed sync and customer push.

### Content

Managed sync card:

- FullChaos stores provider credentials.
- FullChaos schedules and runs provider syncs.
- Best for fastest setup.

Customer push card:

- Customer keeps provider credentials outside FullChaos.
- Customer sends normalized data with an ingest token.
- Works from CI/CD, cron, ETL, or webhook relay.
- Requires setup of source, credential, and runner.

Webhook-assisted badge:

- Show as `Experimental` until relay/backfill story is complete.
- Explain that webhooks accelerate updates but do not replace reconciliation.

### Empty state

No sources configured.

CTA: `Create customer-push source`

## Screen 2: Create customer-push source

### Fields

- Source display name
- Provider/system: GitHub, GitLab, Jira, Linear, Custom
- Source instance:
  - GitHub: `github.com/acme` or `github.com/acme/repo`
  - GitLab: `gitlab.com/group` or `gitlab.com/group/project`
  - Jira: `https://acme.atlassian.net` plus project keys
  - Linear: workspace slug or team key
  - Custom: customer-defined stable source id
- Ingestion mode: customer push
- Optional reconciliation cadence recommendation

### Rules

- One active owner per source instance.
- Managed sync and customer push cannot both own the same source instance.
- Disabled source cannot accept batches.

### Validation messages

Duplicate active source:

> This source is already owned by managed sync. Disable managed sync or create a separate source instance before enabling customer push.

Missing source instance:

> Enter a stable provider instance so incoming records can be scoped and deduplicated.

## Screen 3: Credential creation

### Goal

Create an org/source-scoped ingest credential for the customer.

### Fields

- Credential name
- Source binding
- Scopes:
  - `schema:read`
  - `ingest:write`
  - `ingest:status`
- Optional provider-specific scopes later:
  - `ingest:github`
  - `ingest:gitlab`
  - `ingest:jira`
  - `ingest:linear`
- Optional expiration

### Token display state

After creation:

- show token once,
- provide copy button,
- explain it cannot be viewed again,
- show setup examples using that token variable.

Suggested copy:

> Store this token in your CI/CD secret manager. FullChaos will not show it again.

### Credential list state

Columns/cards:

- name,
- scopes,
- source binding,
- created at,
- last used,
- last result,
- status: active, never used, rotated, revoked, expired,
- actions: rotate, revoke.

## Screen 4: Runner setup examples

### Tabs

- GitHub Actions
- GitLab Runner
- Generic Docker
- cURL
- Webhook relay

### GitHub Actions example

```yaml
name: Push Dev Health Data
on:
  schedule:
    - cron: "*/30 * * * *"
  workflow_dispatch:

jobs:
  push-dev-health:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Generate payload
        run: dev-hops push export github --repo "$GITHUB_REPOSITORY" --since "$SINCE" --until "$UNTIL" > payload.json
      - name: Validate payload
        run: dev-hops push validate payload.json --schema external-ingest.v1
      - name: Push payload
        run: dev-hops push batch payload.json --api-url "$FULLCHAOS_API_URL" --token "$FULLCHAOS_INGEST_TOKEN" --org "$FULLCHAOS_ORG_ID" --poll
        env:
          FULLCHAOS_API_URL: ${{ vars.FULLCHAOS_API_URL }}
          FULLCHAOS_ORG_ID: ${{ vars.FULLCHAOS_ORG_ID }}
          FULLCHAOS_INGEST_TOKEN: ${{ secrets.FULLCHAOS_INGEST_TOKEN }}
```

### GitLab Runner example

```yaml
push_dev_health:
  image: ghcr.io/full-chaos/dev-hops:latest
  script:
    - dev-hops push export gitlab --project "$CI_PROJECT_PATH" --since "$SINCE" --until "$UNTIL" > payload.json
    - dev-hops push validate payload.json --schema external-ingest.v1
    - dev-hops push batch payload.json --api-url "$FULLCHAOS_API_URL" --token "$FULLCHAOS_INGEST_TOKEN" --org "$FULLCHAOS_ORG_ID" --poll
  rules:
    - if: $CI_PIPELINE_SOURCE == "schedule"
```

### cURL example

```bash
curl -sS -X POST "$FULLCHAOS_API_URL/api/v1/external-ingest/batches" \
  -H "Authorization: Bearer $FULLCHAOS_INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $IDEMPOTENCY_KEY" \
  --data-binary @payload.json
```

### Webhook relay example state

Show as `Beta` or `Experimental`.

Copy:

> Webhooks can reduce latency but do not replace scheduled reconciliation. Use a relay when you want provider webhooks to stay inside your environment.

## Screen 5: Validate first payload

### Modes

- Paste JSON
- Upload JSON file
- Use sample payload
- Use CLI validation command

### Results

Valid state:

- green success state,
- record counts by kind,
- next CTA: `Push this payload`.

Invalid state:

- error table with index, kind, external id, field path, code, message,
- link to schema docs,
- copy CLI validation command.

## Screen 6: Ingest batch status

### List filters

- source,
- status,
- producer: CLI, CI, relay, API,
- date range,
- record kind.

### List columns

- ingestion id,
- source,
- producer,
- window,
- status,
- items received,
- accepted,
- rejected,
- created at,
- completed at.

### Detail page sections

- Summary
- Source and producer
- Batch envelope
- Record counts by kind
- Rejected records
- Recompute status
- Raw error summary

### Statuses

- accepted
- processing
- completed
- partial
- failed
- rejected
- ignored unsupported event

## Screen 7: Webhook-assisted setup

### Positioning

Webhook-assisted setup should be optional. It belongs after source and credential creation, not before.

### Modes

1. Customer-owned relay, recommended beta path
2. FullChaos-hosted webhook endpoint, later path
3. Disabled

### Customer-owned relay screen

Show:

- provider webhook events to subscribe to,
- sample relay command or container image,
- target FullChaos external ingest endpoint,
- required ingest token scopes,
- reconciliation schedule recommendation.

### FullChaos-hosted webhook screen

Do not ship until backend supports:

- source-scoped webhook secret,
- source-to-org mapping,
- replay protection,
- durable accepted/rejected status,
- rejected-record diagnostics.

## Design details for existing Linear issues

### CHAOS-2711 Developer and user documentation

Docs should map directly to UI tabs:

- Overview
- Source setup
- Credentials
- CI/CD examples
- Webhook relay
- Validation
- Batch status
- Troubleshooting

### CHAOS-2712 Authorization model

UI must display scopes and source binding during credential creation. Authorization cannot be invisible documentation-only behavior.

### CHAOS-2713 CI/CD examples

Examples should exist in both docs and product UI. UI examples should substitute known org/source values when available.

### CHAOS-2714 Web setup screens

This document is the detailed implementation guidance for that issue.

### CHAOS-2715 Webhook-assisted ingestion

UI should label webhook relay as beta/experimental until reconciliation exists.

## Acceptance criteria for web implementation

- Customer can create a customer-push source from provider detail page.
- Customer can generate source-scoped ingest credential.
- Customer can copy token once and see secret-storage guidance.
- Customer can view GitHub Actions, GitLab Runner, Docker, cURL, and webhook relay examples.
- Customer can validate first payload from the UI.
- Customer can view ingest batch status and rejected records.
- Customer can rotate and revoke ingest credentials.
- Customer can understand whether a source uses managed sync or customer push.
- Customer cannot accidentally configure both modes for the same source instance.
