# CHAOS-2728 Phase 3 Class C cockpit audit

Phase 3 audit surface: AI, Investment, Cognitive Load, Complexity, Landscape,
Diagnose/Work Graph, and Improve cockpit route families.

Classification vocabulary follows the Phase 3 plan:

- **Fully implemented** — the route/surface is wired to live GraphQL or live API
  fetchers and renders honest empty/error states when inputs are absent.
- **Implemented-but-empty-data** — the route/surface has real wiring, but the
  audited slice currently resolves to no data by design or ingestion state.
- **Structurally unconnected** — the route/surface is a static preview, orphaned
  component, or standalone route with no live data path.

## Summary

| Family                | Surface                                                      | Classification           | Evidence                                                                                                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AI                    | `/ai`                                                        | Fully implemented        | `src/app/(app)/ai/page.tsx` renders `AreaOverview`; `src/lib/areaSignals/ai.ts` resolves live AI signals and only uses sample data in test mode.                                                                                                                     |
| AI                    | `/ai/impact`                                                 | Fully implemented        | `src/app/(app)/ai/impact/page.tsx` mounts `AIImpactDashboard`; `src/components/ai/AIImpactDashboard.tsx` uses `AI_IMPACT_SUMMARY_QUERY`, `AI_COMPARISON_QUERY`, and explicit no-data branches.                                                                       |
| AI                    | `/ai/impact/evidence`                                        | Fully implemented        | `src/app/(app)/ai/impact/evidence/page.tsx` renders the evidence drilldown; `src/components/ai/AIImpactEvidenceList.tsx` uses `AI_ATTRIBUTED_PRS_QUERY`; drilldowns use `AI_WORKFLOW_DRILLDOWN_QUERY`.                                                               |
| AI                    | `/ai/risk`                                                   | Fully implemented        | `src/app/(app)/ai/risk/page.tsx` hosts governance risk views; `src/components/ai/AIRiskDashboard.tsx` uses `AI_RISK_BREAKDOWN_QUERY`, `AI_GOVERNANCE_SUMMARY_QUERY`, comparison data, and missing-data panels.                                                       |
| AI                    | `/ai/review-load`                                            | Fully implemented        | `src/app/(app)/ai/review-load/page.tsx` mounts `AIReviewLoadDashboard`; `src/components/ai/AIReviewLoadDashboard.tsx` uses `AI_REVIEW_LOAD_QUERY` and handles `data_available=false`.                                                                                |
| AI                    | `/ai/automations`                                            | Fully implemented        | `src/app/(app)/ai/automations/page.tsx` mounts `AIAutomationsDashboard`; `src/components/ai/AIAutomationsDashboard.tsx` uses `AI_OPPORTUNITIES_QUERY` and workflow drilldown data.                                                                                   |
| AI                    | `/ai/attribution`                                            | Fully implemented        | `src/app/(app)/ai/attribution/page.tsx` mounts `AIAttributionDashboard`; `src/components/ai/AIAttributionDashboard.tsx` uses `AI_ATTRIBUTION_OVERVIEW_QUERY` (`aiAttributionOverview`) and handles `dataAvailable=false` and error states. Resolved by `CHAOS-2744`. |
| AI                    | `/ai/evidence`, `/ai/test-gaps`                              | Fully implemented        | `src/app/(app)/ai/evidence/page.tsx` and `src/app/(app)/ai/test-gaps/page.tsx` are intentional redirect aliases into `/ai/risk?view=...`, not standalone data surfaces.                                                                                              |
| Investment            | `/investment`                                                | Fully implemented        | `src/app/(app)/investment/page.tsx` performs entitlement/bootstrap fetches; `src/components/work/InvestmentView.tsx` renders overview/allocation/evidence/confidence tabs.                                                                                           |
| Investment            | `/investment?tab=overview\|allocation\|evidence\|confidence` | Fully implemented        | `src/components/work/investment/useInvestmentData.ts`, `src/lib/graphql/hooks/useInvestment.ts`, and `src/lib/graphql/investmentFetchers.ts` wire work units, mix, flows, explanations, and backend-computed team attributions with empty-state branches.            |
| Cognitive Load        | `/cognitive-load`                                            | Fully implemented        | `src/app/(app)/cognitive-load/page.tsx` calls `getCognitiveLoadViaGraphQL()` and `getHeatmap()`; `src/components/cognitive-load/CognitiveLoadViews.tsx` renders overview, context switching, focus pressure, and load-driver views.                                  |
| Cognitive Load        | `/cognitive-load?tab=heatmap`                                | Fully implemented        | `src/components/work/HeatmapView.tsx` and `src/components/charts/HeatmapPanel.tsx` consume the live heatmap API; `src/lib/graphql/queries.ts` defines `COGNITIVE_LOAD_QUERY` for the same route family.                                                              |
| Complexity            | `/complexity`                                                | Fully implemented        | `src/app/(app)/complexity/page.tsx` prefetches `COMPLEXITY_TIMESERIES_QUERY` and `HOTSPOTS_QUERY`; `src/components/complexity/ComplexityDashboard.tsx` renders overview, hotspots, ownership-risk, and churn views.                                                  |
| Complexity            | `/complexity?tab=flame`                                      | Fully implemented        | `src/components/work/FlameView.tsx` consumes the live flame API through `src/lib/api/visuals.ts` and renders honest empty states.                                                                                                                                    |
| Landscape             | `/landscape`                                                 | Fully implemented        | `src/app/(app)/landscape/page.tsx` uses live quadrant data, `HOTSPOTS_QUERY`, and bus-factor data via `getBusFactorData()`/`BUS_FACTOR_QUERY`; `src/components/charts/QuadrantPanel.tsx` handles empty quadrants.                                                    |
| Landscape             | `/explore/landscape`                                         | Fully implemented        | `src/app/(app)/explore/landscape/page.tsx` is an intentional legacy redirect alias to `/landscape`, not a separate data surface.                                                                                                                                     |
| Landscape             | `src/components/work/LandscapeView.tsx`                      | Structurally unconnected | Legacy/orphaned component not used by the current `/landscape` route. It is not user-facing through the audited route family.                                                                                                                                        |
| Diagnose              | `/diagnose`                                                  | Fully implemented        | `src/app/(app)/diagnose/page.tsx` calls `getDiagnoseSignals()`; `src/lib/areaSignals/diagnose.ts` combines live REST and GraphQL sources before rendering `AreaOverview`.                                                                                            |
| Diagnose / Work Graph | `/diagnose/work-graph`                                       | Fully implemented        | `src/app/(app)/diagnose/work-graph/page.tsx` SSRs review edges and mounts `GraphView`; `src/components/work/GraphView.tsx` renders overview, dependencies, inflow/outflow, review-network, and artifacts tabs.                                                       |
| Diagnose / Work Graph | Work Graph tab data                                          | Fully implemented        | `src/lib/graphql/hooks/useWorkGraph.ts` uses `WORK_GRAPH_EDGES_QUERY`, `WORK_GRAPH_FLOW_QUERY`, and `WORK_GRAPH_ARTIFACTS_QUERY`; `src/lib/graphql/reviewEdgesFetchers.ts` uses `REVIEW_EDGES_QUERY`.                                                                |
| Improve               | `/improve`                                                   | Fully implemented        | `src/app/(app)/improve/page.tsx` calls `getAreaSignals("improve")`; `src/lib/areaSignals/improve.ts` resolves live home/opportunity/GraphQL signals.                                                                                                                 |
| Improve               | `/opportunities`                                             | Fully implemented        | `src/app/(app)/opportunities/page.tsx` renders live opportunities from `src/lib/api/home.ts` and links into AI/workflow context.                                                                                                                                     |
| Improve               | `/improve/automations`                                       | Fully implemented        | `src/app/(app)/improve/automations/page.tsx` mounts `ImproveAutomationsDashboard`; `src/components/improve/ImproveAutomationsDashboard.tsx` consumes `useImproveOpportunities()` / `IMPROVE_OPPORTUNITIES_QUERY`.                                                    |
| Improve               | `/improve/experiments`                                       | Fully implemented        | `src/app/(app)/improve/experiments/page.tsx` fetches experiments via `src/lib/graphql/improveFetchers.ts` / `EXPERIMENTS_QUERY` and renders empty/error states.                                                                                                      |

