# Reports (Frontend)

Technical reference for the Report Center feature in dev-health-web.

---

## Routes

| Route           | Component          | Rendering              |
| --------------- | ------------------ | ---------------------- |
| `/reports`      | `ReportsPage`      | Server Component (RSC) |
| `/reports/new`  | `NewReportPage`    | Client Component       |
| `/reports/[id]` | `SingleReportPage` | Client Component       |

---

## Data Layer

All report data flows through a shared fetcher/query layer:

```
Pages → fetchers.ts → graphqlFetch (urqlClient) → Backend GraphQL API
```

### Key Files

| File                                     | Purpose                                           |
| ---------------------------------------- | ------------------------------------------------- |
| `src/lib/reports/types.ts`               | TypeScript types matching the GraphQL schema      |
| `src/lib/reports/queries.ts`             | GraphQL query and mutation strings                |
| `src/lib/reports/fetchers.ts`            | Async functions wrapping `graphqlFetch`           |
| `src/lib/reports/sample-data.ts`         | Static data used when `DEV_HEALTH_TEST_MODE=true` |
| `src/components/reports/StatusBadge.tsx` | Shared status indicator component                 |

### Types

- `SavedReport` — Report definition (matches `SavedReportType` in schema)
- `ReportRun` — Execution record (matches `ReportRunType` in schema)
- `CreateSavedReportInput` — Input for creating reports
- `UpdateSavedReportInput` — Input for editing reports
- `CloneSavedReportInput` — Input for cloning reports

### Fetchers

| Function            | Operation    | Used By                            |
| ------------------- | ------------ | ---------------------------------- |
| `fetchSavedReports` | Query list   | Reports list page                  |
| `fetchSavedReport`  | Query single | Report detail page                 |
| `fetchReportRuns`   | Query runs   | Report detail page                 |
| `createSavedReport` | Mutation     | New Report form                    |
| `updateSavedReport` | Mutation     | Edit mode on detail page           |
| `cloneSavedReport`  | Mutation     | Clone dialog on detail page        |
| `deleteSavedReport` | Mutation     | Delete confirmation on detail page |
| `triggerReport`     | Mutation     | "Run Now" button on detail page    |

---

## Test Mode

When `DEV_HEALTH_TEST_MODE=true` or `NEXT_PUBLIC_DEV_HEALTH_TEST_MODE=true`, the fetch functions return static sample data from `sample-data.ts` instead of hitting the GraphQL API. This is used by Playwright E2E tests.

The sample data includes three reports (Weekly Engineering Health, Frontend Team Quality, Backend API Performance) with associated run histories.

---

## Report Detail Page Features

The `/reports/[id]` page supports:

- **Inline Edit** — Toggle edit mode for name/description, saved via `updateSavedReport`
- **Clone** — Dialog prompts for new name, calls `cloneSavedReport`, redirects to clone
- **Delete** — Confirmation dialog with destructive action, calls `deleteSavedReport`
- **Run Now** — Triggers `triggerReport`, refreshes run history on completion
- **Rendered Content** — Displays the `renderedMarkdown` from the latest successful run
- **Configuration** — Reads scope/dateRange/metrics from `parameters` JSON field
- **Run History** — Table of all runs with status, duration, and trigger type

---

## GraphQL Schema Alignment

Frontend types are kept in sync with the backend schema at `src/lib/graphql/schema.graphql`. Key mappings:

| Schema Field                     | Frontend Field               | Notes                             |
| -------------------------------- | ---------------------------- | --------------------------------- |
| `SavedReportType.reportPlan`     | `SavedReport.reportPlan`     | JSON, opaque to frontend          |
| `SavedReportType.parameters`     | `SavedReport.parameters`     | Typed as `ReportParameters` in UI |
| `ReportRunType.renderedMarkdown` | `ReportRun.renderedMarkdown` | Displayed in detail page          |
| `ReportRunType.durationSeconds`  | `ReportRun.durationSeconds`  | Shown as `Xs` in run history      |
| `ReportRunType.triggeredBy`      | `ReportRun.triggeredBy`      | "manual" or "scheduler"           |
| `ReportRunType.artifactUrl`      | `ReportRun.artifactUrl`      | Future: downloadable report       |

The `CreateSavedReportInput` wraps user form fields into the schema's `input` object pattern — the mutation sends `{ orgId, input }` not flat args.
