/**
 * Extract a human-readable error message from backend API error responses.
 *
 * The backend returns `detail` in several shapes:
 *
 * 1. **String**: `"Email already registered"` — most auth errors
 * 2. **Object with `violations`**: `{ violations: ["Password must be …"] }` — password policy
 * 3. **Object with `message`**: `{ message: "Too many failed…", retry_after_seconds: 60 }` — login lockout
 * 4. **Pydantic validation array**: `[{ loc: [...], msg: "…", type: "…" }]` — FastAPI auto-validation
 *
 * @param detail - The `detail` field from a backend JSON error response
 * @param fallback - Default message when detail is missing or unparseable
 * @returns A user-friendly error string
 */
export function extractErrorMessage(
  detail: unknown,
  fallback = "Something went wrong",
): string {
  if (detail == null) return fallback

  // Shape 1: plain string
  if (typeof detail === "string") {
    return detail
  }

  if (typeof detail === "object") {
    // Shape 4: Pydantic validation errors — array of { loc, msg, type }
    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) => {
          if (typeof item === "string") return item
          if (typeof item === "object" && item !== null && "msg" in item) {
            return String((item as { msg: unknown }).msg)
          }
          return null
        })
        .filter(Boolean) as string[]

      return messages.length > 0 ? messages.join(". ") : fallback
    }

    const obj = detail as Record<string, unknown>

    // Shape 2: password policy violations — { violations: string[] }
    if ("violations" in obj && Array.isArray(obj.violations)) {
      const violations = obj.violations.filter(
        (v): v is string => typeof v === "string",
      )
      return violations.length > 0 ? violations.join(". ") : fallback
    }

    // Shape 3: lockout/rate-limit — { message: string, retry_after_seconds?: number }
    if ("message" in obj && typeof obj.message === "string") {
      return obj.message
    }
  }

  return fallback
}