## Implemented-but-empty-data findings

No audited route-level surface was classified as **Implemented-but-empty-data**.
Several fully implemented pages have honest empty/no-data branches, but those are
runtime states inside live-wired surfaces rather than placeholder-only pages.

## Structural gaps and Linear follow-up

- `CHAOS-2744` resolved the structural gap this audit flagged:
  `/ai/attribution` is now wired to the live `aiAttributionOverview` resolver.
- No additional follow-up issue is recommended from this audit. The AI and
  Landscape redirect aliases are intentional route shims. The legacy
  `src/components/work/LandscapeView.tsx` component is orphaned implementation
  residue, but it is not a user-facing cockpit route and does not warrant a
  Phase 3 structural-gap issue by itself.
- Existing plan references remain related but not newly filed here:
  `CHAOS-2492` for Investment filtering, `CHAOS-2385`/`CHAOS-2386` for systemic
  developer/repo filters, `CHAOS-2624` for Work Graph empty data,
  `CHAOS-2227` for Improve structural follow-up, and `CHAOS-2223` for hub signal
  cards in test mode.

## Contract checks

- No feature code changes were made for this audit.
- No frontend recomputation of persisted categories, attribution, edges, or
  metric weights is proposed here.
- No Postgres attribution mapping, persistence path, or GraphQL schema change is
  proposed here.
- Screenshot evidence is waived for this PR because it is docs-only:
  `SCREENSHOT-WAIVER: docs-only`.
