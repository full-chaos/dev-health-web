/**
 * Zod schemas for GraphQL analytics response validation.
 */

import { z } from "zod";

// =============================================================================
// Base types
// =============================================================================

export const DateRangeSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
});

// =============================================================================
// Timeseries schemas
// =============================================================================

export const TimeseriesBucketSchema = z.object({
  date: z.string(),
  value: z.number(),
});

export const TimeseriesResultSchema = z.object({
  dimension: z.string(),
  dimensionValue: z.string(),
  measure: z.string(),
  buckets: z.array(TimeseriesBucketSchema),
});

// =============================================================================
// Breakdown schemas
// =============================================================================

export const BreakdownItemSchema = z.object({
  key: z.string(),
  value: z.number(),
});

export const BreakdownResultSchema = z.object({
  dimension: z.string(),
  measure: z.string(),
  items: z.array(BreakdownItemSchema),
});

// =============================================================================
// Sankey schemas
// =============================================================================

export const SankeyNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  dimension: z.string(),
  value: z.number(),
});

export const SankeyEdgeSchema = z.object({
  source: z.string(),
  target: z.string(),
  value: z.number(),
});

export const SankeyCoverageSchema = z.object({
  teamCoverage: z.number(),
  repoCoverage: z.number(),
});

export const SankeyResultSchema = z.object({
  nodes: z.array(SankeyNodeSchema),
  edges: z.array(SankeyEdgeSchema),
  coverage: SankeyCoverageSchema.nullable().optional(),
});

// =============================================================================
// Combined analytics result
// =============================================================================

export const AnalyticsResultSchema = z.object({
  timeseries: z.array(TimeseriesResultSchema),
  breakdowns: z.array(BreakdownResultSchema),
  sankey: SankeyResultSchema.nullable().optional(),
});

// =============================================================================
// Input types
// =============================================================================

export const DimensionInputSchema = z.enum([
  "TEAM",
  "REPO",
  "AUTHOR",
  "WORK_TYPE",
  "THEME",
  "SUBCATEGORY",
]);

export const MeasureInputSchema = z.enum([
  "COUNT",
  "CHURN_LOC",
  "CYCLE_TIME_HOURS",
  "THROUGHPUT",
  "PIPELINE_SUCCESS_RATE",
  "PIPELINE_FAILURE_RATE",
  "PIPELINE_DURATION_P95",
  "PIPELINE_QUEUE_TIME",
  "PIPELINE_RERUN_RATE",
  "TEST_PASS_RATE",
  "TEST_FAILURE_RATE",
  "TEST_FLAKE_RATE",
  "TEST_SUITE_DURATION_P95",
  "COVERAGE_LINE_PCT",
  "COVERAGE_BRANCH_PCT",
  "COVERAGE_DELTA_PCT",
]);

export const BucketIntervalInputSchema = z.enum(["DAY", "WEEK", "MONTH"]);

export const TimeseriesRequestInputSchema = z.object({
  dimension: DimensionInputSchema,
  measure: MeasureInputSchema,
  interval: BucketIntervalInputSchema,
  dateRange: DateRangeSchema,
});

export const BreakdownRequestInputSchema = z.object({
  dimension: DimensionInputSchema,
  measure: MeasureInputSchema,
  dateRange: DateRangeSchema,
  topN: z.number().optional().default(10),
});

export const SankeyRequestInputSchema = z.object({
  path: z.array(DimensionInputSchema),
  measure: MeasureInputSchema,
  dateRange: DateRangeSchema,
  maxNodes: z.number().optional().default(100),
  maxEdges: z.number().optional().default(500),
  useInvestment: z.boolean().optional(),
});

// =============================================================================
// Filter input schemas
// =============================================================================

export const ScopeLevelInputSchema = z.enum([
  "ORG",
  "TEAM",
  "REPO",
  "SERVICE",
  "DEVELOPER",
]);

export const ScopeFilterInputSchema = z.object({
  level: ScopeLevelInputSchema.optional(),
  ids: z.array(z.string().min(1)).optional(),
});

export const WhoFilterInputSchema = z.object({
  developers: z.array(z.string().min(1)).optional(),
  roles: z.array(z.string().min(1)).optional(),
});

export const WhatFilterInputSchema = z.object({
  repos: z.array(z.string().min(1)).optional(),
  services: z.array(z.string().min(1)).optional(),
});

export const WhyFilterInputSchema = z.object({
  workCategory: z.array(z.string().min(1)).optional(),
  issueType: z.array(z.string().min(1)).optional(),
});

export const HowFilterInputSchema = z.object({
  flowStage: z.array(z.string().min(1)).optional(),
});

export const FilterInputSchema = z.object({
  scope: ScopeFilterInputSchema.optional(),
  who: WhoFilterInputSchema.optional(),
  what: WhatFilterInputSchema.optional(),
  why: WhyFilterInputSchema.optional(),
  how: HowFilterInputSchema.optional(),
});

export const AnalyticsRequestInputSchema = z.object({
  timeseries: z.array(TimeseriesRequestInputSchema).default([]),
  breakdowns: z.array(BreakdownRequestInputSchema).default([]),
  sankey: SankeyRequestInputSchema.optional(),
  useInvestment: z.boolean().optional(),
  filters: FilterInputSchema.optional(),
});

// =============================================================================
// Type exports
// =============================================================================

export type DateRange = z.infer<typeof DateRangeSchema>;
export type TimeseriesBucket = z.infer<typeof TimeseriesBucketSchema>;
export type TimeseriesResult = z.infer<typeof TimeseriesResultSchema>;
export type BreakdownItem = z.infer<typeof BreakdownItemSchema>;
export type BreakdownResult = z.infer<typeof BreakdownResultSchema>;
export type SankeyNode = z.infer<typeof SankeyNodeSchema>;
export type SankeyEdge = z.infer<typeof SankeyEdgeSchema>;
export type SankeyCoverage = z.infer<typeof SankeyCoverageSchema>;
export type SankeyResult = z.infer<typeof SankeyResultSchema>;
export type AnalyticsResult = z.infer<typeof AnalyticsResultSchema>;
export type DimensionInput = z.infer<typeof DimensionInputSchema>;
export type MeasureInput = z.infer<typeof MeasureInputSchema>;
export type BucketIntervalInput = z.infer<typeof BucketIntervalInputSchema>;
export type TimeseriesRequestInput = z.infer<typeof TimeseriesRequestInputSchema>;
export type BreakdownRequestInput = z.infer<typeof BreakdownRequestInputSchema>;
export type SankeyRequestInput = z.infer<typeof SankeyRequestInputSchema>;
export type AnalyticsRequestInput = z.infer<typeof AnalyticsRequestInputSchema>;
export type ScopeLevelInput = z.infer<typeof ScopeLevelInputSchema>;
export type ScopeFilterInput = z.infer<typeof ScopeFilterInputSchema>;
export type WhoFilterInput = z.infer<typeof WhoFilterInputSchema>;
export type WhatFilterInput = z.infer<typeof WhatFilterInputSchema>;
export type WhyFilterInput = z.infer<typeof WhyFilterInputSchema>;
export type HowFilterInput = z.infer<typeof HowFilterInputSchema>;
export type FilterInput = z.infer<typeof FilterInputSchema>;
