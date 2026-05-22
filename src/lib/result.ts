/**
 * Shared Result / ActionResult types for consistent error handling across
 * server actions, API clients, and data fetching functions.
 *
 * Replaces the duplicated ActionResult<T> defined independently in:
 *   - src/lib/admin/server.ts
 *   - src/lib/billing/actions.ts
 *   - src/app/(app)/superadmin/billing/audit/actions.ts
 *
 * Usage — producing a Result:
 *   return ok(data);          // success
 *   return err("message");    // failure
 *
 * Usage — consuming a Result:
 *   const result = await someAction();
 *   if (result.error) { ... handle error ... }
 *   const data = result.data; // TypeScript narrows correctly
 */

// ============================================================================
// Core type
// ============================================================================

/** Discriminated union for typed error handling without exceptions. */
export type Result<T> = { data: T; error?: never } | { data?: never; error: string };

/**
 * @deprecated Alias kept for backward compatibility with existing callers.
 * Use Result<T> for new code.
 */
export type ActionResult<T> = Result<T>;

// ============================================================================
// Constructor helpers
// ============================================================================

/** Create a successful Result. */
export function ok<T>(data: T): Result<T> {
  return { data };
}

/** Create a failed Result. */
export function err<T = never>(message: string): Result<T> {
  return { error: message };
}

// ============================================================================
// Utility — wraps an async function, catching errors into Result
// ============================================================================

/**
 * Execute an async function and return a Result, catching any thrown errors.
 *
 * @example
 * const result = await withResult(() => fetch("/api/data").then(r => r.json()));
 */
export async function withResult<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return ok(await fn());
  } catch (error) {
    const message = error instanceof Error ? error.message : "An unexpected error occurred";
    return err(message);
  }
}
