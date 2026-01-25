/**
 * Zod schemas for GraphQL catalog response validation.
 */

import { z } from "zod";

// =============================================================================
// Catalog schemas
// =============================================================================

export const CatalogDimensionSchema = z.object({
  name: z.string(),
  description: z.string(),
});

export const CatalogMeasureSchema = z.object({
  name: z.string(),
  description: z.string(),
});

export const CatalogLimitsSchema = z.object({
  maxDays: z.number(),
  maxBuckets: z.number(),
  maxTopN: z.number(),
  maxSankeyNodes: z.number().optional(),
  maxSankeyEdges: z.number().optional(),
  maxSubRequests: z.number().optional(),
});

export const CatalogValueItemSchema = z.object({
  value: z.string(),
  count: z.number(),
});

export const CatalogResultSchema = z.object({
  dimensions: z.array(CatalogDimensionSchema),
  measures: z.array(CatalogMeasureSchema),
  limits: CatalogLimitsSchema,
  values: z.array(CatalogValueItemSchema).nullable().optional(),
});

// =============================================================================
// Type exports
// =============================================================================

export type CatalogDimension = z.infer<typeof CatalogDimensionSchema>;
export type CatalogMeasure = z.infer<typeof CatalogMeasureSchema>;
export type CatalogLimits = z.infer<typeof CatalogLimitsSchema>;
export type CatalogValueItem = z.infer<typeof CatalogValueItemSchema>;
export type CatalogResult = z.infer<typeof CatalogResultSchema>;
