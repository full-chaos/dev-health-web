/**
 * Validation utilities for GraphQL responses.
 *
 * Uses Zod for runtime validation to catch API contract mismatches.
 */

import { type ZodSchema, ZodError } from "zod";
import { validationFailedMessage } from "@/lib/constants/errors";
import {
  AnalyticsResultSchema,
  CatalogResultSchema,
  type AnalyticsResult,
  type CatalogResult,
} from "./schemas";

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: ValidationError;
}

export interface ValidationError {
  message: string;
  issues: Array<{
    path: string;
    message: string;
  }>;
}

/**
 * Validate data against a Zod schema.
 *
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @returns Validation result with typed data or error
 */
export function validate<T>(
  schema: ZodSchema<T>,
  data: unknown
): ValidationResult<T> {
  try {
    const parsed = schema.parse(data);
    return { success: true, data: parsed };
  } catch (err) {
    if (err instanceof ZodError) {
      return {
        success: false,
        error: {
          message: "Validation failed",
          issues: err.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      };
    }
    return {
      success: false,
      error: {
        message: err instanceof Error ? err.message : "Unknown validation error",
        issues: [],
      },
    };
  }
}

/**
 * Validate and return data, throwing on validation failure.
 *
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @returns Validated and typed data
 * @throws Error if validation fails
 */
export function validateOrThrow<T>(schema: ZodSchema<T>, data: unknown): T {
  const result = validate(schema, data);
  if (!result.success) {
    const issues = result.error?.issues
      .map((i) => `${i.path}: ${i.message}`)
      .join("; ");
    throw new Error(validationFailedMessage(issues || result.error?.message || "Unknown validation error"));
  }
  return result.data!;
}

/**
 * Validate analytics response data.
 *
 * @param data - Raw analytics response data
 * @returns Validation result
 */
export function validateAnalyticsResponse(
  data: unknown
): ValidationResult<AnalyticsResult> {
  return validate(AnalyticsResultSchema, data);
}

/**
 * Validate catalog response data.
 *
 * @param data - Raw catalog response data
 * @returns Validation result
 */
export function validateCatalogResponse(
  data: unknown
): ValidationResult<CatalogResult> {
  return validate(CatalogResultSchema, data);
}

/**
 * Safe parse - returns undefined on failure instead of throwing.
 *
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @returns Parsed data or undefined
 */
export function safeParse<T>(
  schema: ZodSchema<T>,
  data: unknown
): T | undefined {
  const result = schema.safeParse(data);
  return result.success ? result.data : undefined;
}

/**
 * Check if data matches a schema without parsing.
 *
 * @param schema - Zod schema to check against
 * @param data - Data to check
 * @returns True if data matches schema
 */
export function matches<T>(schema: ZodSchema<T>, data: unknown): data is T {
  return schema.safeParse(data).success;
}
