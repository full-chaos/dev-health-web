# TestOps Surface Map

## Overview

The TestOps section of dev-health-web exposes four analytical surfaces — Risk, Coverage, Pipelines, and Tests — that give engineering teams a unified view of CI/CD health and test quality. These surfaces are the web implementation of the TestOps product described in the upstream ops PRD [CHAOS-1538](https://linear.app/fullchaos/issue/CHAOS-1538). Each page is a Next.js React Server Component that fetches analytics via GraphQL (or falls back to static sample data in test/demo mode) and renders metric cards, timeseries charts, and breakdown charts scoped to the active filter context.

---

## Routes

All four routes live under the `(app)` authenticated route group and share the same filter/query-param conventions as the rest of the app.

### `/testops/risk`

**Source:** `src/app/(app)/testops/risk/page.tsx`

Deployment confidence and risk assessment. Surfaces three timeseries measures — pipeline success rate, test flake rate, and line coverage — alongside a quality-drag breakdown and a quadrant chart plotting pipeline success rate vs. test pass rate per team/repo.

**Key measures fetched:**

| Measure | Dimension | Interval |
| :--- | :--- | :--- |
| `PIPELINE_SUCCESS_RATE` | TEAM | DAY |
| `TEST_FLAKE_RATE` | TEAM | DAY |
| `COVERAGE_LINE_PCT` | TEAM | DAY |
| `PIPELINE_SUCCESS_RATE` (breakdown) | REPO | — |

**Charts used:** `TimeseriesChart`, `QuadrantChart`, `HorizontalBarChart`, `MetricCard`

**Fetcher:** `fetchRiskMetrics` (`src/lib/testops/fetchers.ts`)

---

### `/testops/coverage`

**Source:** `src/app/(app)/testops/coverage/page.tsx`

Code coverage metrics and trends. Tracks line coverage, branch coverage, and coverage delta over time, with a per-repo breakdown of line coverage.

**Key measures fetched:**

| Measure | Dimension | Interval |
| :--- | :--- | :--- |
| `COVERAGE_LINE_PCT` | TEAM | DAY |
| `COVERAGE_BRANCH_PCT` | TEAM | DAY |
| `COVERAGE_DELTA_PCT` | TEAM | DAY |
| `COVERAGE_LINE_PCT` (breakdown) | REPO | — |

**Charts used:** `TimeseriesChart`, `HorizontalBarChart`, `MetricCard`

**Fetcher:** `fetchCoverageMetrics` (`src/lib/testops/fetchers.ts`)

---

### `/testops/pipelines`

**Source:** `src/app/(app)/testops/pipelines/page.tsx`

CI pipeline health. Tracks success rate, failure rate, P95 duration, queue time, and rerun rate over time, with a heatmap showing failure rate broken down by team.

**Key measures fetched:**

| Measure | Dimension | Interval |
| :--- | :--- | :--- |
| `PIPELINE_SUCCESS_RATE` | TEAM | DAY |
| `PIPELINE_FAILURE_RATE` | TEAM | DAY |
| `PIPELINE_DURATION_P95` | TEAM | DAY |
| `PIPELINE_QUEUE_TIME` | TEAM | DAY |
| `PIPELINE_RERUN_RATE` | TEAM | DAY |
| `PIPELINE_FAILURE_RATE` (breakdown) | TEAM | — |

**Charts used:** `TimeseriesChart`, `HeatmapChart`, `MetricCard`

**Fetcher:** `fetchTestOpsData` (`src/lib/testops/fetchers.ts`) — returns `testOpsData.pipelines`

---

### `/testops/tests`

**Source:** `src/app/(app)/testops/tests/page.tsx`

Test suite health. Tracks pass rate, failure rate, flake rate, and P95 suite duration over time, with a heatmap showing flake rate broken down by team.

**Key measures fetched:**

| Measure | Dimension | Interval |
| :--- | :--- | :--- |
| `TEST_PASS_RATE` | TEAM | DAY |
| `TEST_FAILURE_RATE` | TEAM | DAY |
| `TEST_FLAKE_RATE` | TEAM | DAY |
| `TEST_SUITE_DURATION_P95` | TEAM | DAY |
| `TEST_FLAKE_RATE` (breakdown) | TEAM | — |

**Charts used:** `TimeseriesChart`, `HeatmapChart`, `MetricCard`

**Fetcher:** `fetchTestOpsData` (`src/lib/testops/fetchers.ts`) — returns `testOpsData.tests`

---

## Data Shapes

### Live data (GraphQL)

All four routes use the `AnalyticsRequestInput` / `AnalyticsResult` types from `src/lib/graphql/schemas/analytics.ts`. The result shape is:

```ts
type AnalyticsResult = {
  timeseries: TimeseriesResult[];   // one entry per measure
  breakdowns: BreakdownResult[];    // one entry per breakdown dimension
};

type TimeseriesResult = {
  dimension: string;
  dimensionValue: string;
  measure: string;
  buckets: TimeseriesBucket[];      // { date: string; value: number }[]
};

type BreakdownResult = {
  dimension: string;
  measure: string;
  items: BreakdownItem[];           // { key: string; value: number }[]
};
```

GraphQL queries are defined in `src/lib/testops/queries.ts` (`TESTOPS_PIPELINE_QUERY`, `TESTOPS_TEST_QUERY`, `TESTOPS_COVERAGE_QUERY`, `TESTOPS_RISK_QUERY`).

Measure metadata (labels, units, good-direction) is centralised in `src/lib/testops/constants.ts` as `TESTOPS_MEASURES`.

### Sample / test-mode data

When `DEV_HEALTH_TEST_MODE` or `NEXT_PUBLIC_DEV_HEALTH_TEST_MODE` is `"true"`, all fetchers bypass GraphQL and return static exports from `src/lib/testops/sample-data.ts`:

| Export | Used by |
| :--- | :--- |
| `SAMPLE_PIPELINES_DATA` | `/testops/pipelines`, `/testops/tests` (via `fetchTestOpsData`) |
| `SAMPLE_TESTS_DATA` | `/testops/tests` (via `fetchTestOpsData`) |
| `SAMPLE_COVERAGE_DATA` | `/testops/coverage` (via `fetchCoverageMetrics`) |
| `SAMPLE_RISK_DATA` | `/testops/risk` (via `fetchRiskMetrics`) |

Each export is typed as `AnalyticsResult`. The test-mode gate is set by Playwright in `playwright.config.ts` (see CHAOS-1573 for the gating rationale).

---

## Related

- [docs/visualizations.md](visualizations.md) — chart type selection guide (heatmaps, quadrants, timeseries, flame diagrams)
- [docs/architecture.md](architecture.md) — route groups, data-fetching patterns, and the full authenticated route map
